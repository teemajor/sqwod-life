#!/usr/bin/env node
/**
 * Sqwod Jobs (Germany): a weekly list of open roles in German fitness and wellness, with
 * pay whenever the employer lists it. Run Thursdays by .github/workflows/jobs.yml.
 *
 *   node automation/jobs.mjs                # fetch every source, write the files below
 *   node automation/jobs.mjs --dry          # fetch and print counts, write nothing
 *   node automation/jobs.mjs --discover     # only find careers pages for jobs-brands.json
 *   node automation/jobs.mjs --since=7      # postings from the last N days (default 14)
 *   node automation/jobs.mjs --selftest     # pay parser, dedupe, location and expiry tests
 *
 * Writes
 *   site/src/data/jobs.json        every job ever seen; `expired: true` after 21 days unseen
 *   automation/jobs-pay.jsonl      one line per job with listed pay (append only, the seed of
 *                                  a Coach Pricing Index DE: never delete lines)
 *   automation/jobs/last-run.json  counts per source, failures per host
 *   automation/jobs-brands.json    careersUrl / ats found by discovery
 *
 * Sources and their order live in automation/jobs-sources.mjs. Every request respects
 * robots.txt, waits one second per host, times out after 10 s and sends the
 * SqwodJobsBot user agent. Indeed and StepStone are registered but switched off.
 *
 * Classification (type, region, employment) and the one-sentence EN + DE summaries come
 * from Claude, same helper and model as deals.mjs, told to answer "unknown" rather than
 * guess. Without ANTHROPIC_API_KEY, city -> region and the source's own employment field
 * are used and summaries stay empty. Pay is parsed in plain code (parsePay).
 *
 * Env: ANTHROPIC_API_KEY (optional), ADZUNA_APP_ID + ADZUNA_APP_KEY (optional), SQWOD_MODEL.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isOnBrand, OFFTOPIC_RX } from './onbrand.mjs';
import { QUERIES, SOURCES, ATS, CAREER_PATHS, CAREER_LINK_RX, USER_AGENT, TIMEOUT_MS, HOST_GAP_MS, EXPIRE_DAYS, DISCOVERY_RETRY_DAYS } from './jobs-sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'site', 'src', 'data', 'jobs.json');
const PAY_LOG = join(__dirname, 'jobs-pay.jsonl');
const RUN_DIR = join(__dirname, 'jobs');
const RUN_LOG = join(RUN_DIR, 'last-run.json');
const BRANDS = join(__dirname, 'jobs-brands.json');
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
export const SINCE = Math.max(1, Math.min(100, Number(args.since) || 14));
const DAY = 86400000;
const iso = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export const REGIONS = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Other DE', 'Remote DE'];
export const TYPES = ['trainer', 'coach', 'studio-manager', 'sales', 'marketing', 'product-tech', 'ops', 'apprenticeship', 'other'];
export const EMPLOYMENT = ['full-time', 'part-time', 'freelance', 'mini-job', 'unknown'];

/* ------------------------------------------------------------------ pay parsing -- */

// German "2.800,50" and English "2,800.50" both appear. A separator followed by exactly
// three digits is a thousands mark; one or two digits after it make it a decimal.
function num(raw) {
  let s = String(raw).trim().replace(/\s/g, '');
  const k = /k$/i.test(s); s = s.replace(/k$/i, '');
  const dec = s.match(/[.,](\d{1,2})$/);
  let n;
  if (dec) n = parseFloat(s.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[1]);
  else n = parseFloat(s.replace(/[.,](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? (k ? n * 1000 : n) : null;
}
const NUM = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?k?|\d+(?:[.,]\d{1,2})?k?`;

/**
 * Pay as the employer wrote it -> { payText, payMin, payMax, payPeriod, payCurrency }.
 * Only numbers that sit next to a euro sign (or EUR / Euro) count as pay, so working hours
 * ("40 Std./Woche"), holidays ("30 Tage Urlaub") and "13 Gehälter" are never read as money.
 * The period comes from the words right after the amount, else from the whole text, else
 * from the size of the figure. Netto and brutto are kept as written in payText; numbers are
 * never converted. No euro amount -> all null except payText.
 */
const CUR = String.raw`(?:€|\beur\b|\beuro\b)`;
const BONUS_RX = /^\s*(?:€|eur|euro)?\s*(?:brutto\s*)?(?:prämie|praemie|bonus|zuschuss|provision|startprämie|wechselprämie|einmalig)/i;
const PER_HOUR = /\b(std|stunde|stündl\w*|stundenlohn|hour|hourly)\b|\/\s*h\b|\bpro\s+h\b|\bper\s+h\b/;
const PER_MONTH = /\b(monat\w*|mtl|monthly|month|minijob|mini-job)\b|\/\s*m\b/;
const PER_YEAR = /\b(jahr\w*|jährl\w*|p\.\s?a\.?|pa|year|annual\w*|annum|jahresgehalt)\b/;
const periodIn = (t) => (PER_HOUR.test(t) ? 'hour' : PER_MONTH.test(t) ? 'month' : PER_YEAR.test(t) ? 'year' : null);

export function parsePay(text) {
  const payText = text == null ? null : String(text).replace(/\s+/g, ' ').trim() || null;
  const none = { payText, payMin: null, payMax: null, payPeriod: null, payCurrency: null };
  if (!payText) return none;
  const s = payText.toLowerCase();
  if (/\b(usd|gbp|chf)\b|[$£]/.test(s)) return none;              // pay in another currency: not comparable
  // working time and leave are not pay: blank them out before reading numbers or periods
  const t = s.replace(new RegExp(`(?:${NUM})\\s*(?:std\\.?|stunden|h)\\s*(?:\\/|pro|die|per|in der|a)?\\s*(?:woche|wöchentl\\w*|week)`, 'g'), ' ')
    .replace(new RegExp(`(?:${NUM})\\s*(?:tage|days)\\b[^,;]*`, 'g'), ' ')
    .replace(new RegExp(`(?:${NUM})\\s*(?:gehälter|monatsgehälter)`, 'g'), ' ')
    .replace(new RegExp(`(?<![€\\d.,])(?:${NUM})\\s*(?:std\\.?|stunden)(?![\\w])`, 'g'), ' ');   // "20 Std." = hours (pay says "€/Std.")
  let min = null, max = null, end = -1, start = -1;
  const range = t.match(new RegExp(`(?:${CUR}\\s*)?(${NUM})\\s*${CUR}?\\s*(?:-|–|—|\\bbis\\b(?!\\s*zu)|\\bto\\b)\\s*${CUR}?\\s*(${NUM})\\s*(${CUR})?`, 'i'));
  const rangeHasCur = range && new RegExp(CUR, 'i').test(range[0] + t.slice(range.index + range[0].length, range.index + range[0].length + 3)) ;
  if (range && rangeHasCur) {
    min = num(range[1]); max = num(range[2]); start = range.index; end = range.index + range[0].length;
  } else {
    const rx = new RegExp(`${CUR}\\s*(${NUM})|(${NUM})\\s*${CUR}`, 'gi');
    for (const m of t.matchAll(rx)) {
      const after = t.slice(m.index + m[0].length);
      if (BONUS_RX.test(after)) continue;                          // "1.000 € Prämie" is a bonus, not pay
      min = max = num(m[1] || m[2]); start = m.index; end = m.index + m[0].length; break;
    }
  }
  if (min == null && max == null) return none;
  const before = t.slice(Math.max(0, start - 14), start);
  if (min === max) {
    if (/\b(ab|from|mindestens|at least)\s*$/.test(before)) max = null;
    else if (/\b(bis zu|up to|max\.?|maximal)\s*$/.test(before)) min = null;
  }
  if (min != null && max != null && max < min) [min, max] = [max, min];
  const period = periodIn(t.slice(end, end + 30)) || periodIn(t) || (((max ?? min) <= 150) ? 'hour' : ((max ?? min) <= 15000) ? 'month' : 'year');
  return { payText, payMin: min, payMax: max, payPeriod: period, payCurrency: 'EUR' };
}

/* ------------------------------------------------------------ places and regions -- */

const CITY_REGION = [
  [/\bberlin\b/i, 'Berlin'], [/\bhamburg\b/i, 'Hamburg'], [/\bm(ü|ue|u)nchen\b|\bmunich\b/i, 'München'],
  [/\bk(ö|oe|o)ln\b|\bcologne\b/i, 'Köln'], [/\bfrankfurt(?!\s*\(?\s*oder)/i, 'Frankfurt'],
];
const DE_PLACE_RX = /\b(germany|deutschland|berlin|hamburg|m(ü|ue|u)nchen|munich|k(ö|oe|o)ln|cologne|frankfurt|d(ü|ue|u)sseldorf|stuttgart|leipzig|dresden|hannover|n(ü|ue|u)rnberg|bremen|essen|dortmund|bonn|mannheim|karlsruhe|wiesbaden|mainz|augsburg|freiburg|heidelberg|potsdam|m(ü|ue|u)nster|bochum|duisburg|kiel|rostock|regensburg)\b/i;
const REMOTE_RX = /\b(remote|home ?office|homeoffice|anywhere|fully distributed)\b/i;

/** Region from a city or location string; null when the place is not in Germany. */
export function regionFor(location, { country = '' } = {}) {
  const s = `${location || ''} ${country || ''}`;
  const remote = REMOTE_RX.test(s);
  for (const [rx, r] of CITY_REGION) if (rx.test(s)) return r;
  const de = DE_PLACE_RX.test(s) || /^(de|deu)$/i.test(String(country).trim());
  if (remote) return de ? 'Remote DE' : null;
  return de ? 'Other DE' : null;
}

/* --------------------------------------------------------------- polite fetching -- */

const lastHit = new Map();          // host -> time of last request
const robotsCache = new Map();      // host -> Disallow prefixes for us (or null = all allowed)
const blocked = new Set();          // hosts that answered 403 on a disabled-by-terms source
const down = new Map();             // host -> consecutive network failures; 3 in a row = skip the host this run
export const runLog = { startedAt: new Date().toISOString(), sinceDays: SINCE, sources: {}, hosts: {}, notes: [] };
const hostLog = (host) => {
  const h = (runLog.hosts[host] ||= { requests: 0, failures: 0, errors: [] });
  if (h.errors.length > 10) h.errors.length = 10;          // keep the run log small
  return h;
};

async function rawFetch(url, opts = {}) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) || 0) + HOST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': USER_AGENT, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

/** robots.txt rules for user agents "*" and "SqwodJobsBot". */
export function robotsRules(txt) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const line of String(txt).split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (k === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'disallow' && v) cur.disallow.push(v);
    if (k === 'allow' && v) cur.allow.push(v);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.startsWith('sqwodjobsbot')));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return { disallow: use.flatMap((g) => g.disallow), allow: use.flatMap((g) => g.allow) };
}
const pathMatch = (rule, path) => {
  const rx = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return rx.test(path);
};
export function robotsAllows(rules, path) {
  if (!rules) return true;
  const longest = (list) => Math.max(-1, ...list.filter((r) => pathMatch(r, path)).map((r) => r.length));
  return longest(rules.allow) >= longest(rules.disallow);
}
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    let rules = null;
    try {
      const r = await rawFetch(`${u.protocol}//${u.host}/robots.txt`);
      if (r.ok) rules = robotsRules(await r.text());
      else if (r.status === 401 || r.status === 403 || r.status >= 500) rules = { disallow: ['/'], allow: [] };   // locked or broken robots.txt = keep out (RFC 9309)
    } catch (e) { rules = { disallow: ['/'], allow: [] }; down.set(u.host, (down.get(u.host) || 0) + 1); hostLog(u.host).errors.push(`robots.txt: ${e.cause?.code || e.message}`.slice(0, 160)); }
    robotsCache.set(u.host, rules);
  }
  return robotsAllows(robotsCache.get(u.host), u.pathname + u.search);
}

/** GET with robots, rate limit and timeout. Returns { ok, status, text } and never throws. */
/** `api: true` for documented APIs and public job-board feeds (BA, Adzuna, ATS JSON/XML):
 *  robots.txt is written for crawlers, and these hosts often disallow everything there
 *  although the API is meant to be called. Web pages (career sites, DSSV, Fitt) always
 *  go through robots.txt. Rate limit, timeout and user agent apply to both. */
async function get(url, { headers = {}, stopOn403 = false, api = false } = {}) {
  const host = new URL(url).host;
  const h = hostLog(host);
  if (blocked.has(host)) return { ok: false, status: 403, text: '' };
  if ((down.get(host) || 0) >= 3) return { ok: false, status: 0, text: '', down: true };
  if (!api && !(await allowed(url))) { h.errors.push(`robots.txt disallows ${new URL(url).pathname}`); return { ok: false, status: 0, text: '', robots: true }; }
  h.requests++;
  try {
    const r = await rawFetch(url, { headers });
    const text = await r.text();
    down.set(host, 0);
    if (!r.ok) { h.failures++; h.errors.push(`HTTP ${r.status} ${new URL(url).pathname}`.slice(0, 160)); if (r.status === 403 && stopOn403) blocked.add(host); }
    return { ok: r.ok, status: r.status, text };
  } catch (e) {
    h.failures++; h.errors.push(`${e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message)}`.slice(0, 160));
    down.set(host, (down.get(host) || 0) + 1);
    if (down.get(host) === 3) h.errors.push('3 network failures in a row: host skipped for the rest of this run');
    return { ok: false, status: 0, text: '' };
  }
}
const getJson = async (url, opts) => { const r = await get(url, opts); if (!r.ok) return null; try { return JSON.parse(r.text); } catch { return null; } };

/* ----------------------------------------------------------------- normalising -- */

const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(m\/w\/d\)|\(w\/m\/d\)|\(m\/f\/d\)|\(d\/m\/w\)|\(all genders?\)|\(gn\)|\(m\/w\)|\*in\b|:in\b/g, '')
  .replace(/\b(gmbh|ag|ug|kg|e\.?v\.?|ltd|inc|co)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const dedupeKey = (j) => `${norm(j.employer)}|${norm(j.title)}|${norm(j.city)}`;
const idFor = (source, raw) => `${source}-${String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
const hasPay = (j) => j.payMin != null || j.payMax != null;

/** Same employer + title + city across sources: keep the one with pay, else the earliest posting. */
export function dedupe(jobs) {
  const by = new Map();
  for (const j of jobs) {
    const k = dedupeKey(j);
    const cur = by.get(k);
    if (!cur) { by.set(k, j); continue; }
    const better = hasPay(j) !== hasPay(cur) ? hasPay(j) : (j.postedAt || '9999') < (cur.postedAt || '9999');
    if (better) by.set(k, j);
  }
  return [...by.values()];
}

const toNum = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const safeDate = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? iso(t) : null; };
/** Only absolute http(s) links reach the page; a relative link is resolved against where it was found. */
const safeUrl = (u, base) => { try { const x = new URL(u, base); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
function job(source, f) {
  const raw = f.pay ?? parsePay(f.payText);
  const pay = { ...raw, payMin: toNum(raw.payMin), payMax: toNum(raw.payMax) };
  return {
    id: idFor(source, f.rawId), title: clean(f.title), employer: clean(f.employer) || null, employerSite: f.employerSite || null,
    city: clean(f.city) || null, region: f.region ?? regionFor(f.city, { country: f.country }), type: f.type || null,
    employment: f.employment || 'unknown',
    payText: pay.payText, payMin: pay.payMin, payMax: pay.payMax, payPeriod: pay.payPeriod, payCurrency: pay.payCurrency,
    url: safeUrl(f.url, f.base), source, postedAt: f.postedAt ? safeDate(f.postedAt) : null, lang: f.lang || 'de',
    description: clean(f.description).slice(0, 1500) || null,
  };
}
const EMP_MAP = [[/mini|geringf/i, 'mini-job'], [/frei|freelan|contract(or)?\b|selbst|honorar/i, 'freelance'], [/teil|part/i, 'part-time'], [/voll|full|permanent/i, 'full-time']];
const empOf = (s) => (EMP_MAP.find(([rx]) => rx.test(String(s || ''))) || [null, 'unknown'])[1];

/* ------------------------------------------------------------------- sources -- */

/** One Bundesagentur search item -> job fields. v6 (seen 31 Oct 2026) uses stellenangebotsTitel,
 *  firma, referenznummer, stellenlokationen[].adresse, datumErsteVeroeffentlichung, the
 *  arbeitszeit* flags and verguetungsangabe (a category such as KEINE_ANGABEN, never a figure);
 *  the documented v4 names are kept as fallbacks. `emp` is the employment of the search pass. */
export function baItem(s, emp = 'unknown') {
  const loc = (Array.isArray(s.stellenlokationen) && s.stellenlokationen[0]?.adresse) || s.arbeitsort || (Array.isArray(s.arbeitsorte) ? s.arbeitsorte[0] : null) || {};
  const land = String(loc.land || '').trim();
  const refnr = s.referenznummer || s.refnr || s.hashId;
  const title = s.stellenangebotsTitel || s.titel || s.stellentitel || s.hauptberuf || s.beruf;
  if (!refnr || !title) return null;
  if (land && !/^(deutschland|germany|de|deu)$/i.test(land)) return { foreign: true };
  // "Cham, Oberpfalz" -> "Cham"
  const city = String(loc.ort || loc.stadt || '').split(',')[0].trim() || null;
  const vz = s.arbeitszeitVollzeit === true;
  const tz = ['arbeitszeitTeilzeitVormittag', 'arbeitszeitTeilzeitNachmittag', 'arbeitszeitTeilzeitAbend', 'arbeitszeitTeilzeitFlexibel', 'arbeitszeitTeilzeit'].some((k) => s[k] === true);
  const employment = emp === 'mini-job' ? 'mini-job' : vz && !tz ? 'full-time' : tz && !vz ? 'part-time' : emp;
  return {
    payCategory: String(s.verguetungsangabe || 'none'),
    fields: {
      rawId: refnr, title, employer: s.firma || s.arbeitgeber || s.arbeitgeberName, city, country: 'DE', employment,
      url: s.externeUrl || null,
      postedAt: s.datumErsteVeroeffentlichung || s.veroeffentlichungszeitraum?.von || s.aktuelleVeroeffentlichungsdatum || null,
      payText: null,
    },
  };
}

// The search list only says WHETHER pay is given (verguetungsangabe); the figure is on the
// job's detail page. Category -> pay period.
const BA_PAY_PERIOD = { STUNDENLOHN: 'hour', MONATSGEHALT: 'month', MONATSLOHN: 'month', JAHRESGEHALT: 'year' };
const BA_DETAIL_MAX = 60;

/** Pay from one Bundesagentur job detail. Reads every field whose name sounds like pay
 *  (verguetung, gehalt, lohn, entgelt, salary): numbers as min/max, text through parsePay.
 *  The search category sets the period when the detail does not. A collective-agreement
 *  grade without an amount ("Entgeltgruppe 13 TV-L") stays text only: no figure is invented. */
export function baDetailPay(detail, category) {
  const texts = []; const nums = [];
  const walk = (x, key = '') => {
    if (x == null) return;
    if (Array.isArray(x)) return x.forEach((v) => walk(v, key));
    if (typeof x === 'object') return Object.entries(x).forEach(([k, v]) => walk(v, /verguet|gehalt|lohn|entgelt|salar|pay/i.test(k) ? k : key ? `${key}.${k}` : ''));
    if (!/verguet|gehalt|lohn|entgelt|salar|pay/i.test(key)) return;
    if (typeof x === 'string' && /^[A-Z_]+$/.test(x.trim())) return;   // enums such as GEHALTSSPANNE, FESTGEHALT, STUNDENLOHN
    if (typeof x === 'number' && x > 0) nums.push({ key, n: x });
    else if (typeof x === 'string' && x.trim()) texts.push(x.trim());
  };
  walk(detail);
  const period = BA_PAY_PERIOD[category] || null;
  const payText = texts.join(' · ').slice(0, 200) || null;
  if (nums.length) {
    const lo = nums.find((v) => /von|min|ab|unten|lower/i.test(v.key))?.n ?? Math.min(...nums.map((v) => v.n));
    const hi = nums.find((v) => /bis|max|oben|upper/i.test(v.key))?.n ?? Math.max(...nums.map((v) => v.n));
    const p = period || (hi <= 150 ? 'hour' : hi <= 15000 ? 'month' : 'year');
    const fmt = (n) => `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`;
    const unit = { hour: 'Std.', month: 'Monat', year: 'Jahr' }[p];
    return { payText: payText || `${lo !== hi ? `${fmt(lo)} – ${fmt(hi)}` : fmt(lo)} / ${unit} (Arbeitsagentur)`, payMin: lo, payMax: hi, payPeriod: p, payCurrency: 'EUR' };
  }
  const parsed = parsePay(payText);
  if (parsed.payMin != null || parsed.payMax != null) {
    // trust the category's period over the guess from the figure's size, unless the text named one
    const named = /std|stunde|monat|jahr|p\.\s?a|hour|month|year/i.test(payText || '');
    return { ...parsed, payPeriod: named ? parsed.payPeriod : period || parsed.payPeriod };
  }
  return { payText, payMin: null, payMax: null, payPeriod: null, payCurrency: null };
}

/** Fetch detail pages for postings whose category says pay is given and put the pay on those
 *  rows. Tries the documented v4 path, then v6, with base64(refnr); keeps whichever answers. */
async function fetchBaDetailPay(src, out, wanted, headers, diag) {
  const d = (diag.detail = { wanted: wanted.size, fetched: 0, withFigure: 0, textOnly: 0, failed: 0 });
  if (!wanted.size) return;
  const base = src.url.replace(/\/pc\/v\d+\/jobs$/, '');
  let path = null;
  for (const [refnr, category] of [...wanted].slice(0, BA_DETAIL_MAX)) {
    const code = Buffer.from(refnr).toString('base64');
    let detail = null;
    for (const pth of path ? [path] : ['/pc/v4/jobdetails/', '/pc/v6/jobdetails/']) {
      detail = await getJson(`${base}${pth}${encodeURIComponent(code)}`, { api: true, headers });
      if (detail && typeof detail === 'object') { path = pth; break; }
    }
    if (!detail) { d.failed++; continue; }
    d.fetched++;
    if (!d.path) { d.path = path; d.sampleKeys = Object.keys(detail).slice(0, 40); }
    const pay = baDetailPay(detail, category);
    if (pay.payMin != null || pay.payMax != null) d.withFigure++; else if (pay.payText) d.textOnly++;
    if (pay.payText && (d.samples ||= []).length < 6) d.samples.push(pay.payText);
    for (const j of out) if (j.id === idFor('ba', refnr)) Object.assign(j, pay);
  }
}

export async function fromBA(src) {
  const out = []; const since = SINCE;
  const payWanted = new Map();   // refnr -> pay category, for postings that say a figure is given
  const headers = { 'X-API-Key': src.apiKey, accept: 'application/json' };
  // What the API sent back, for the run log: v6 answered 200 with no postings on 31 Oct 2026.
  const diag = (runLog.sources.ba.diag = { tried: [] });
  // v6 returns the postings as `ergebnisliste` (seen 31 Oct 2026); the docs and v4 say `stellenangebote`.
  const listOf = (j) => (Array.isArray(j?.ergebnisliste) ? j.ergebnisliste : Array.isArray(j?.stellenangebote) ? j.stellenangebote : []);
  const shape = (j) => (j && typeof j === 'object' ? { keys: Object.keys(j).slice(0, 12), maxErgebnisse: j.maxErgebnisse ?? null, items: listOf(j).length } : { body: String(j).slice(0, 80) });
  // Pick the first endpoint whose probe ("Fitnesstrainer", nationwide) returns postings.
  let base = null;
  for (const url of src.endpoints || [src.url]) {
    const probe = new URLSearchParams({ was: QUERIES[0], veroeffentlichtseit: String(since), size: '50', page: '1' });
    const j = await getJson(`${url}?${probe}`, { api: true, headers });
    diag.tried.push({ url: url.replace(/^.*jobsuche-service/, ''), ...shape(j), sample: listOf(j)[0] || null });
    if (listOf(j).length) { base = url; break; }
  }
  if (!base) { runLog.notes.push(`Bundesagentur: no endpoint returned postings (${diag.tried.map((t) => `${t.url}: ${t.items ?? '?'} items, keys ${(t.keys || []).join('/')}`).join('; ')})`); return []; }
  diag.used = base.replace(/^.*jobsuche-service/, '');
  diag.itemKeys = Object.keys(diag.tried[diag.tried.length - 1].sample || {});
  // One pass per working-time filter tags employment from the source itself; a last
  // unfiltered pass catches postings with none of them.
  const passes = [['vz', 'full-time'], ['tz', 'part-time'], ['mj', 'mini-job'], [null, 'unknown']];
  for (const q of QUERIES) {
    for (const [az, emp] of passes) {
      for (let page = 1; page <= 8; page++) {
        const p = new URLSearchParams({ was: q, veroeffentlichtseit: String(since), size: '50', page: String(page), angebotsart: '1' });
        if (az) p.set('arbeitszeit', az);
        const j = await getJson(`${base}?${p}`, { api: true, headers });
        const list = listOf(j);
        for (const s of list) {
          const item = baItem(s, emp);
          if (!item) { diag.skippedNoId = (diag.skippedNoId || 0) + 1; continue; }
          if (item.foreign) continue;
          diag.pay = diag.pay || {}; diag.pay[item.payCategory] = (diag.pay[item.payCategory] || 0) + 1;
          out.push(job('ba', { ...item.fields, url: item.fields.url || src.detail(item.fields.rawId) }));
          if (BA_PAY_PERIOD[item.payCategory]) payWanted.set(item.fields.rawId, item.payCategory);
        }
        if (list.length < 50) break;
      }
    }
  }
  await fetchBaDetailPay(src, out, payWanted, headers, diag);
  return out;
}

/** Adzuna's salary_min/max carry no unit: they are usually yearly, but some ads come through as
 *  the hourly or monthly figure. The period is read from the size: up to 150 € hourly, up to
 *  6,000 € monthly (fitness pay above that per month is rare, while a part-time or mini-job
 *  year, 6,456 € and up, sits above it), else yearly. Checked on the first 17 rows (31 Oct 2026). */
export function adzunaPay(min, max) {
  const lo = min || null, hi = max || null, ref = hi ?? lo;
  const payPeriod = ref <= 150 ? 'hour' : ref <= 6000 ? 'month' : 'year';
  const unit = { hour: 'Std.', month: 'Monat', year: 'Jahr' }[payPeriod];
  const fmt = (n) => `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`;
  const payText = `${lo && hi && lo !== hi ? `${fmt(lo)} – ${fmt(hi)}` : fmt(hi ?? lo)} / ${unit} (Adzuna)`;
  return { payText, payMin: lo, payMax: hi, payPeriod, payCurrency: 'EUR' };
}
/** Adzuna's area runs [country, state, (district or city), (city or neighbourhood)…]: Berlin
 *  and Hamburg roles come as ["Deutschland", "Berlin", "Schöneberg"]. The region is read from
 *  the whole list; the city shown is the big city when there is one, else the most specific
 *  place, without "(Kreis)". */
export function adzunaPlace(loc = {}) {
  const area = (loc.area || []).filter(Boolean);
  const region = regionFor(`${area.join(' ')} ${loc.display_name || ''}`, { country: 'DE' });
  const big = { Berlin: 'Berlin', Hamburg: 'Hamburg', München: 'München', Köln: 'Köln', Frankfurt: 'Frankfurt am Main' }[region];
  const last = area.length > 1 ? area[area.length - 1] : (loc.display_name || '').split(',')[0];
  return { region, city: big || String(last || '').replace(/\s*\(Kreis\)$/, '').trim() || null };
}

async function fromAdzuna(src) {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) { runLog.notes.push('Adzuna skipped: ADZUNA_APP_ID / ADZUNA_APP_KEY not set.'); return null; }
  const out = [];
  for (const q of QUERIES) {
    for (let page = 1; page <= 4; page++) {
      const p = new URLSearchParams({ app_id: id, app_key: key, what: q, max_days_old: String(SINCE), results_per_page: '50', 'content-type': 'application/json' });
      const j = await getJson(`${src.url}/${page}?${p}`, { api: true });
      const list = j?.results || [];
      for (const r of list) {
        // Adzuna estimates pay when the ad has none (salary_is_predicted "1"): that is not listed pay.
        const listed = String(r.salary_is_predicted) === '0' && (r.salary_min || r.salary_max);
        const pay = listed ? adzunaPay(r.salary_min, r.salary_max) : parsePay(null);
        const where = adzunaPlace(r.location);
        out.push(job('adzuna', {
          rawId: r.id, title: r.title, employer: r.company?.display_name, city: where.city, region: where.region, country: 'DE',
          employment: r.contract_time === 'part_time' ? 'part-time' : r.contract_time === 'full_time' ? 'full-time' : 'unknown',
          url: r.redirect_url, postedAt: r.created, pay, description: r.description,
        }));
      }
      if (list.length < 50) break;
    }
  }
  return out;
}

/** JobPosting JSON-LD blocks in a page (also inside @graph). */
export function jsonLdJobs(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d; try { d = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if ([].concat(x['@type']).includes('JobPosting')) out.push(x); if (x['@graph']) walk(x['@graph']); };
    walk(d);
  }
  return out;
}
function fromJsonLd(source, p, fallbackUrl, extra = {}) {
  const loc = [].concat(p.jobLocation || [])[0]?.address || {};
  const remote = /telecommute/i.test(p.jobLocationType || '');
  const country = loc.addressCountry?.name || loc.addressCountry || [].concat(p.applicantLocationRequirements || [])[0]?.name || '';
  const sal = p.baseSalary?.value || {};
  const unit = String(sal.unitText || '').toUpperCase();
  const listed = (sal.minValue || sal.maxValue || sal.value) && (!p.baseSalary.currency || p.baseSalary.currency === 'EUR');
  const pay = listed ? { payText: clean(`${sal.minValue ?? sal.value}${sal.maxValue ? '–' + sal.maxValue : ''} ${p.baseSalary.currency || 'EUR'} / ${unit || '?'}`), payMin: sal.minValue ?? sal.value ?? null, payMax: sal.maxValue ?? sal.value ?? null,
    payPeriod: unit === 'HOUR' ? 'hour' : unit === 'MONTH' ? 'month' : unit === 'YEAR' ? 'year' : null, payCurrency: 'EUR' } : parsePay(null);
  const reqs = [].concat(p.applicantLocationRequirements || []).map((x) => x?.name || x?.address?.addressCountry || x).join(' ');
  const allowsDE = /\b(germany|deutschland|de|deu)\b/i.test(`${reqs} ${typeof country === 'string' ? country : ''}`);
  const j = job(source, {
    base: fallbackUrl,
    rawId: p.identifier?.value || p.url || `${p.title}-${loc.addressLocality}`, title: p.title, employer: p.hiringOrganization?.name || extra.employer,
    employerSite: p.hiringOrganization?.sameAs || extra.employerSite, city: loc.addressLocality || (remote ? 'Remote' : ''), country,
    region: regionFor(`${loc.addressLocality || ''} ${remote ? 'remote' : ''}`, { country }),
    employment: empOf([].concat(p.employmentType || []).join(' ')), url: p.url || fallbackUrl, postedAt: p.datePosted, pay, description: p.description,
  });
  j._remoteDE = remote && allowsDE;          // read by fromFitt only, never written to the file
  return j;
}

/** An HTML job board: JobPosting JSON-LD on the page, else job links and their detail pages. */
async function fromHtmlBoard(src, { maxDetail = 40 } = {}) {
  const r = await get(src.url, { stopOn403: true });
  if (!r.ok) return [];
  let posts = jsonLdJobs(r.text).map((p) => fromJsonLd(src.id, p, src.url));
  if (!posts.length) {
    const base = new URL(src.url);
    const links = [...new Set([...r.text.matchAll(/href="([^"#]+)"/gi)].map((m) => { try { return new URL(m[1], base).href; } catch { return null; } })
      .filter((u) => u && new URL(u).host === base.host && /job|stelle|karriere|career/i.test(new URL(u).pathname) && u !== src.url))].slice(0, maxDetail);
    for (const u of links) { const d = await get(u, { stopOn403: true }); if (d.ok) posts.push(...jsonLdJobs(d.text).map((p) => fromJsonLd(src.id, p, u))); }
  }
  return posts;
}

async function fromFitt(src) {
  // A US board: keep only roles that explicitly allow Germany.
  const all = await fromHtmlBoard(src);
  // Germany must be in the posting's structured location (applicantLocationRequirements or
  // the address country) and the job must be remote; free text does not count.
  return all.filter((j) => j._remoteDE).map((j) => ({ ...j, region: 'Remote DE' }));
}

/* ---- brand career pages ---- */

function atsFrom(html, baseUrl) {
  const hay = `${baseUrl} ${html}`;
  for (const a of ATS) { const m = hay.match(a.match); if (m) return { type: a.type, id: m[1] }; }
  return null;
}
async function discoverBrand(b) {
  const site = b.site.replace(/\/$/, '');
  const home = await get(site + '/');
  if (home.status === 0 && !home.robots) return { careersUrl: null, ats: null, unreachable: true };   // try again next run
  let ats = home.ok ? atsFrom(home.text, site) : null;
  let careersUrl = null;
  if (home.ok) {
    for (const m of home.text.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (CAREER_LINK_RX.test(clean(m[2]))) { try { careersUrl = new URL(m[1], site + '/').href; break; } catch { /* bad href */ } }
    }
  }
  const tries = careersUrl ? [careersUrl] : CAREER_PATHS.map((p) => site + p);
  for (const u of tries) {
    if (ats && careersUrl) break;
    const r = await get(u);
    if (!r.ok) continue;
    careersUrl ||= u;
    ats ||= atsFrom(r.text, u);
    if (ats) break;
  }
  return { careersUrl, ats };
}
async function discover(brands, { force = false } = {}) {
  let found = 0, tried = 0;
  for (const b of brands) {
    if (!b.site) continue;
    if (b.careersUrl && !force) continue;
    if (!force && b.careersChecked && Date.now() - Date.parse(b.careersChecked) < DISCOVERY_RETRY_DAYS * DAY) continue;
    tried++;
    const d = await discoverBrand(b);
    if (d.unreachable) continue;          // network trouble is not "no careers page": no retry delay
    b.careersChecked = iso();
    if (d.careersUrl) { b.careersUrl = d.careersUrl; found++; }
    if (d.ats) b.ats = d.ats;
  }
  runLog.discovery = { tried, found, missing: brands.filter((b) => !b.careersUrl).map((b) => b.brand) };
  return brands;
}

async function fromAts(b) {
  const def = ATS.find((a) => a.type === b.ats?.type);
  const brand = { employer: b.brand, employerSite: b.site };
  if (!def?.feed) {
    // join, softgarden or an own careers page: JobPosting JSON-LD only.
    if (!b.careersUrl) return [];
    const r = await get(b.careersUrl);
    return r.ok ? jsonLdJobs(r.text).map((p) => fromJsonLd('career-page', p, b.careersUrl, brand)) : [];
  }
  const url = def.feed(b.ats.id);
  const mk = (f) => job('career-page', { ...f, employer: b.brand, employerSite: b.site });
  if (def.type === 'personio') {
    const r = await get(url, { api: true }); if (!r.ok) return [];
    return [...r.text.matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, x]) => {
      const tag = (t) => clean((x.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]);
      return mk({ rawId: `${b.ats.id}-${tag('id')}`, title: tag('name'), city: tag('office'), country: 'DE', employment: empOf(`${tag('employmentType')} ${tag('schedule')}`),
        url: `https://${b.ats.id}.jobs.personio.de/job/${tag('id')}`, postedAt: tag('createdAt'), payText: null });
    });
  }
  const j = await getJson(url, { api: true }); if (!j) return [];
  if (def.type === 'greenhouse') return (j.jobs || []).map((p) => mk({ rawId: `${b.ats.id}-${p.id}`, title: p.title, city: p.location?.name, url: p.absolute_url, postedAt: p.first_published || p.updated_at, description: p.content }));
  if (def.type === 'lever') return (Array.isArray(j) ? j : []).map((p) => {
    const sr = p.salaryRange;
    const pay = sr && sr.currency === 'EUR' ? { payText: `${sr.min}–${sr.max} EUR / ${sr.interval}`, payMin: sr.min, payMax: sr.max, payPeriod: /hour/i.test(sr.interval) ? 'hour' : /month/i.test(sr.interval) ? 'month' : 'year', payCurrency: 'EUR' } : parsePay(null);
    return mk({ rawId: `${b.ats.id}-${p.id}`, title: p.text, city: p.categories?.location, employment: empOf(p.categories?.commitment), url: p.hostedUrl, postedAt: p.createdAt, pay, description: p.descriptionPlain });
  });
  if (def.type === 'ashby') return (j.jobs || []).map((p) => mk({ rawId: `${b.ats.id}-${p.id || p.jobUrl}`, title: p.title, city: [p.location, p.isRemote ? 'remote' : ''].join(' '), employment: empOf(p.employmentType), url: p.jobUrl, postedAt: p.publishedAt, payText: p.compensation?.compensationTierSummary || null, description: p.descriptionPlain }));
  if (def.type === 'smartrecruiters') return (j.content || []).map((p) => mk({ rawId: `${b.ats.id}-${p.id}`, title: p.name, city: p.location?.city, country: p.location?.country, employment: empOf(p.typeOfEmployment?.label), url: `https://jobs.smartrecruiters.com/${b.ats.id}/${p.id}`, postedAt: p.releasedDate }));
  if (def.type === 'workable') return (j.jobs || []).map((p) => mk({ rawId: `${b.ats.id}-${p.shortcode || p.url}`, title: p.title, city: p.city, country: p.country, employment: empOf(p.employment_type), url: p.url, postedAt: p.published_on }));
  return [];
}
async function fromBrands(brands) {
  const out = [];
  for (const b of brands) if (b.careersUrl || b.ats) out.push(...(await fromAts(b)));
  // Most brands are US: only roles placed in Germany count.
  return out.filter((j) => j.region);
}

/* --------------------------------------------------------- on-brand and classify -- */

const DROP_TITLE_RX = /(reinig|putzkraft|cleaner|cleaning|hausmeister)/i;
// German job titles glue words together ("Fitnesstrainer", "Studioleiter"), which the
// word-bounded isOnBrand vocabulary misses. These compounds count too; OFFTOPIC still blocks.
const JOB_COMPOUND_RX = /(fitness|trainer|studio|yoga|pilates|physio|\bsport\w*|wellness|ernährungsberat|personaltrain)/i;
const FITNESS_CTX_RX = /(fitness|gym|studio|sport|yoga|pilates|physio|reha|wellness|gesundheit|kurs|aqua|bäder|\bbad\b|schwimm|sauna|\bspa\b|therm|club|personal ?train|ernährung|bewegung|athlet|crossfit|hyrox|boulder|kletter|tanz|dance|massage|vital|body|rücken|mma|kampfsport|box|martial|longevity|biohack|kieser|mrs\.? ?sporty|mcfit|injoy|clever ?fit|fitx|john reed|easyfit|kraftwerk|holmes|urban sports)/i;
// …but not the trainers and "sport" jobs of other trades that BA keyword search returns
const JOB_DENY_RX = /\b(sap|it|software|erste[- ]hilfe|lkw|fahrer\w*|transport\w*|pflege\w*|kranken\w*|verkehr\w*|fahrlehrer\w*|hunde\w*|sprach\w*|excel|vertriebstrainer\w*|verkaufstrainer\w*)\b/i;
/** Off-topic gate. Brand career pages are on-brand by the list itself (they are fitness and
 *  wellness companies, so a "Software Engineer" there counts); everything else must pass isOnBrand. */
export function keepJob(j) {
  if (DROP_TITLE_RX.test(j.title)) return false;
  if (j.source === 'career-page') return true;
  const text = `${j.title} ${j.employer || ''}`;
  if (JOB_DENY_RX.test(j.title)) return false;
  // Job boards return any "Trainer" or "Coach" (Agile Coach, Technischer Trainer): the title or
  // employer must also name the fitness world (31 Oct 2026, run 7).
  if (!FITNESS_CTX_RX.test(`${j.title} ${j.employer || ''}`)) return false;
  return isOnBrand(text) || (JOB_COMPOUND_RX.test(text) && !OFFTOPIC_RX.test(text));
}

const TYPE_RULES = [
  // Ausbildung and dual study first: "Auszubildende zum Sport- und Fitnesskaufmann" is training, not a trainer job
  [/ausbildung|auszubildende|\bazubi|duales studium|dualer student|duale[rs]? student|trainee/i, 'apprenticeship'],
  [/studioleit|clubmanag|club manager|studio manager|filialleit|standortleit|general manager/i, 'studio-manager'],
  [/personal ?trainer|fitnesstrainer|fitness ?trainer|trainer\b|trainer:?in|instructor|kursleit|yoga|pilates|physio/i, 'trainer'],
  [/coach/i, 'coach'],
  [/sales|vertrieb|verkauf|membership consultant|kundenberat/i, 'sales'],
  [/marketing|social media|content|brand|community manager/i, 'marketing'],
  [/engineer|developer|entwickler|product manager|data|design(er)?\b|it-/i, 'product-tech'],
  [/empfang|rezeption|service|operations|office|admin|buchhalt|theke|counter/i, 'ops'],
];
const typeByRule = (title) => (TYPE_RULES.find(([rx]) => rx.test(title)) || [null, 'other'])[1];

async function claude(prompt, { maxTokens = 4000 } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    } catch (e) { console.error(`  · model retry ${attempt}/3: ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 3000)); }
  }
  return '';
}
const parseJson = (t) => { try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { const m = t.match(/\[[\s\S]*\]/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

/** Fills type, region, employment and the two summaries for jobs that do not have them yet. */
async function classify(jobs) {
  const todo = jobs.filter((j) => !j.classified);
  for (const j of todo) { j.type ||= typeByRule(j.title); }
  if (!apiKey) { runLog.notes.push(`No ANTHROPIC_API_KEY: ${todo.length} new jobs typed by title rules, no summaries.`); return; }
  for (let i = 0; i < todo.length; i += 15) {
    const batch = todo.slice(i, i + 15);
    const prompt = `You classify German fitness and wellness job postings for a job list. Use ONLY what is in each posting. When the posting does not say, answer "unknown" (for type use "other") rather than guess.

For each job return:
- type: one of ${TYPES.join(', ')} (apprenticeship = Ausbildung, duales Studium or trainee programme)
- region: one of ${REGIONS.join(', ')}, or "unknown". From the job's city: Berlin, Hamburg, München, Köln, Frankfurt (am Main) by name; any other German place is "Other DE"; remote work allowed from Germany is "Remote DE".
- employment: one of ${EMPLOYMENT.join(', ')}
- summaryEn: one plain English sentence (max 25 words) saying what the role is and where. No claims that are not in the posting. No pay figures.
- summaryDe: the same sentence in clear German, du-free neutral wording.

Answer with a JSON array only: [{"id": "...", "type": "...", "region": "...", "employment": "...", "summaryEn": "...", "summaryDe": "..."}]

Jobs:
${JSON.stringify(batch.map((j) => ({ id: j.id, title: j.title, employer: j.employer, city: j.city, employment: j.employment, text: (j.description || '').slice(0, 700) })))}`;
    const res = parseJson(await claude(prompt)) || [];
    for (const c of Array.isArray(res) ? res : []) {
      const j = batch.find((x) => x.id === c.id); if (!j) continue;
      if (TYPES.includes(c.type)) j.type = c.type;
      if (!j.region && REGIONS.includes(c.region)) j.region = c.region;       // a city match in code wins
      if (j.employment === 'unknown' && EMPLOYMENT.includes(c.employment)) j.employment = c.employment;
      if (c.summaryEn) j.summaryEn = String(c.summaryEn).slice(0, 240);
      if (c.summaryDe) j.summaryDe = String(c.summaryDe).slice(0, 240);
      j.classified = true;
    }
  }
}

/* ------------------------------------------------------------------- merge -- */

/** Folds this run's jobs into the stored list: new ones are added, seen ones refreshed,
 *  unseen ones expire after EXPIRE_DAYS unless their source failed this run. */
export function mergeRun(stored, fresh, { now = Date.now(), failedSources = new Set() } = {}) {
  const today = iso(now);
  const byId = new Map(stored.map((j) => [j.id, j]));
  const byKey = new Map(stored.filter((j) => !j.expired).map((j) => [dedupeKey(j), j]));
  for (const f of fresh) {
    const cur = byId.get(f.id) || byKey.get(dedupeKey(f));
    if (cur) {
      Object.assign(cur, { lastSeenAt: today, expired: false });
      if (f.source === cur.source) {
        // the same source again: take its current place and pay, so a parser fix reaches stored rows
        if (f.url) cur.url = f.url;
        Object.assign(cur, { city: f.city ?? cur.city, region: f.region ?? cur.region });
        if (!cur.postedAt && f.postedAt) cur.postedAt = f.postedAt;
        if (!cur.employer && f.employer) cur.employer = f.employer;
        if (f.employment && f.employment !== 'unknown') cur.employment = f.employment;
        if (hasPay(f)) Object.assign(cur, { payText: f.payText, payMin: f.payMin, payMax: f.payMax, payPeriod: f.payPeriod, payCurrency: f.payCurrency });
        if (typeByRule(cur.title) === 'apprenticeship') cur.type = 'apprenticeship';
      }
      // a later posting with pay replaces one without: link, pay and source credit move together
      if (!hasPay(cur) && hasPay(f)) Object.assign(cur, { url: f.url, source: f.source, payText: f.payText, payMin: f.payMin, payMax: f.payMax, payPeriod: f.payPeriod, payCurrency: f.payCurrency });
      continue;
    }
    const j = { ...f, seenAt: today, lastSeenAt: today, expired: false };
    stored.push(j); byId.set(j.id, j); byKey.set(dedupeKey(j), j);
  }
  for (const j of stored) {
    j.expired = !!j.expired;
    if (failedSources.has(j.source)) continue;
    if (now - Date.parse(j.lastSeenAt || j.seenAt) > EXPIRE_DAYS * DAY) j.expired = true;
  }
  return stored;
}

/** The Friday this run belongs to (runs on Thursday evening publish for Friday). */
export const editionFor = (now = Date.now()) => { const d = new Date(now); const add = (5 - d.getUTCDay() + 7) % 7; return iso(now + add * DAY); };

/* -------------------------------------------------------------------- run -- */

function readStore() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return { generatedAt: null, edition: null, jobs: [] }; }
}
/** Append-only: a job's first pay line, and a new line whenever its pay changes (e.g. a parser
 *  fix). Readers take the LAST line per id; older lines are never deleted. */
function appendPay(jobs) {
  const last = new Map();
  if (existsSync(PAY_LOG)) for (const l of readFileSync(PAY_LOG, 'utf8').split('\n')) { try { const x = JSON.parse(l); last.set(x.id, x); } catch { /* blank */ } }
  const same = (a, j) => a && a.payMin === j.payMin && a.payMax === j.payMax && a.payPeriod === j.payPeriod;
  const lines = jobs.filter((j) => hasPay(j) && !same(last.get(j.id), j)).map((j) => JSON.stringify({
    ...(last.has(j.id) ? { correction: true, loggedAt: iso() } : {}),
    id: j.id, seenAt: j.seenAt, title: j.title, employer: j.employer, city: j.city, region: j.region, type: j.type, employment: j.employment,
    payText: j.payText, payMin: j.payMin, payMax: j.payMax, payPeriod: j.payPeriod, payCurrency: j.payCurrency, source: j.source, url: j.url,
  }));
  if (lines.length) appendFileSync(PAY_LOG, lines.join('\n') + '\n');
  return lines.length;
}

async function run() {
  const brandsFile = JSON.parse(readFileSync(BRANDS, 'utf8'));
  if (args.discover) {
    await discover(brandsFile.brands, { force: args.discover === 'all' });
    if (!args.dry) writeFileSync(BRANDS, JSON.stringify(brandsFile, null, 1) + '\n');
    console.log(`discovery: ${runLog.discovery.found} of ${runLog.discovery.tried} careers pages found; ${runLog.discovery.missing.length} brands without one`);
    return;
  }
  const fresh = []; const failed = new Set();
  for (const src of SOURCES) {
    const log = (runLog.sources[src.id] = { enabled: src.enabled, fetched: 0, kept: 0 });
    if (!src.enabled) { log.note = 'disabled (terms of use)'; continue; }
    let got = [];
    try {
      if (src.id === 'ba') got = await fromBA(src);
      else if (src.id === 'adzuna') got = await fromAdzuna(src);
      else if (src.id === 'career-page') { await discover(brandsFile.brands); got = await fromBrands(brandsFile.brands); }
      else if (src.id === 'dssv') got = await fromHtmlBoard(src);
      else if (src.id === 'fitt') got = await fromFitt(src);
      else got = await fromHtmlBoard(src);   // indeed / stepstone, only if ever enabled: robots.txt, stop at the first 403
    } catch (e) { log.error = e.message; }
    if (got === null) { log.note = 'skipped'; continue; }
    const hostFails = Object.entries(runLog.hosts).filter(([h, v]) => v.failures && src.url && new URL(src.url).host === h);
    if (!got.length && (log.error || hostFails.length)) failed.add(src.id);
    log.fetched = got.length;
    const kept = got.filter((j) => j.region && j.title && j.url && keepJob(j));
    log.kept = kept.length;
    fresh.push(...kept);
  }
  const unique = dedupe(fresh);
  runLog.found = { fetchedAfterGate: fresh.length, unique: unique.length, withPay: unique.filter(hasPay).length };

  const store = readStore();
  const merged = mergeRun(store.jobs, unique, { failedSources: failed });
  // the on-topic gate tightens over time: stored rows that no longer pass leave the page (kept in the file)
  let dropped = 0;
  for (const j of merged) if (!j.expired && !keepJob(j)) { j.expired = true; j.dropped = 'off-topic'; dropped++; }
  if (dropped) runLog.notes.push(`${dropped} stored roles failed the on-topic gate and were taken off the page.`);
  const live = merged.filter((j) => !j.expired);
  if (!args.dry) await classify(live);
  const week = Date.now() - 7 * DAY;
  runLog.summary = {
    live: live.length, newThisWeek: live.filter((j) => Date.parse(j.seenAt) >= week).length, withPay: live.filter(hasPay).length,
    newWithPay: live.filter((j) => Date.parse(j.seenAt) >= week && hasPay(j)).length,
    hostsFailed: Object.values(runLog.hosts).filter((h) => h.failures && h.failures === h.requests).length,
    sourcesFailed: [...failed],
  };
  runLog.finishedAt = new Date().toISOString();
  console.log(`jobs: ${Object.entries(runLog.sources).map(([k, v]) => `${k} ${v.kept}/${v.fetched}`).join(' · ')}`);
  console.log(`jobs: ${unique.length} unique this run · ${runLog.summary.live} live · ${runLog.summary.withPay} with pay · ${runLog.summary.newThisWeek} new this week`);
  for (const n of runLog.notes) console.log(`  · ${n}`);
  // why a source came back empty, straight into the Actions log
  for (const src of SOURCES.filter((x) => x.enabled && x.url)) {
    const h = runLog.hosts[new URL(src.url).host];
    if (h && (h.failures || h.errors.length)) console.log(`  · ${src.id} (${new URL(src.url).host}): ${h.requests} requests, ${h.failures} failed; ${h.errors.slice(0, 3).join(' | ')}`);
  }
  const brandHosts = Object.entries(runLog.hosts).filter(([k]) => !SOURCES.some((x) => x.url && new URL(x.url).host === k));
  if (brandHosts.length) console.log(`  · career pages: ${brandHosts.length} hosts, ${brandHosts.filter(([, v]) => v.failures && v.failures === v.requests).length} unreachable, ${brandHosts.filter(([, v]) => v.errors.some((e) => e.startsWith('robots'))).length} blocked by robots.txt`);
  if (runLog.sources.ba?.diag) console.log(`  · ba endpoints: ${JSON.stringify(runLog.sources.ba.diag.tried.map(({ sample, ...t }) => t))}${runLog.sources.ba.diag.used ? ` → using ${runLog.sources.ba.diag.used}` : ''}`);
  const dd = runLog.sources.ba?.diag?.detail;
  if (dd) console.log(`  · ba pay details: ${dd.wanted} postings say pay is given, ${dd.fetched} fetched (${dd.path || 'no path'}), ${dd.withFigure} with a figure, ${dd.textOnly} text only, ${dd.failed} failed${dd.samples ? `; e.g. ${dd.samples.slice(0, 3).join(' | ')}` : ''}`);
  if (runLog.discovery) console.log(`  · discovery: ${runLog.discovery.found} careers pages found of ${runLog.discovery.tried} tried`);
  if (args.dry) {
    mkdirSync(RUN_DIR, { recursive: true });
    writeFileSync(join(RUN_DIR, 'last-run-dry.json'), JSON.stringify(runLog, null, 1) + '\n');
    console.log('dry run: data files untouched; run log at automation/jobs/last-run-dry.json'); return;
  }

  const out = { generatedAt: iso(), edition: editionFor(), jobs: merged.map(({ description, classified, _remoteDE, ...j }) => ({ ...j, classified: classified || undefined })) };
  // descriptions stay out of the site file (size, copyright); the summaries carry the gist
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  const appended = appendPay(merged);
  runLog.payLinesAppended = appended;
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(RUN_LOG, JSON.stringify(runLog, null, 1) + '\n');
  writeFileSync(BRANDS, JSON.stringify(brandsFile, null, 1) + '\n');
  console.log(`wrote ${OUT.replace(ROOT + '/', '')} (${merged.length} jobs), ${appended} pay lines, run log`);
}

/* --------------------------------------------------------------- selftest -- */

function selftest() {
  let ok = true;
  const t = (name, pass, got) => { console.log(`${pass ? '✓' : '✗'} ${name}${pass ? '' : ' -> ' + JSON.stringify(got)}`); ok &&= pass; };
  const P = (s, min, max, period) => { const r = parsePay(s); t(`pay: ${JSON.stringify(s)}`, r.payMin === min && r.payMax === max && r.payPeriod === period && (min == null && max == null ? r.payCurrency === null : r.payCurrency === 'EUR'), [r.payMin, r.payMax, r.payPeriod, r.payCurrency]); };
  P('2.800 € brutto/Monat', 2800, 2800, 'month');
  P('30-35 €/Std.', 30, 35, 'hour');
  P('ab 45.000 € p.a.', 45000, null, 'year');
  P('Minijob 538 €', 538, 538, 'month');
  P('2.500 – 3.200 € brutto monatlich', 2500, 3200, 'month');
  P('15,50 €/h', 15.5, 15.5, 'hour');
  P('13,90 € pro Stunde', 13.9, 13.9, 'hour');
  P('40.000-50.000 EUR jährlich', 40000, 50000, 'year');
  P('Gehalt: 42.000 € - 48.000 € / Jahr', 42000, 48000, 'year');
  P('bis zu 3.000 € netto', null, 3000, 'month');
  P('1.800 € netto im Monat', 1800, 1800, 'month');
  P('50k-60k €', 50000, 60000, 'year');
  P('Stundenlohn: 20 Euro', 20, 20, 'hour');
  P('€ 3.500/Monat', 3500, 3500, 'month');
  P('2800€ brutto', 2800, 2800, 'month');
  P('45.000,00 € brutto p.a.', 45000, 45000, 'year');
  P('EUR 18 per hour', 18, 18, 'hour');
  P('25 bis 30 Euro pro Stunde', 25, 30, 'hour');
  P('Vergütung nach Vereinbarung', null, null, null);
  P('attraktives Gehalt', null, null, null);
  P('$25/hour', null, null, null);
  P('60.000 CHF', null, null, null);
  P('', null, null, null);
  P(null, null, null, null);
  P('520 € auf Minijob-Basis, Start 2026', 520, 520, 'month');
  // review cases (Oct 2026): brutto/netto plus another number, working hours, holidays, bonuses
  P('14 € brutto pro Stunde, 2 Wochen Urlaub', 14, 14, 'hour');
  P('2.800 € brutto, 13 Gehälter', 2800, 2800, 'month');
  P('2.800 € brutto zzgl. 30 Tage Urlaub', 2800, 2800, 'month');
  P('Vollzeit (40 Std./Woche), 3.000 € brutto im Monat', 3000, 3000, 'month');
  P('Teilzeit 20 Std., 1.400 €', 1400, 1400, 'month');
  P('3.000 € brutto/Monat bei 40 h/Woche', 3000, 3000, 'month');
  P('45.000 € brutto (Basisgehalt)', 45000, 45000, 'year');
  P('13,90€/Std. + Provision bis 500 €', 13.9, 13.9, 'hour');
  P('1.000 Euro Prämie', null, null, null);
  const nb = parsePay('2.000 € netto'); t('netto kept as written', nb.payText === '2.000 € netto' && nb.payMin === 2000, nb);
  // regions
  const R = (loc, want, o) => t(`region: ${loc}`, regionFor(loc, o) === want, regionFor(loc, o));
  R('Berlin', 'Berlin'); R('München-Schwabing', 'München'); R('Cologne, Germany', 'Köln'); R('Frankfurt am Main', 'Frankfurt'); R('Frankfurt (Oder)', 'Other DE');
  R('Leipzig', 'Other DE'); R('Remote - Germany', 'Remote DE'); R('Remote, US', null); R('New York, NY', null); R('Hamburg', 'Hamburg');
  R('Wels', 'Other DE', { country: 'DE' });
  R('Paris, Île-de-France, France', null); R('Remote - Rio de Janeiro', null);
  // dedupe keeps the posting with pay, else the earliest
  const d = dedupe([
    { employer: 'FitX GmbH', title: 'Fitnesstrainer (m/w/d)', city: 'Berlin', postedAt: '2026-10-20', payMin: null, payMax: null, source: 'ba' },
    { employer: 'FitX', title: 'Fitnesstrainer', city: 'Berlin', postedAt: '2026-10-22', payMin: 2600, payMax: 2600, source: 'adzuna' },
    { employer: 'McFit', title: 'Studioleiter', city: 'Köln', postedAt: '2026-10-25', payMin: null, payMax: null, source: 'adzuna' },
    { employer: 'McFit', title: 'Studioleiter (w/m/d)', city: 'Köln', postedAt: '2026-10-18', payMin: null, payMax: null, source: 'ba' },
  ]);
  t('dedupe: 4 -> 2', d.length === 2, d.length);
  t('dedupe: keeps the one with pay', d.find((x) => x.employer.startsWith('FitX'))?.source === 'adzuna', d);
  t('dedupe: else the earliest', d.find((x) => x.employer === 'McFit')?.postedAt === '2026-10-18', d);
  // on-brand gate
  t('gate: drops Reinigung', !keepJob({ title: 'Reinigungskraft Fitnessstudio', employer: 'FitX', source: 'ba' }));
  t('gate: keeps trainer', keepJob({ title: 'Fitnesstrainer (m/w/d)', employer: 'FitX', source: 'ba' }));
  t('gate: keeps ops at a studio', keepJob({ title: 'Servicekraft Empfang Fitnessstudio', employer: 'clever fit', source: 'ba' }));
  t('gate: drops off-topic', !keepJob({ title: 'Lagerist', employer: 'Spedition Meyer', source: 'ba' }));
  t('gate: drops Gebäudereinigung', !keepJob({ title: 'Gebäudereinigung Fitnessstudio', employer: 'X', source: 'ba' }));
  t('gate: drops SAP Trainer', !keepJob({ title: 'SAP Trainer (m/w/d)', employer: 'Beratung GmbH', source: 'ba' }));
  t('gate: drops Transport', !keepJob({ title: 'LKW-Fahrer Transport', employer: 'Spedition', source: 'ba' }));
  t('gate: drops Agile Coach', !keepJob({ title: 'Agile Coach (m/w/d)', employer: 'FERCHAU GmbH', source: 'ba' }));
  t('gate: drops technical trainer', !keepJob({ title: 'Technischer Trainer - Automatisierungstechnik (m/w/d)', employer: 'Tesla Germany GmbH', source: 'ba' }));
  t('gate: keeps MMA trainer and gym-named employer', keepJob({ title: 'MMA-Trainer (m/w/d)', employer: 'ExoWork', source: 'ba' }) && keepJob({ title: 'Trainer (m/w/d)', employer: 'Bodyloft Rottweil', source: 'adzuna' }));
  t('gate: brand page counts', keepJob({ title: 'Software Engineer', employer: 'Whoop', source: 'career-page' }));
  // robots.txt
  const rr = robotsRules('User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: OtherBot\nDisallow: /');
  t('robots: disallowed path', !robotsAllows(rr, '/private/x'));
  t('robots: allow wins when longer', robotsAllows(rr, '/private/jobs/1'));
  t('robots: other paths allowed', robotsAllows(rr, '/careers'));
  t('robots: own group wins', !robotsAllows(robotsRules('User-agent: *\nDisallow:\n\nUser-agent: SqwodJobsBot\nDisallow: /'), '/x'));
  // expiry and merge
  const now = Date.parse('2026-11-30T12:00:00Z');
  const st = [{ id: 'a', employer: 'A', title: 'T', city: 'Berlin', seenAt: '2026-10-01', lastSeenAt: '2026-11-01', source: 'ba' },
    { id: 'b', employer: 'B', title: 'T', city: 'Berlin', seenAt: '2026-10-01', lastSeenAt: '2026-11-01', source: 'dssv' }];
  const m = mergeRun(st, [{ id: 'c', employer: 'C', title: 'T', city: 'Hamburg', source: 'ba', payMin: null, payMax: null }], { now, failedSources: new Set(['dssv']) });
  t('expiry: 29 days unseen -> expired, kept in file', m.find((x) => x.id === 'a').expired === true && m.length === 3);
  t('expiry: source failed this run -> not expired', m.find((x) => x.id === 'b').expired === false);
  t('merge: new job stamped', m.find((x) => x.id === 'c').seenAt === '2026-11-30');
  t('edition: Thursday run -> Friday', editionFor(Date.parse('2026-11-05T17:00:00Z')) === '2026-11-06');
  t('url: javascript: dropped', job('dssv', { rawId: 1, title: 'x', url: 'javascript:alert(1)' }).url === null);
  t('url: relative resolved', job('dssv', { rawId: 1, title: 'x', url: '/job/1', base: 'https://www.dssv.de/jobboerse/' }).url === 'https://www.dssv.de/job/1');
  t('date: epoch ms and junk', job('career-page', { rawId: 1, title: 'x', url: 'https://a.b', postedAt: 1761800000000 }).postedAt === '2025-10-30' && job('dssv', { rawId: 2, title: 'x', url: 'https://a.b', postedAt: 'soon' }).postedAt === null);
  const ap = adzunaPay(15, 20), am = adzunaPay(5000, 5000), ay = adzunaPay(33600, 42000);
  t('adzuna pay: 15-20 is hourly, 5000 monthly, 33600-42000 yearly', ap.payPeriod === 'hour' && am.payPeriod === 'month' && ay.payPeriod === 'year', [ap, am, ay]);
  t('adzuna pay: 10800-13200 and 8184-11460 are yearly, 1007-2015 monthly', adzunaPay(10800, 13200).payPeriod === 'year' && adzunaPay(8184, 11460).payPeriod === 'year' && adzunaPay(1007, 2015).payPeriod === 'month');
  const pl = (area, dn) => adzunaPlace({ area, display_name: dn });
  t('adzuna place: Berlin district', pl(['Deutschland', 'Berlin', 'Schöneberg'], 'Schöneberg, Berlin').region === 'Berlin' && pl(['Deutschland', 'Berlin', 'Schöneberg']).city === 'Berlin');
  t('adzuna place: Hamburg district', pl(['Deutschland', 'Hamburg', 'Barmbek-Nord'], 'Barmbek-Nord, Hamburg').region === 'Hamburg');
  t('adzuna place: Kreis', pl(['Deutschland', 'Nordrhein-Westfalen', 'Düren (Kreis)']).city === 'Düren' && pl(['Deutschland', 'Nordrhein-Westfalen', 'Düren (Kreis)']).region === 'Other DE');
  t('adzuna place: Bavaria to München', pl(['Deutschland', 'Bayern', 'Oberbayern', 'München'], 'München, Oberbayern').region === 'München');
  t('type: Ausbildung', typeByRule('Auszubildende zum Sport- und Fitnesskaufmann (w/m/x)') === 'apprenticeship' && typeByRule('Duales Studium - Fitnessökonomie') === 'apprenticeship' && typeByRule('Fitnesstrainer (m/w/d)') === 'trainer');
  const bi = baItem({ stellenangebotsTitel: 'Fitnesstrainer (m/w/d)', firma: 'Fitnesspoint', referenznummer: '10001-1234-S', arbeitszeitVollzeit: true,
    arbeitszeitTeilzeitAbend: true, verguetungsangabe: 'KEINE_ANGABEN', datumErsteVeroeffentlichung: '2026-10-31',
    stellenlokationen: [{ adresse: { ort: 'Cham, Oberpfalz', land: 'DEUTSCHLAND' } }] }, 'full-time');
  t('ba v6 item: title, firm, city, date, employment', bi.fields.title === 'Fitnesstrainer (m/w/d)' && bi.fields.employer === 'Fitnesspoint' && bi.fields.city === 'Cham' && bi.fields.postedAt === '2026-10-31' && bi.fields.employment === 'full-time' && bi.payCategory === 'KEINE_ANGABEN', bi);
  t('ba v6 item: part-time only', baItem({ stellenangebotsTitel: 'x', referenznummer: '1', arbeitszeitTeilzeitVormittag: true, stellenlokationen: [{ adresse: { ort: 'Berlin', land: 'DEUTSCHLAND' } }] }, 'full-time').fields.employment === 'part-time');
  t('ba v6 item: abroad skipped', baItem({ stellenangebotsTitel: 'x', referenznummer: '1', stellenlokationen: [{ adresse: { ort: 'Wien', land: 'ÖSTERREICH' } }] }).foreign === true);
  const dp1 = baDetailPay({ titel: 'x', verguetung: '14,50 € pro Stunde' }, 'STUNDENLOHN');
  t('ba detail pay: hourly text', dp1.payMin === 14.5 && dp1.payPeriod === 'hour', dp1);
  const dp2 = baDetailPay({ verguetung: '38.000 – 42.000 €' }, 'JAHRESGEHALT');
  t('ba detail pay: range, period from category', dp2.payMin === 38000 && dp2.payMax === 42000 && dp2.payPeriod === 'year', dp2);
  const dp3 = baDetailPay({ verguetung: 'Entgeltgruppe 13 TV-L' }, 'JAHRESGEHALT');
  t('ba detail pay: tariff grade, no figure invented', dp3.payMin == null && dp3.payText === 'Entgeltgruppe 13 TV-L', dp3);
  const dp4 = baDetailPay({ gehalt: { von: 2600, bis: 3100 } }, 'MONATSGEHALT');
  t('ba detail pay: structured numbers', dp4.payMin === 2600 && dp4.payMax === 3100 && dp4.payPeriod === 'month', dp4);
  const dp5 = baDetailPay({ verguetungsangabe: 'STUNDENLOHN', verguetung: '15 €' }, 'STUNDENLOHN');
  t('ba detail pay: category enum ignored, 15 € hourly', dp5.payMin === 15 && dp5.payPeriod === 'hour', dp5);
  const dp6 = baDetailPay({ artDerVerguetung: 'GEHALTSSPANNE', gehaltsspanneVon: 26000, gehaltsspanneBis: 34000 }, 'JAHRESGEHALT');
  t('ba detail pay: gehaltsspanne, readable text', dp6.payMin === 26000 && dp6.payMax === 34000 && dp6.payPeriod === 'year' && dp6.payText === '26.000 € – 34.000 € / Jahr (Arbeitsagentur)', dp6);
  t('json-ld: finds JobPosting in @graph', jsonLdJobs('<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"x"}]}</script>').length === 1);
  console.log(ok ? 'selftest passed' : 'selftest FAILED');
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (args.selftest) selftest();
  else await run();
}
