/**
 * Sqwod.Life Analytics (v2) — one private founder dashboard for SITE (Umami) +
 * EMAIL (Resend), built to answer "is the engine growing and what's my move?"
 *
 * Layout: ① north-star hero (list size + net-new this week + activity sparkline)
 *         ② this week's move (auto insight)  ③ funnel (visitors → sub rate → share rate)
 *         ④ site detail (KPIs + top pages/sources + events)  ⑤ email (lists + broadcasts)
 *
 * Reads from:
 *   • Self-hosted Umami API (your Railway instance, /api, bearer token from login).
 *   • Resend API (api.resend.com, Bearer) → audience (list) sizes + recent broadcasts.
 *
 * Routes:
 *   GET /            → the dashboard (gated by Cloudflare Access on dash.sqwod.life;
 *                      Worker also re-checks ALLOWED_EMAILS against the Access header).
 *   GET /digest?key= → plain-text weekly digest for the Monday scheduled task. Auth is
 *                      the DIGEST_KEY (so it works on the *.workers.dev URL, which is NOT
 *                      behind Access). Keep that key secret.
 *
 * Secrets: UMAMI_USERNAME, UMAMI_PASSWORD, RESEND_API_KEY, DIGEST_KEY
 * Vars:    UMAMI_URL, UMAMI_WEBSITE_ID, RESEND_AUDIENCE_EN, RESEND_AUDIENCE_DE, ALLOWED_EMAILS
 */

const RESEND_API = 'https://api.resend.com';

// palette — bumped label contrast for readability on near-black
const INK = '#0e0e10', PANEL = '#161619', PANEL2 = '#1d1d21', LINE = '#2c2c33', CHALK = '#fff',
      LBL = '#b4b4bb', SUB = '#8e8e96', G2 = '#c4c4ca', UP = '#3ad17a', DOWN = '#ff6b61', ACCENT = '#fff';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- /digest : key-authed plain-text summary for the scheduled task ---
    if (url.pathname === '/digest') {
      if (!env.DIGEST_KEY || url.searchParams.get('key') !== env.DIGEST_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const d = await gather(env, 7);
      return new Response(digestText(d), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }

    // --- dashboard : gated by Access; re-check the identity header ---
    const who = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allow = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(who)) {
      return new Response('Forbidden — this dashboard is private.', { status: 403 });
    }

    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
    const d = await gather(env, days);
    return new Response(renderPage(d, who), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
};

// ---------- data ----------
async function gather(env, days) {
  const endAt = Date.now();
  const startAt = endAt - days * 86400000;
  const start7 = endAt - 7 * 86400000;

  const umamiUrl = (env.UMAMI_URL || '').replace(/\/$/, '');
  let token = '';
  try {
    const lr = await fetch(`${umamiUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.UMAMI_USERNAME, password: env.UMAMI_PASSWORD }),
    });
    if (lr.ok) token = (await lr.json()).token || '';
  } catch (_) { /* token '' → umami panels show unreachable */ }

  const uHead = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const rHead = { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: 'application/json' };
  const wid = env.UMAMI_WEBSITE_ID;
  const uBase = `${umamiUrl}/api/websites/${wid}`;
  const qs = `startAt=${startAt}&endAt=${endAt}`;

  const jget = async (u, headers) => {
    try { const r = await fetch(u, { headers }); if (!r.ok) return { __err: `${r.status}` }; return await r.json(); }
    catch (e) { return { __err: String(e) }; }
  };

  const [stats, pages, sources, events, series, events7] = await Promise.all([
    jget(`${uBase}/stats?${qs}`, uHead),
    jget(`${uBase}/metrics?${qs}&type=url`, uHead),
    jget(`${uBase}/metrics?${qs}&type=referrer`, uHead),
    jget(`${uBase}/metrics?${qs}&type=event`, uHead),
    jget(`${uBase}/pageviews?${qs}&unit=day&timezone=Europe/Berlin`, uHead),
    jget(`${uBase}/metrics?startAt=${start7}&endAt=${endAt}&type=event`, uHead),
  ]);

  const [audiences, broadcasts] = await Promise.all([
    jget(`${RESEND_API}/audiences`, rHead),
    jget(`${RESEND_API}/broadcasts`, rHead),
  ]);
  const sizeOf = async (id) => {
    if (!id) return null;
    const r = await jget(`${RESEND_API}/audiences/${id}/contacts`, rHead);
    return Array.isArray(r?.data) ? r.data.length : null;
  };
  const [enSize, deSize] = await Promise.all([sizeOf(env.RESEND_AUDIENCE_EN), sizeOf(env.RESEND_AUDIENCE_DE)]);

  const evVal = (arr, name) => { const a = Array.isArray(arr) ? arr : []; const f = a.find((e) => e.x === name); return f ? f.y : 0; };

  return {
    days, stats, pages, sources, events, series, broadcasts,
    enSize, deSize,
    totalList: (enSize || 0) + (deSize || 0),
    weeklySubs: evVal(events7, 'subscribe'),
    weeklyShares: evVal(events7, 'share'),
    subs: evVal(events, 'subscribe'),
    shares: evVal(events, 'share'),
    unlocks: evVal(events, 'report-unlock'),
    moves: evVal(events, 'move-watch'),
    siteErr: stats?.__err,
    emailErr: broadcasts?.__err || audiences?.__err,
  };
}

// ---------- helpers ----------
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (a, b) => (!b ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function deltaTag(cur, prev) {
  if (prev == null || cur == null || prev === 0) return '';
  const dd = Math.round(((cur - prev) / prev) * 100);
  const up = dd >= 0;
  return `<span style="color:${up ? UP : DOWN};font:700 12px/1 ui-monospace,monospace;">${up ? '▲' : '▼'} ${Math.abs(dd)}%</span>`;
}

function moveLine(d) {
  if (d.siteErr) return 'Connect Umami to unlock your weekly read (check the UMAMI_* values).';
  const topSource = (Array.isArray(d.sources) && d.sources[0]) ? d.sources[0].x : null;
  const topPage = (Array.isArray(d.pages) && d.pages[0]) ? d.pages[0].x : null;
  const v = d.stats?.visitors?.value || 0;
  if (d.weeklySubs > 0) {
    let s = `List grew +${d.weeklySubs} this week.`;
    if (topSource) s += ` Top source: ${topSource}.`;
    if (topPage) s += ` Most-read: ${topPage}.`;
    s += ' Double down there.';
    return s;
  }
  if (v > 0) return `${num(v)} visitors, no new subscribers yet this week. Your move: ship today's Daily and push the Move-of-the-Day to convert readers into the list.`;
  return 'Quiet week. Your move: publish and share today’s Daily to start the flywheel.';
}

function kpi(label, value, sub = '', big = false) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};">${label}</div>
    <div style="font:800 ${big ? 40 : 28}px/1.05 -apple-system,system-ui,sans-serif;color:${CHALK};margin-top:10px;letter-spacing:-.02em;">${value}</div>
    <div style="margin-top:8px;min-height:14px;color:${SUB};font:600 12px/1.3 ui-monospace,monospace;">${sub}</div>
  </div>`;
}

function list(title, rows, empty) {
  const body = (Array.isArray(rows) && rows.length)
    ? rows.slice(0, 8).map((r) => `<tr>
        <td style="padding:8px 0;border-top:1px solid ${LINE};font:500 14px/1.4 -apple-system,system-ui,sans-serif;color:${CHALK};max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.x)}</td>
        <td style="padding:8px 0;border-top:1px solid ${LINE};text-align:right;font:700 14px/1 ui-monospace,monospace;color:${G2};">${num(r.y)}</td></tr>`).join('')
    : `<tr><td style="padding:14px 0;color:${SUB};font:400 13px sans-serif;">${empty}</td></tr>`;
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:6px;">${title}</div>
    <table width="100%" cellpadding="0" cellspacing="0">${body}</table></div>`;
}

function sparkline(series) {
  const pts = Array.isArray(series?.pageviews) ? series.pageviews : [];
  if (pts.length < 2) return `<div style="color:${SUB};font:400 12px sans-serif;">Activity chart appears once a few days of data land.</div>`;
  const ys = pts.map((p) => p.y || 0); const max = Math.max(...ys, 1);
  const W = 520, H = 64, step = W / (ys.length - 1);
  const dpath = ys.map((y, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(H - (y / max) * (H - 8) - 4).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><path d="${dpath}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/></svg>`;
}

// ---------- render ----------
function renderPage(d, who) {
  const s = d.stats || {};
  const recent = (Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : []).slice(0, 6).map((b) => `<tr>
      <td style="padding:9px 0;border-top:1px solid ${LINE};font:500 13px/1.4 sans-serif;color:${CHALK};">${esc(b.name || b.id)}</td>
      <td style="padding:9px 0;border-top:1px solid ${LINE};text-align:right;font:700 11px/1 ui-monospace,monospace;color:${G2};text-transform:uppercase;">${esc(b.status || '—')}</td>
    </tr>`).join('') || `<tr><td style="padding:14px 0;color:${SUB};font:400 13px sans-serif;">No broadcasts yet — your sends will list here.</td></tr>`;

  const range = (n, lbl) => `<a href="?days=${n}" style="font:700 12px/1 ui-monospace,monospace;text-decoration:none;padding:7px 13px;border-radius:999px;border:1px solid ${LINE};color:${d.days === n ? INK : G2};background:${d.days === n ? CHALK : 'transparent'};">${lbl}</a>`;

  const weekly = d.siteErr ? '' : (d.weeklySubs >= 0 ? `<span style="color:${UP};font:800 15px/1 ui-monospace,monospace;">+${d.weeklySubs}</span> <span style="color:${SUB};font:600 12px ui-monospace,monospace;">new this week</span>` : '');

  const hero = `<div style="background:linear-gradient(135deg,${PANEL2},${PANEL});border:1px solid ${LINE};border-radius:18px;padding:26px 28px;display:grid;grid-template-columns:1fr 1.1fr;gap:24px;align-items:center;">
    <div>
      <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${LBL};">North star · Total list</div>
      <div style="font:900 56px/1 -apple-system,system-ui,sans-serif;color:${CHALK};letter-spacing:-.03em;margin:12px 0 10px;">${num(d.totalList)}</div>
      <div>${weekly || `<span style="color:${SUB};font:600 12px ui-monospace,monospace;">subscribers across EN + DE</span>`}</div>
    </div>
    <div>
      <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:10px;">Site activity · pageviews/day</div>
      ${sparkline(d.series)}
    </div>
  </div>`;

  const move = `<div style="background:${CHALK};color:${INK};border-radius:14px;padding:16px 20px;margin-top:16px;display:flex;gap:12px;align-items:baseline;">
    <span style="font:800 11px/1.3 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;flex:none;">This week’s move →</span>
    <span style="font:600 15px/1.45 -apple-system,system-ui,sans-serif;">${esc(moveLine(d))}</span>
  </div>`;

  const funnel = d.siteErr ? '' : `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px;">
    ${kpi('Visitors', num(s.visitors?.value), deltaTag(s.visitors?.value, s.visitors?.prev) || `${d.days}-day window`, true)}
    ${kpi('Subscribe rate', pct(d.subs, s.visitors?.value), `${num(d.subs)} subs ÷ visitors`, true)}
    ${kpi('Share rate', pct(d.shares, s.visitors?.value), `${num(d.shares)} shares ÷ visitors`, true)}
  </div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod.Life Analytics</title>
<style>*{box-sizing:border-box}body{margin:0;background:${INK};color:${CHALK};font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif}</style></head>
<body><div style="max-width:1040px;margin:0 auto;padding:30px 20px 60px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font:900 24px/1 sans-serif;letter-spacing:.02em;">SQWOD.LIFE <span style="color:${SUB};font-weight:600;">ANALYTICS</span></div>
      <div style="font:500 12px/1.4 ui-monospace,monospace;color:${SUB};margin-top:8px;">Last ${d.days} days · site + email${who ? ' · ' + esc(who) : ''}</div>
    </div>
    <div style="display:flex;gap:8px;">${range(7, '7d')}${range(30, '30d')}${range(90, '90d')}</div>
  </div>

  ${hero}
  ${move}
  ${funnel}

  <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${LBL};margin:30px 0 14px;">Site detail · Umami</div>
  ${d.siteErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Umami unreachable (${esc(d.siteErr)}). Check UMAMI_USERNAME / UMAMI_PASSWORD / UMAMI_URL.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
    ${kpi('Pageviews', num(s.pageviews?.value), deltaTag(s.pageviews?.value, s.pageviews?.prev))}
    ${kpi('Visits', num(s.visits?.value), deltaTag(s.visits?.value, s.visits?.prev))}
    ${kpi('Bounces', num(s.bounces?.value), deltaTag(s.bounces?.value, s.bounces?.prev))}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
    ${list('Top pages', d.pages, 'No pageviews in this window yet.')}
    ${list('Top sources', d.sources, 'No referrers yet — shares & search will show here.')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px;">
    ${kpi('Subscribes', num(d.subs))}
    ${kpi('Shares', num(d.shares))}
    ${kpi('Report unlocks', num(d.unlocks))}
    ${kpi('Move watches', num(d.moves))}
  </div>`}

  <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${LBL};margin:34px 0 14px;">Email · Resend</div>
  ${d.emailErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Resend unreachable (${esc(d.emailErr)}). Check RESEND_API_KEY.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
    ${kpi('List · EN', num(d.enSize), 'subscribers')}
    ${kpi('List · DE', num(d.deSize), 'subscribers')}
    ${kpi('Total list', num(d.totalList), 'north-star')}
  </div>
  <div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;margin-top:14px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:6px;">Recent broadcasts</div>
    <table width="100%" cellpadding="0" cellspacing="0">${recent}</table>
    <div style="font:400 11px/1.5 sans-serif;color:${SUB};margin-top:12px;">Open / click rates per send live in Resend → Broadcasts (enable Open + Click tracking on the domain). Email→site conversions are the Subscribe / Share events above, driven by the daily UTMs.</div>
  </div>`}

  <div style="font:400 11px/1.6 sans-serif;color:${SUB};margin-top:34px;border-top:1px solid ${LINE};padding-top:16px;">
    Sqwod.Life Analytics · fresh on each load · private via Cloudflare Access. Site = self-hosted Umami · Email = Resend · joined by daily UTMs.
  </div>
</div></body></html>`;
}

function digestText(d) {
  const lines = [];
  lines.push('SQWOD.LIFE ANALYTICS — WEEKLY PULSE (last 7 days)');
  lines.push('');
  lines.push(`List (north star): ${num(d.totalList)}  (+${d.weeklySubs} this week)`);
  if (!d.siteErr) {
    const v = d.stats?.visitors?.value;
    lines.push(`Visitors: ${num(v)} · Subscribe rate: ${pct(d.subs, v)} · Shares: ${num(d.shares)}`);
    const topSource = (Array.isArray(d.sources) && d.sources[0]) ? `${d.sources[0].x} (${d.sources[0].y})` : '—';
    const topPage = (Array.isArray(d.pages) && d.pages[0]) ? `${d.pages[0].x} (${d.pages[0].y})` : '—';
    lines.push(`Top source: ${topSource} · Most-read: ${topPage}`);
  } else {
    lines.push('(Umami unreachable — check UMAMI_* settings.)');
  }
  lines.push('');
  lines.push(`Move: ${moveLine(d)}`);
  return lines.join('\n');
}
