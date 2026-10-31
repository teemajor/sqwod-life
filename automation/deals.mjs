#!/usr/bin/env node
/**
 * Sqwod Deal Tracker: turns the Daily's "Money movement" block into a clean, searchable
 * database of fitness, wellness and health-tech deals (raises, M&A, valuations, IPOs).
 *
 *   node automation/deals.mjs                 # rebuild site/src/data/deals.json, queue new deals
 *   node automation/deals.mjs --email         # same, then email Tee one Publish/Skip card per new deal
 *   node automation/deals.mjs --enrich        # web-check new deals first (needs ANTHROPIC_API_KEY); --enrich=all for every deal
 *   node automation/deals.mjs --review        # print what is pending / hidden (for a chat review)
 *   node automation/deals.mjs --selftest      # amount-parser, dedupe and review-flag tests
 *   node automation/deals.mjs --email --preview=/tmp/x.html   # also save the review email as HTML
 *
 * How a deal goes live (one tap, no workflow step needed):
 *   1. This script writes every deal to site/src/data/deals.json and, for each NEW one,
 *      a queue file automation/intel-queue/deal-<id>.json (status "pending").
 *   2. Tee taps Publish in the email -> the pr-intake Worker flips that queue file to
 *      "approved" and commits it -> the commit triggers a site deploy.
 *   3. The tracker page (site/src/lib/deals.ts) shows a deal only when it is approved,
 *      either in automation/deals-overrides.json or in its queue file.
 *
 * Data rules: amounts are the figure the source reported; USD conversion uses the fixed
 * FX table below (approximate, labelled on the page). Repeats of the same deal within
 * 60 days merge into the first report. Off-brand deals (onbrand.mjs) are hidden.
 *
 * Env (only for --email): RESEND_API_KEY, RESEND_FROM, INTEL_REVIEWER_EMAIL,
 *      INTEL_SIGNING_SECRET, INTEL_WORKER_URL
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isOnBrand } from './onbrand.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DAILY = join(ROOT, 'site', 'src', 'content', 'daily');
const OUT = join(ROOT, 'site', 'src', 'data', 'deals.json');
const QUEUE = join(__dirname, 'intel-queue');
const OVERRIDES = join(__dirname, 'deals-overrides.json');
const ENRICH = join(__dirname, 'deals-enrich.json');
const MANUAL = join(__dirname, 'deals-manual.json');  // researched entries not from a Daily (e.g. past closures), each with a source url   // web-checked facts per deal (cache; written by --enrich)
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const SEARCH_TOOL = process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = args.date || new Date().toISOString().slice(0, 10);
const RESEND = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';
const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');
const MERGE_DAYS = 60;
const QUEUE_DAYS = Number(args.since || 3);          // only deals reported in the last N days get an email card

// Fixed, approximate FX to USD (as of Oct 2026). Shown on the page as "approx. USD".
export const FX = { USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.13, CAD: 0.72, AUD: 0.65, INR: 0.012, JPY: 0.0066, SEK: 0.095, NOK: 0.092, DKK: 0.145, AED: 0.27, SAR: 0.27, SGD: 0.75 };
const CUR_RX = [['C$', 'CAD'], ['CA$', 'CAD'], ['A$', 'AUD'], ['AU$', 'AUD'], ['S$', 'SGD'], ['US$', 'USD'], ['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'], ['¥', 'JPY']];

// ---------- frontmatter (machine-written by cascade.mjs: one key per line, JSON-quoted strings) ----------
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1].split('\n') : [];
}
const val = (s) => { s = s.trim(); if (s.startsWith('"')) { try { return JSON.parse(s); } catch { return s.slice(1, -1); } } return s; };
function scalar(lines, key) {
  const l = lines.find((x) => x.startsWith(key + ':'));
  return l ? val(l.slice(key.length + 1)) : undefined;
}
/** A top-level list of flat maps, e.g. moneyMoves / items. */
function list(lines, key) {
  const i = lines.findIndex((x) => x === key + ':');
  if (i < 0) return [];
  const out = []; let cur = null;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (/^\S/.test(l)) break;                          // next top-level key
    let m = l.match(/^  - (\w+): (.*)$/);
    if (m) { cur = { [m[1]]: val(m[2]) }; out.push(cur); continue; }
    m = l.match(/^    (\w+): (.*)$/);
    if (m && cur) cur[m[1]] = val(m[2]);
  }
  return out;
}

// ---------- amounts ----------
export function parseAmount(raw) {
  const s = String(raw || '').replace(/\u00a0/g, ' ').trim();
  if (!s || /\/\s*share|per share|je aktie/i.test(s)) return null;
  let cur = null, rest = s;
  if (/^(rs\.?|inr)\s*/i.test(rest)) { cur = 'INR'; rest = rest.replace(/^(rs\.?|inr)\s*/i, ''); }
  for (const [sym, code] of CUR_RX) { if (!cur && rest.startsWith(sym)) { cur = code; rest = rest.slice(sym.length); break; } }
  const code = rest.match(/\b(USD|EUR|GBP|CHF|CAD|AUD|INR|JPY|SEK|NOK|DKK|AED|SAR|SGD)\b/i);
  if (code) cur = code[1].toUpperCase();             // an explicit code beats a bare "$" ("$1.6M CAD")
  if (!cur) return null;
  const m = rest.match(/([\d.,]+)\s*(?:[–-]\s*\$?([\d.,]+))?\s*(k|thousand|lakh|crore|m|mn|mio|million|b|bn|billion|mrd)?\b/i);
  if (!m) return null;
  const num = (x) => Number(String(x).replace(/,/g, ''));
  let lo = num(m[1]); const hi = m[2] ? num(m[2]) : null;
  if (!Number.isFinite(lo)) return null;
  const u = (m[3] || '').toLowerCase();
  const mult = /^(k|thousand)$/.test(u) ? 1e3 : u === 'lakh' ? 1e5 : u === 'crore' ? 1e7 : /^(m|mn|mio|million)$/.test(u) ? 1e6 : /^(b|bn|billion|mrd)$/.test(u) ? 1e9 : 1;
  const value = (hi ? (lo + hi) / 2 : lo) * mult;
  if (value * (FX[cur] || 0) < 10000) return null;   // "$62" is a share price or a typo, not a deal size
  return { value, currency: cur, range: !!hi, usd: Math.round(value * (FX[cur] || 0)) || null };
}

// ---------- tagging ----------
const REGION_RULES = [
  ['DACH', /\b(germany|german|deutsch\w*|berlin|munich|münchen|hamburg|cologne|köln|frankfurt|austria|austrian|vienna|wien|switzerland|swiss|schweiz|zurich|zürich|geneva|basel|dach)\b|\.(de|at|ch)\//i],
  ['UK', /\b(uk|u\.k\.|britain|british|england|london|manchester|scotland|scottish)\b|\.co\.uk\/|£/i],
  ['Europe', /\b(europe|european|eu|france|french|paris|spain|spanish|madrid|netherlands|dutch|amsterdam|sweden|swedish|stockholm|nordic|norway|denmark|danish|copenhagen|finland|finnish|helsinki|italy|italian|milan|ireland|irish|dublin|poland|polish|portugal|lisbon|belgium|estonia)\b|€/i],
  ['Asia-Pacific', /\b(japan|japanese|tokyo|india|indian|bengaluru|mumbai|delhi|australia|australian|sydney|melbourne|singapore|china|chinese|korea|korean|indonesia|vietnam|philippines|new zealand)\b|₹/i],
  ['Middle East', /\b(saudi|uae|dubai|abu dhabi|qatar|israel|israeli)\b/i],
  ['North America', /\b(us|u\.s\.|usa|united states|american|new york|nyc|california|san francisco|los angeles|austin|texas|miami|boston|chicago|canada|canadian|toronto)\b/i],
];
const CATEGORY_RULES = [
  ['Gyms & studios', /\b(gym|gyms|studio|studios|health club|club chain|fitness chain|franchise|boutique|locations|pilates|yoga|crossfit|leisure)\b/i],
  ['Wearables & devices', /\b(wearable|wearables|smart ring|tracker|pendant|fitness mirror|smartwatch|whoop|oura|garmin|fitbit)\b/i],
  ['Health & longevity', /\b(longevity|healthspan|hormone|testing|preventive|fertility|clinic|diagnostic|glp-1|menopause|mental health|blood|body scan)\b/i],
  ['Nutrition & supplements', /\b(supplement|supplements|protein|snack|snacks|nutrition|mushroom|creatine|food|drink|beverage|hydration|vitamin|vitamins)\b/i],
  ['Wearables & devices', /\b(band|ring|mirror|device|sensor|hardware)\b/i],
  ['Software & AI', /\b(software|platform|app|saas|ai|operating system|booking|crm)\b/i],
  ['Apparel & footwear', /\b(apparel|sportswear|athleisure|footwear|shoe|shoes|activewear)\b/i],
];
const tag = (rules, text) => (rules.find(([, rx]) => rx.test(text)) || ['Other'])[0];

// ---------- helpers ----------
const slug = (s) => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const STOPW = new Set(['the', 'and', 'inc', 'ltd', 'gmbh', 'ag', 'co', 'group', 'health', 'fitness', 'wellness', 'partnership', 'unnamed', 'undisclosed']);
/** The company a deal is "about": for "A / B" acquisitions, the acquirer. */
const keyToken = (entity) => {
  const first = String(entity).split(/\s*[\/(]\s*/)[0];
  const t = first.toLowerCase().replace(/[^a-z0-9&\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOPW.has(w));
  return t[0] || slug(first);
};
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
/** Every company named in "A / B (C)" style entities, as key tokens. */
const keyTokens = (entity) => new Set(String(entity).split(/\s*[\/&]\s*|\s+and\s+/i).map((p) => keyToken(p.replace(/[()]/g, ' '))).filter(Boolean));
const read = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const vague = (e) => /\b(unnamed|undisclosed|unknown)\b/i.test(e) || /^(a|an)\s/i.test(e);

/** The source link for a money move: its own url, else the issue item that names the company. */
function sourceFor(move, items) {
  if (move.url) return { url: move.url, source: '' };
  const k = keyToken(move.entity);
  const hit = items.find((it) => `${it.headline} ${it.dek}`.toLowerCase().includes(k));
  return hit ? { url: hit.readMore || '', source: hit.source || '' } : { url: '', source: '' };
}

// ---------- 1. collect ----------
export function collect() {
  const raw = [];
  for (const f of readdirSync(DAILY).filter((f) => f.endsWith('.en.md')).sort()) {
    const lines = frontmatter(readFileSync(join(DAILY, f), 'utf8'));
    if (scalar(lines, 'status') && scalar(lines, 'status') !== 'published') continue;
    const date = scalar(lines, 'date') || f.slice(0, 10);
    const items = list(lines, 'items');
    for (const m of list(lines, 'moneyMoves')) {
      if (!m.entity) continue;
      const amt = parseAmount(m.amount);
      const { url, source } = sourceFor(m, items);
      const text = `${m.entity} ${m.note || ''} ${url}`;
      raw.push({
        date, entity: m.entity.trim(), kind: m.kind || 'raise', amount: m.amount || '', amountUsd: amt?.usd ?? null,
        currency: amt?.currency ?? null, approx: !!amt?.range, note: m.note || '', url, source, issue: `/en/daily/${date}`,
        region: tag(REGION_RULES, text), category: tag(CATEGORY_RULES, text),
        onBrand: isOnBrand(`${m.entity} ${m.note || ''}`, source),
        vague: vague(m.entity),
      });
    }
  }
  // Researched entries (closures before the tracker started, deals the Daily missed).
  for (const m of read(MANUAL, { entries: [] }).entries || []) {
    if (!m.entity || !m.date || !/^https?:\/\//.test(m.url || '')) continue;   // a manual entry without a source never counts
    const amt = parseAmount(m.amount);
    const text = `${m.entity} ${m.note || ''} ${m.url}`;
    raw.push({ date: m.date, entity: m.entity, kind: m.kind || 'shutdown', amount: m.amount || '', amountUsd: amt?.usd ?? null, currency: amt?.currency ?? null,
      approx: !!amt?.range, note: m.note || '', noteDe: m.noteDe || undefined, url: m.url, source: m.source || '', issue: '',
      region: (m.country && regionOf(m.country)) || tag(REGION_RULES, text), country: m.country || undefined,
      category: CATEGORIES.includes(m.category) ? m.category : tag(CATEGORY_RULES, text), onBrand: true, vague: false, manual: true });
  }
  return raw;
}

// ---------- 2. merge repeats ----------
export function merge(raw) {
  const out = [];
  for (const d of raw.sort((a, b) => a.date.localeCompare(b.date))) {
    const k = keyToken(d.entity), ks = keyTokens(d.entity);
    const twin = out.find((o) => [...ks].some((t) => o._ks.has(t)) && days(o.reports.at(-1).date, d.date) <= MERGE_DAYS && (
      o.kind === d.kind || (o.amountUsd && d.amountUsd && Math.abs(o.amountUsd - d.amountUsd) / Math.max(o.amountUsd, d.amountUsd) <= 0.12)));
    if (twin) {
      twin.reports.push({ date: d.date, url: d.url, issue: d.issue });
      if (!twin.amountUsd && d.amountUsd) Object.assign(twin, { amount: d.amount, amountUsd: d.amountUsd, currency: d.currency });
      if (!twin.url && d.url) Object.assign(twin, { url: d.url, source: d.source });
      if (d.entity.length > twin.entity.length && d.entity.toLowerCase().includes(k)) twin.entity = d.entity;
      if (d.kind === 'acquisition' && twin.kind !== 'acquisition') twin.kind = 'acquisition';
      if ((d.note || '').length > (twin.note || '').length) twin.note = d.note;
      for (const t of ks) twin._ks.add(t);
      twin._text += ` ${d.entity} ${d.note || ''} ${d.url || ''}`;
      continue;
    }
    out.push({ ...d, _k: k, _ks: ks, _text: `${d.entity} ${d.note || ''} ${d.url || ''}`, id: `${slug(k)}-${d.kind}-${d.date.slice(0, 7)}`, reports: [{ date: d.date, url: d.url, issue: d.issue }] });
  }
  // ids must be unique even when one company has two deals of a kind in a month
  const seen = new Map();
  for (const d of out) {
    const n = (seen.get(d.id) || 0) + 1; seen.set(d.id, n); if (n > 1) d.id += `-${n}`;
    if (!d.manual) { d.region = tag(REGION_RULES, d._text); d.category = tag(CATEGORY_RULES, d._text); }
    d.onBrand = d.onBrand || isOnBrand(d._text);
    delete d._k; delete d._ks; delete d._text;
  }
  return out;
}

// ---------- 3. enrichment (optional, web-checked) ----------
export const CATEGORIES = ['Gyms & studios', 'Wearables & devices', 'Health & longevity', 'Nutrition & supplements', 'Software & AI', 'Apparel & footwear', 'Other'];
const COUNTRY_REGION = [
  ['DACH', /^(germany|austria|switzerland|liechtenstein)$/i],
  ['UK', /^(united kingdom|uk|england|scotland|wales|northern ireland)$/i],
  ['Europe', /^(france|spain|italy|portugal|netherlands|belgium|luxembourg|ireland|denmark|sweden|norway|finland|iceland|poland|czechia|czech republic|slovakia|hungary|romania|bulgaria|greece|croatia|slovenia|estonia|latvia|lithuania|malta|cyprus)$/i],
  ['North America', /^(united states|usa|us|canada)$/i],
  ['Asia-Pacific', /^(japan|china|hong kong|taiwan|south korea|korea|india|singapore|australia|new zealand|indonesia|malaysia|thailand|vietnam|philippines)$/i],
  ['Middle East', /^(united arab emirates|uae|saudi arabia|qatar|israel|kuwait|bahrain|oman)$/i],
  ['Latin America', /^(brazil|mexico|argentina|chile|colombia|peru)$/i],
];
const regionOf = (country) => (COUNTRY_REGION.find(([, rx]) => rx.test(String(country || '').trim())) || [country ? 'Other' : null])[0];

async function claude(prompt, { maxTokens = 4000, tools = null } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
      if (tools) body.tools = tools;
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    } catch (e) { console.error(`  · model retry ${attempt}/3: ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 3000)); }
  }
  return '';
}
const parseJson = (t) => { try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

/** Looks each deal up on the web: who the company is, where it is based, a clean one-liner
 *  in EN + DE and a source page that reports the deal. Cached, so each deal costs one lookup. */
async function enrich(deals, { all = false } = {}) {
  if (!apiKey) { console.log('No ANTHROPIC_API_KEY: skipping enrichment (region/category stay rule-based).'); return; }
  const cache = read(ENRICH, {});
  const todo = deals.filter((d) => !cache[d.id] && d.status !== 'hidden' && (all || d._new));
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const prompt = `You verify deals for the Sqwod Deal Tracker (fitness, wellness and consumer health industry). For each deal below, search the web and answer ONLY with minified JSON:
{"deals":[{"id":"...","company":"clean company name","dealCountry":"country where the company (for an acquisition: the company being bought) is headquartered, in English (e.g. United States, United Kingdom, Germany); look on the company site or LinkedIn if the report does not say; empty only if it really cannot be found","category":"one of ${CATEGORIES.join(' | ')}","relevant":true|false,"oneLineEn":"what happened, max 18 words, plain English, no hype, no em dashes","oneLineDe":"same in natural German, du-neutral, no em dashes","amount":"the size of THIS round or deal exactly as the company's own announcement (or the most reliable report) states it, or empty","amountIs":"what the amount we have stored actually is: round | total-raised | valuation | facility | estimate | undisclosed | wrong","investors":["for a raise: the investors in THIS round as named by the source, lead investor first, funds and companies by their proper names, no unnamed angels; empty if none are named"],"leadInvestors":["the investor(s) the source calls lead or co-lead; empty if not stated"],"acquirer":"for an acquisition: the buying company; empty otherwise","announcedOn":"YYYY-MM-DD when this deal was FIRST publicly announced (earliest release or report), or empty","dealStatus":"done | agreed | planned | rumour (planned = only considering, e.g. an IPO plan with no filing; a crowdfunding campaign that has not closed)","url":"https://... a page you opened that reports this deal, ideally the company's own release","primarySource":true|false,"confidence":"high|medium|low"}]}
"relevant" = false when the deal is outside fitness, wellness, nutrition, consumer health or sports business (e.g. fast food, cricket teams, astrology apps, energy, stock exchanges).
Never guess a country, amount or date: leave it empty and set confidence low.
Watch for these common mistakes in the stored data: a headline's "total raised to date" given as the round size; £ shown as €; a valuation shown as the amount raised; an old deal re-reported in a retrospective article (announcedOn then lies months before "first reported").
DEALS:
${batch.map((d) => `- id=${d.id} | ${d.entity} | ${d.kind} | ${d.amount || 'amount not stated'} | first reported ${d.date} | note: ${d.note} | known source: ${d.url || 'none'}`).join('\n')}`;
    const j = parseJson(await claude(prompt, { maxTokens: 3500, tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 10 }] }));
    for (const e of j?.deals || []) if (e && e.id && batch.some((d) => d.id === e.id)) cache[e.id] = { ...e, checkedAt: today };
    writeFileSync(ENRICH, JSON.stringify(cache, null, 2) + '\n');
    console.log(`  enriched ${Math.min(i + 6, todo.length)}/${todo.length}`);
  }
}
function applyEnrichment(deals) {
  const cache = read(ENRICH, {});
  for (const d of deals) {
    const e = cache[d.id];
    if (!e || e.confidence === 'low') continue;
    if (e.company) d.entity = e.company;
    const r = regionOf(e.dealCountry); if (r) { d.region = r; d.country = e.dealCountry; }
    if (CATEGORIES.includes(e.category)) d.category = e.category;
    if (Array.isArray(e.investors) && e.investors.length) { d.investors = e.investors.map(String); d.leads = Array.isArray(e.leadInvestors) ? e.leadInvestors.map(String) : []; }
    if (e.acquirer) d.acquirer = String(e.acquirer);
    if (e.oneLineEn) d.note = e.oneLineEn;
    if (e.oneLineDe) d.noteDe = e.oneLineDe;
    if (/^https?:\/\//.test(e.url || '') && (!d.url || weakUrl(d.url))) d.url = e.url;
    const checkedAmt = parseAmount(e.amount);
    if (checkedAmt && (!d.amountUsd || amountDiffers(d, checkedAmt))) {
      if (d.amount && e.confidence === 'high') d.amountWas = d.amount;   // shown in the review email
      if (!d.amountUsd || e.confidence === 'high') Object.assign(d, { amount: e.amount, amountUsd: checkedAmt.usd, currency: checkedAmt.currency });
    }
    if (e.relevant === false) d.onBrand = false;
    d.checked = e.confidence;
  }
  for (const d of deals) d.flags = dealFlags(d, cache[d.id]);
  return deals;
}

// ---------- review flags (shown in the Publish email; never on the site) ----------
const weakUrl = (u) => { try { const x = new URL(u); return x.hostname === 'news.google.com' || x.pathname.replace(/\/+$/, '') === ''; } catch { return true; } };
function amountDiffers(d, a) {
  if (!d.amountUsd || !a?.usd) return false;
  return (d.currency && a.currency && d.currency !== a.currency) || Math.abs(d.amountUsd - a.usd) / Math.max(d.amountUsd, a.usd) > 0.12;
}
/** Plain-English reasons to look twice before publishing. Empty array = looks clean. */
export function dealFlags(d, e) {
  const f = [];
  if (!e) f.push('not web-checked');
  else {
    if (e.confidence !== 'high') f.push(`web check is only ${e.confidence || 'low'} confidence`);
    if (d.amountWas) f.push(`amount corrected from ${d.amountWas} to ${d.amount} (per source)`);
    else if (d.amount && !e.amount) f.push('amount not confirmed by the web check');
    else if (d.amount && amountDiffers(d, parseAmount(e.amount))) f.push(`amount may be wrong: source says ${e.amount}`);
    if (e.amountIs && !['round', 'undisclosed'].includes(e.amountIs) && !(e.amountIs === 'valuation' && d.kind === 'valuation') && d.amount && !d.amountWas) f.push(`stored amount looks like a ${e.amountIs.replace('-', ' ')} figure, not the deal size`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.announcedOn || '')) f.push('announcement date not confirmed (could be old news)');
    else if (Date.parse(d.date) - Date.parse(e.announcedOn) > 45 * 864e5) f.push(`old news: first announced ${e.announcedOn}`);
    if (['planned', 'rumour'].includes(e.dealStatus)) f.push(`not a completed deal (${e.dealStatus})`);
  }
  if (!d.country) f.push('no country found (every deal on the tracker shows a flag)');
  if (d.kind === 'raise' && !(d.investors || []).length) f.push('no investor named (the tracker links each deal to its backers)');
  if (d.kind === 'acquisition' && !d.acquirer) f.push('buyer not named');
  if (!d.url) f.push('no source link');
  else if (weakUrl(d.url)) f.push('source link is a homepage or Google News redirect');
  if (d.onBrand === false) f.push('may be off-topic');
  return f;
}

// ---------- 4. status ----------
const STATUS_FROM_QUEUE = { approved: 'approved', rejected: 'hidden', flagged: 'pending', pending: 'pending' };
export function resolveStatus(deals, overrides) {
  for (const d of deals) {
    const o = overrides.deals?.[d.id] || {};
    Object.assign(d, Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'status' && k !== 'why')));
    const q = read(join(QUEUE, `deal-${d.id}.json`), null);
    if (o.status) { d.status = o.status; d.reason = o.why || 'set by Tee'; }
    else if ((overrides.block || []).some((b) => d.entity.toLowerCase().includes(b.toLowerCase()))) { d.status = 'hidden'; d.reason = 'blocked name'; }
    else if (d.vague) { d.status = 'hidden'; d.reason = 'company not named'; }
    else if (q) { d.status = STATUS_FROM_QUEUE[q.status] || 'pending'; d.reason = `queue: ${q.status}`; }
    else { d.status = 'pending'; d.reason = d.onBrand ? 'new' : 'new · may be off-topic'; d._new = days(d.reports.at(-1).date, today) <= QUEUE_DAYS; }
    d.warn = d.onBrand ? undefined : 'may be off-topic';
  }
  return deals;
}

// ---------- 5. queue + email ----------
function signedLink(id, action, ttlDays = 30) {
  const exp = Math.floor(Date.parse(today) / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usdFmt = (n) => (n == null ? 'undisclosed' : n >= 1e9 ? `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}bn` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);

function queueNew(deals) {
  mkdirSync(QUEUE, { recursive: true });
  const fresh = deals.filter((d) => d._new);
  for (const d of fresh) {
    const id = `deal-${d.id}`;
    writeFileSync(join(QUEUE, `${id}.json`), JSON.stringify({ id, kind: 'deal', status: 'pending', title: `${d.entity}: ${d.kind} ${d.amount || ''}`.trim(), dealId: d.id, createdAt: today, flags: d.flags || [], checked: d.checked || '' }, null, 2) + '\n');
  }
  return fresh;
}

async function emailDigest(fresh) {
  if (!fresh.length) { console.log('No new deals to review.'); return; }
  if (process.env.REVIEW_DIGEST === '1') { console.log('→ goes into the morning review email instead of its own email'); return; }
  const btn = (href, label, quiet) => `<a href="${href}" style="display:inline-block;padding:9px 16px;border-radius:999px;font-weight:700;text-decoration:none;margin:4px 6px 0 0;${quiet ? 'border:1px solid #999;color:#333' : 'background:#111;color:#fff'}">${label}</a>`;
  const flagged = fresh.filter((d) => d.flags?.length).length;
  fresh = [...fresh].sort((a, b) => (b.flags?.length ? 1 : 0) - (a.flags?.length ? 1 : 0));
  const flagBox = (d) => d.flags?.length
    ? `<div style="margin:8px 0 4px;padding:8px 10px;border-left:3px solid #b45309;background:#fff7ed;font-size:13px;color:#7c2d12"><b>⚠ Check before publishing</b><br>${d.flags.map((x) => `· ${esc(x)}`).join('<br>')}</div>`
    : '<div style="margin:6px 0 2px;font-size:12px;color:#15803d">✓ Amount, date and source checked</div>';
  const cards = fresh.map((d) => `<div style="border-top:1px solid #ddd;padding:14px 0">
<b>${esc(d.entity)}</b> · ${esc(d.kind)} · ${esc(d.amount || 'amount undisclosed')}${d.amountUsd ? ` (≈ ${usdFmt(d.amountUsd)})` : ''}<br>
<span style="color:#555">${esc(d.note)}</span><br>
<span style="font-size:12px;color:#777">${esc(d.country || d.region)} · ${esc(d.category)}${d.investors?.length ? ' · ' + esc(d.investors.join(', ')) : d.acquirer ? ' · buyer: ' + esc(d.acquirer) : ''}${d.checked ? ` · web-checked (${esc(d.checked)})` : ' · not web-checked'} · first reported ${esc(d.date)}${d.url ? ` · <a href="${esc(d.url)}">source</a>` : ' · no source link'}</span><br>
${flagBox(d)}${btn(signedLink(`deal-${d.id}`, 'approve'), 'Publish')}${btn(signedLink(`deal-${d.id}`, 'reject'), 'Skip', true)}</div>`).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#111">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Deal Tracker · ${fresh.length} new</p>
<h2 style="margin:4px 0 6px">New deals to publish</h2>
<p style="color:#444;margin:0 0 6px">Publish puts the deal on sqwod.life/en/intelligence/deals within minutes. Skip keeps it off. Links valid 30 days.${flagged ? ` <b>${flagged} of ${fresh.length}</b> have a warning and are listed first.` : ''}</p>${cards}</div>`;
  if (args.preview) { writeFileSync(String(args.preview === true ? 'deal-email-preview.html' : args.preview), html); console.log(`preview written: ${args.preview}`); }
  if (!RESEND || !REVIEWER) { console.log(`[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'} ${fresh.length} deal(s)`); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: REVIEWER, subject: `💸 ${fresh.length} new deal${fresh.length > 1 ? 's' : ''} to publish${flagged ? ` (${flagged} to check)` : ''}`, html }) });
  console.log(r.ok ? `Emailed ${fresh.length} deal(s) to review.` : `! email failed: ${r.status} ${await r.text()}`);
}

// ---------- main ----------
function build() {
  const overrides = read(OVERRIDES, { deals: {}, block: [] });
  return resolveStatus(applyEnrichment(merge(collect())), overrides).sort((a, b) => b.date.localeCompare(a.date));
}
function write(deals) {
  mkdirSync(dirname(OUT), { recursive: true });
  const clean = deals.map(({ _new, onBrand, vague: _v, warn, flags: _f, amountWas: _a, ...d }) => d);
  writeFileSync(OUT, JSON.stringify({ generatedAt: today, fx: FX, mergeDays: MERGE_DAYS, deals: clean }, null, 2) + '\n');
}
function review(deals) {
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  for (const st of ['pending', 'hidden', 'approved']) {
    const g = deals.filter((d) => d.status === st);
    console.log(`\n== ${st.toUpperCase()} (${g.length}) ==`);
    for (const d of g) console.log(`${d.date} ${pad(d.entity, 34)} ${pad(d.kind, 11)} ${pad(d.amount, 14)} ${pad(usdFmt(d.amountUsd), 9)} ${pad(d.region, 13)} ${pad(d.category, 22)} ${d.reports.length > 1 ? '×' + d.reports.length : '  '} ${d.url ? '' : 'NO-URL'} ${st !== 'approved' ? '· ' + d.reason : ''}  [${d.id}]`);
  }
}
function selftest() {
  const t = (a, e) => { const r = parseAmount(a); const ok = JSON.stringify(r && [r.usd, r.currency]) === JSON.stringify(e); console.log(`${ok ? '✓' : '✗'} ${a} -> ${JSON.stringify(r && [r.usd, r.currency])}`); return ok; };
  const ok = [t('$10.1 billion', [10100000000, 'USD']), t('$10.1B', [10100000000, 'USD']), t('£235m', [298450000, 'GBP']), t('€12M', [12960000, 'EUR']),
    t('$300–400M', [350000000, 'USD']), t('C$45.75/share', null), t('$800,000', [800000, 'USD']), t('£600K', [762000, 'GBP']), t('$33 million', [33000000, 'USD']), t('', null), t('$1.6M CAD', [1152000, 'CAD']), t('Rs 1.8 crore', [216000, 'INR']), t('$62', null), t('$4–$6 per share', null)].every(Boolean);
  const m = merge([{ date: '2026-09-28', entity: 'WHOOP', kind: 'valuation', amountUsd: 10.1e9, amount: '$10.1B', url: 'a', issue: 'x' },
    { date: '2026-10-27', entity: 'Whoop', kind: 'valuation', amountUsd: 10.1e9, amount: '$10.1 billion', url: 'b', issue: 'y' },
    { date: '2026-10-20', entity: 'PureGym', kind: 'acquisition', amountUsd: 3e8, amount: '£235m', url: '', issue: 'z' },
    { date: '2026-10-26', entity: 'PureGym / NonStop Gym', kind: 'acquisition', amountUsd: 3e8, amount: '£235 million', url: 'c', issue: 'w' }]);
  const mok = m.length === 2 && m.find((d) => d.entity.startsWith('PureGym')).url === 'c';
  console.log(`${mok ? '✓' : '✗'} merge: ${m.length} deals from 4 reports`);
  // review flags (audit 30 Oct 2026: stale valuations, total-raised as round size, IPO plans, homepage links)
  const ft = (name, d, e, want) => { const f = dealFlags({ onBrand: true, url: 'https://example.com/news/a', country: 'United States', ...d }, e); const pass = want.every((w) => f.some((x) => x.includes(w))) && (want.length || f.length === 0); console.log(`${pass ? '✓' : '✗'} flags: ${name} -> ${JSON.stringify(f)}`); return pass; };
  const fok = [
    ft('clean deal', { date: '2026-10-29', amount: '$62M', amountUsd: 62e6, currency: 'USD' }, { confidence: 'high', amount: '$62M', amountIs: 'round', announcedOn: '2026-10-28', dealStatus: 'done' }, []),
    ft('stale valuation', { date: '2026-08-06', amount: '$10.1B', amountUsd: 10.1e9, currency: 'USD' }, { confidence: 'high', amount: '$10.1B', amountIs: 'valuation', announcedOn: '2026-03-31', dealStatus: 'done' }, ['old news', 'valuation']),
    ft('total raised', { date: '2026-10-23', amount: '$25M', amountUsd: 25e6, currency: 'USD', amountWas: '$33 million' }, { confidence: 'high', amount: '$25M', amountIs: 'total-raised', announcedOn: '2026-10-22', dealStatus: 'done' }, ['corrected from $33 million']),
    ft('currency mix-up', { date: '2026-10-21', amount: '€2.5M', amountUsd: 2.7e6, currency: 'EUR' }, { confidence: 'medium', amount: '£2.5M', amountIs: 'round', announcedOn: '2026-10-16', dealStatus: 'done' }, ['source says £2.5M', 'medium']),
    ft('IPO plan', { date: '2026-09-18', amount: '', amountUsd: null }, { confidence: 'high', amount: '', amountIs: 'undisclosed', announcedOn: '2026-09-18', dealStatus: 'planned' }, ['not a completed deal']),
    ft('homepage link, unchecked', { date: '2026-07-09', url: 'https://athletechnews.com/' }, null, ['not web-checked', 'homepage']),
  ].every(Boolean);
  process.exit(ok && mok && fok ? 0 : 1);
}

if (args.selftest) selftest();
else {
  let deals = build();
  if (args.enrich) { await enrich(deals, { all: args.enrich === 'all' }); deals = build(); }
  if (args.review) review(deals);
  else {
    const fresh = args['no-queue'] ? [] : queueNew(deals);
    write(deals);
    const by = (s) => deals.filter((d) => d.status === s).length;
    console.log(`deals.json: ${deals.length} deals · ${by('approved')} approved · ${by('pending')} pending · ${by('hidden')} hidden · ${fresh.length} newly queued`);
    if (args.email) await emailDigest(fresh);
  }
}
