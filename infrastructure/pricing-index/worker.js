/**
 * Sqwod Coach Pricing Index — Cloudflare Worker + D1.
 *
 * Stores anonymous rate rows from the calculator on
 * sqwod.life/en/intelligence/pricing-index/ and serves the aggregate numbers
 * the site shows. No name, no email, no IP, no income goal or costs are stored.
 *
 * Routes:
 *   POST /contribute  ← JSON from the calculator (opt-in box, off by default).
 *                       Origin gate, honeypot, time-on-form, one row per device
 *                       per day (salted daily hash in a separate table, purged
 *                       after 2 days and never joined to the rate rows).
 *   GET  /stats       ← public aggregates. Counts always; medians and
 *                       percentiles only for groups with MIN_CELL+ responses.
 *
 * Bindings: DB (D1 database "sqwod-pricing-index"). Tables are created on first
 * request, so no separate migration step.
 * Vars: ALLOW_ORIGIN, MIN_FILL_MS, MIN_CELL, THROTTLE_SALT.
 */

const STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '));
const FORMATS = new Set(['in_person', 'online', 'hybrid']);
const SETTINGS = new Set(['independent', 'gym', 'both']);
const YEARS = new Set(['lt1', '1-2', '3-5', '6-10', '10+']);
const HOURS = new Set(['lt10', '10-19', '20-29', '30+']);
const SESSION_MIN = 15, SESSION_MAX = 500;   // USD, one 60-minute 1:1 session
const ONLINE_MIN = 20, ONLINE_MAX = 2000;    // USD per client per month

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rates (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     month TEXT NOT NULL,
     state TEXT NOT NULL,
     format TEXT NOT NULL,
     setting TEXT NOT NULL,
     session_rate INTEGER,
     online_monthly INTEGER,
     years TEXT NOT NULL,
     hours TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS throttle (k TEXT PRIMARY KEY, day TEXT NOT NULL)`,
];
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

const cors = (env, methods) => ({
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || 'https://sqwod.life',
  'Access-Control-Allow-Methods': methods,
  'Access-Control-Allow-Headers': 'content-type',
  'Vary': 'Origin',
});
const json = (o, status, headers) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, 'GET, POST, OPTIONS') });
    try {
      if (req.method === 'POST' && url.pathname === '/contribute') return await contribute(req, env);
      if (req.method === 'GET' && url.pathname === '/stats') return await stats(env);
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500, cors(env, 'GET, POST, OPTIONS'));
    }
    return new Response('Not found', { status: 404 });
  },
};

const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; };

async function contribute(req, env) {
  const h = cors(env, 'POST, OPTIONS');
  // Origin gate: only the live site may post.
  const origin = req.headers.get('Origin') || '';
  if (origin !== (env.ALLOW_ORIGIN || 'https://sqwod.life')) return json({ ok: false, error: 'origin' }, 403, h);

  let b;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, h); }

  // Bots: honeypot filled, or form finished faster than a person could.
  if (b.company) return json({ ok: true }, 200, h);
  const ts = Number(b.ts) || 0;
  if (!ts || Date.now() - ts < Number(env.MIN_FILL_MS || 8000)) return json({ ok: true }, 200, h);

  const state = String(b.state || '').toUpperCase();
  const format = String(b.format || '');
  const setting = String(b.setting || '');
  const years = String(b.years || '');
  const hours = String(b.hours || '');
  if (!STATES.has(state) || !FORMATS.has(format) || !SETTINGS.has(setting) || !YEARS.has(years) || !HOURS.has(hours)) {
    return json({ ok: false, error: 'invalid' }, 400, h);
  }
  let session = format === 'online' ? null : int(b.session_rate);
  let online = format === 'in_person' ? null : int(b.online_monthly);
  if (session !== null && (session < SESSION_MIN || session > SESSION_MAX)) session = null;
  if (online !== null && (online < ONLINE_MIN || online > ONLINE_MAX)) online = null;
  if (session === null && online === null) return json({ ok: false, error: 'no_rate' }, 400, h);

  await ensureSchema(env);

  // One row per device per day. Key = daily-salted hash of the IP; stored apart
  // from the rates and deleted after 2 days.
  const day = new Date().toISOString().slice(0, 10);
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const k = await sha256(`${ip}|${day}|${env.THROTTLE_SALT || ''}`);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO throttle (k, day) VALUES (?, ?)').bind(k, day).run();
  if (!ins.meta || ins.meta.changes === 0) return json({ ok: true, dup: true }, 200, h);

  const month = day.slice(0, 7);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO rates (month, state, format, setting, session_rate, online_monthly, years, hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(month, state, format, setting, session, online, years, hours),
    env.DB.prepare('DELETE FROM throttle WHERE day < ?').bind(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)),
  ]);
  return json({ ok: true }, 200, h);
}

// Percentile with linear interpolation on a sorted array.
function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}
function dist(values, minCell) {
  const s = values.filter((v) => v !== null).sort((a, b) => a - b);
  const out = { n: s.length };
  if (s.length >= minCell) {
    out.p10 = pct(s, 0.1); out.p25 = pct(s, 0.25); out.p50 = pct(s, 0.5); out.p75 = pct(s, 0.75); out.p90 = pct(s, 0.9);
  }
  return out;
}

async function stats(env) {
  const h = { ...cors(env, 'GET, OPTIONS'), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' };
  await ensureSchema(env);
  const minCell = Number(env.MIN_CELL || 30);
  const { results } = await env.DB.prepare('SELECT state, format, session_rate, online_monthly FROM rates').all();
  const rows = results || [];

  const byState = {};
  for (const r of rows) (byState[r.state] ||= []).push(r);
  const states = {};
  for (const [st, list] of Object.entries(byState)) {
    states[st] = { n: list.length, session: dist(list.map((r) => r.session_rate), minCell) };
  }
  const byFormat = {};
  for (const f of FORMATS) byFormat[f] = rows.filter((r) => r.format === f).length;

  return json({
    ok: true,
    updated: new Date().toISOString(),
    minCell,
    n: rows.length,
    byFormat,
    session: dist(rows.map((r) => r.session_rate), minCell),        // in-person + hybrid 1:1 session rates
    online: dist(rows.map((r) => r.online_monthly), minCell),        // online + hybrid monthly prices
    states,
  }, 200, h);
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
