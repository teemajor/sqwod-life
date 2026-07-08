#!/usr/bin/env node
/**
 * Sqwod news ingest — pulls current GLOBAL fitness/wellness-industry headlines
 * and writes a dated source file the cascade turns into a bilingual Sqwod Daily.
 * No API key needed.
 *
 * Two source types, merged + de-duped + variety-gated:
 *   1) Google News RSS across multiple editions (GB first, then US) — global, not US-only.
 *   2) Direct trade/industry RSS feeds (global wellness economy + EN + native DE).
 *
 *   node automation/ingest.mjs                 # writes sources/<today>.json
 *   node automation/ingest.mjs --date=2026-06-19 --max=6
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isOnBrand, OFFTOPIC_RX, FINANCE_OUTLETS_RX } from './onbrand.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'sources');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const MAX = parseInt(args.max || '6', 10);

// Google News editions — GB first to de-bias away from US-only results.
const EDITIONS = [
  { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },   // international / Commonwealth / EU business
  { hl: 'en-US', gl: 'US', ceid: 'US:en' },   // still include US, no longer exclusively
];

// Pillar-mapped queries (global terms — no country lock).
const QUERIES = [
  { q: '(fitness OR wellness OR gym OR "health club") ("raises" OR "funding round" OR "Series A" OR "Series B" OR "seed round" OR acquires OR acquisition OR valuation OR IPO) when:5d', pillar: 'industry-trends', conversion: 'sqwod-os' },
  { q: '("boutique fitness" OR gym OR "fitness studio" OR "fitness franchise" OR "health club") (opens OR expansion OR launches OR membership OR pricing OR revenue OR closes) when:4d', pillar: 'business-strategy', conversion: 'pods' },
  { q: '(wearable OR "smart ring" OR Oura OR Whoop OR Garmin OR "fitness tracker" OR Peloton) (launch OR review OR feature OR funding OR partnership) when:6d', pillar: 'operations-technology', conversion: 'verified' },
  { q: '("AI" OR "artificial intelligence") (fitness OR gym OR coaching OR workout OR wellness OR "personal training") when:6d', pillar: 'ai-automation', conversion: 'sqwod-ai' },
  { q: '("personal trainer" OR "fitness coach" OR "online coaching") (business OR clients OR pricing OR platform OR income) when:7d', pillar: 'business-strategy', conversion: 'pods' },
  { q: '(longevity OR recovery OR supplements OR "cold plunge" OR sauna OR "creatine") (market OR brand OR launch OR study OR trend) when:6d', pillar: 'industry-trends', conversion: 'list-growth' },
  { q: '(fitness OR wellness) (influencer OR creator OR "social media") (brand OR marketing OR campaign OR deal) when:6d', pillar: 'marketing-visibility', conversion: 'sqwod-os' },
  { q: '("wellness economy" OR "fitness industry" OR "health club industry") (global OR Europe OR Asia OR "market size" OR report OR forecast OR growth) when:7d', pillar: 'industry-trends', conversion: 'sqwod-os' },
];

// Direct trade/industry RSS — diversity Google News flattens. Verified to resolve.
// Items from these curated feeds skip the keyword RELEVANT gate (already on-topic).
const FEEDS = [
  { url: 'https://globalwellnessinstitute.org/feed/', outlet: 'Global Wellness Institute', pillar: 'industry-trends', conversion: 'list-growth' },
  { url: 'https://www.welltodoglobal.com/feed/', outlet: 'Welltodo', pillar: 'business-strategy', conversion: 'sqwod-os' },
  { url: 'https://insider.fitt.co/feed/', outlet: 'Fitt Insider', pillar: 'industry-trends', conversion: 'sqwod-os' },
  { url: 'https://athletechnews.com/feed/', outlet: 'Athletech News', pillar: 'operations-technology', conversion: 'verified' },
  { url: 'https://www.healthandfitness.org/feed/', outlet: 'Health & Fitness Association', pillar: 'business-strategy', conversion: 'pods' },
  { url: 'https://www.bodylife.com/feed/', outlet: 'body LIFE', pillar: 'business-strategy', conversion: 'pods', lang: 'de' },
  { url: 'https://www.dssv.de/feed/', outlet: 'DSSV', pillar: 'business-strategy', conversion: 'pods', lang: 'de' },
  { url: 'https://www.trainingsworld.com/feed/', outlet: 'Trainingsworld', pillar: 'operations-technology', conversion: 'products', lang: 'de' },
];

// Relevance is now decided by isOnBrand() (automation/onbrand.mjs): a story must
// carry a STRONG industry term AND not match the finance/markets OFFTOPIC list.
// The old RELEVANT regex accepted ambiguous words ("recovery", "strength") alone —
// that's how a gold/XAU story slipped into the 2026-07-08 Daily. Never again.
const JUNK = /(\bhoroscope\b|\bzodiac\b|\brecipe\b|\bkardashian\b|\broyal\b|^meet\s|\bquiz\b|\bweight loss pill\b|\bcelebrit|sponsored content|\bdeal of the day\b)/i;

const decode = (s) => s
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

// Handles RSS (<item>) AND Atom (<entry>) feeds.
function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const pub = decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
    const source = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
    if (title && link) items.push({ title, link, pub, source });
  }
  for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    let link = '';
    const links = [...b.matchAll(/<link[^>]*href="([^"]+)"[^>]*>/g)];
    if (links.length) { const alt = links.find((x) => /rel="alternate"/.test(x[0])) || links[0]; link = decode(alt[1]); }
    const pub = decode((b.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/) || [])[1] || '');
    if (title && link) items.push({ title, link, pub, source: '' });
  }
  return items;
}

// Map a headline to a reader-facing LANE (move | build | gear | signal) + conversion.
function classify(t, prior) {
  const s = t.toLowerCase();
  // GEAR — physical products / devices to buy
  if (/\b(wearable|smart ring|tracker|oura|whoop|garmin|fitbit|apple watch|device|gadget|headphones|earbuds|treadmill|equipment|buyer'?s guide|best \w+ for)\b/.test(s)) return ['gear', 'verified'];
  // MOVE — training, technique, programming, the body
  if (/\b(workout|exercise|movement|mobility|stretch|technique|programming|reps|sets|muscle|hypertrophy|strength training|recovery|sleep|warm-?up|squat|deadlift|bench|pilates|yoga|run(ning)?)\b/.test(s)) return ['move', 'products'];
  // BUILD — operators, business, AI/automation, marketing, founders
  if (/\b(ai|a\.i\.|automation|chatbot|gpt|prompt|coach|coaching|personal train|studio|gym owner|franchise|membership|pricing|revenue|retention|client|marketing|brand|influencer|creator|founder|ceo|hiring|operations|saas|platform)\b/.test(s)) {
    return ['build', /\b(ai|a\.i\.|automation|gpt|prompt|chatbot)\b/.test(s) ? 'sqwod-ai' : 'pods'];
  }
  // SIGNAL — market data, funding, trends, policy, the macro picture
  if (/\b(raise|raises|raised|funding|\$\d|€\d|million|billion|valuation|ipo|m&a|merger|acqui|market|report|forecast|trend|growth|longevity|study|economy|regulation|policy|wellness economy)\b/.test(s)) return ['signal', 'sqwod-os'];
  return ['signal', (prior && prior.conversion) || 'list-growth'];
}

function moneyKind(t) {
  const s = t.toLowerCase();
  if (/\b(acquir|acquisition|buys|merger|m&a)\b/.test(s)) return 'acquisition';
  if (/\b(ipo|goes public)\b/.test(s)) return 'ipo';
  if (/\b(valuation|valued at)\b/.test(s)) return 'valuation';
  if (/\b(shuts down|shutting down|bankrupt|closes)\b/.test(s)) return 'shutdown';
  if (/\b(raise|raises|raised|funding|seed|series [a-d]|invest)\b/.test(s)) return 'raise';
  return null;
}
function moneyAmount(t) {
  const m = t.match(/([$€£]\s?\d[\d.,]*\s?(?:k|m|bn|b|million|billion)?)/i);
  return m ? m[1].replace(/\s+/g, '') : '';
}

// ---- editorial scoring: rank candidates so the issue serves OUR reader --------
// Reader = DE/EN coaches, PTs, studio founders, operators. We up-rank stories they
// can act on, native DACH/EU coverage, and globally-legible numbers; we down-rank
// hyper-local micro-raises in currencies our reader can't size (₹/crore, ¥, etc.).
const OPERATOR_RX = /\b(retention|churn|pricing|price|membership|revenue|profit|margin|clients?|acquisition|leads?|marketing|brand|franchise|studio|gym owner|operator|coach|coaching|personal train|onboarding|scheduling|booking|staff|hiring|payroll|programming|community|referral|loyalty|no-?show|upsell|class(es)?|boutique)\b/i;
const DACH_EU_RX = /\b(german|germany|berlin|munich|münchen|hamburg|cologne|köln|frankfurt|dach|austria|vienna|wien|swiss|switzerland|zurich|zürich|europe|european|\beu\b|uk|britain|london|nordic|france|paris|spain|madrid|italy|milan|netherlands|amsterdam)\b/i;
const LEGIBLE_MONEY_RX = /([$€£]\s?\d|\bUSD\b|\bEUR\b|\bGBP\b|\b\d[\d.,]*\s?(?:k|m|bn|million|billion)\b)/i;
const ILLEGIBLE_MONEY_RX = /(\bcrore\b|\blakh\b|\brs\.?\s?\d|₹|¥|\brmb\b|\byuan\b|₩|\bwon\b|\brupees?\b|\bpesos?\b|\bbaht\b|\bringgit\b|\brupiah\b|\bnaira\b|\btaka\b|\bdirham\b)/i;

function scoreCandidate({ headline, trade, lang, money }) {
  const h = headline || '';
  let s = 0;
  if (trade) s += 3;                        // curated trade/global feeds = higher signal
  if (lang === 'de') s += 3;                // native DACH content = core audience
  if (OPERATOR_RX.test(h)) s += 4;          // directly useful to a coach/studio operator
  if (DACH_EU_RX.test(h)) s += 2;           // EU/DACH geography
  if (LEGIBLE_MONEY_RX.test(h)) s += 1;     // reader can size the number
  if (ILLEGIBLE_MONEY_RX.test(h)) s -= 4;   // ₹/crore/¥/etc. — illegible to our reader
  if (money && money.kind === 'raise' && ILLEGIBLE_MONEY_RX.test(h)) s -= 3;  // hyper-local micro-raise
  return s;
}

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; sqwod-ingest/2.0)' };
async function getXml(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Near-duplicate detection: two outlets covering the SAME event (e.g. the same
// funding round) write different headlines + different URLs, so exact-match
// de-dupe misses them and the same story lands twice in The Rundown. We compare
// the salient tokens (company + number + verb) and collapse the pair, keeping the
// first (curated/trade feeds are added first, so they win).
const DUP_STOP = new Set(['the','a','an','to','of','for','and','in','on','with','its','is','as','at','by','new','now','says','said','after','into','from','more','than','that','this','will','how','why','amid','over','under','your','you','fitness','wellness','industry','report','plans','plan']);
function dupTokens(h) {
  return new Set(String(h).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !DUP_STOP.has(w)));
}
function isNearDup(tok, pool) {
  if (tok.size === 0) return false;
  for (const p of pool) {
    const b = p._tok || (p._tok = dupTokens(p.headline));
    if (b.size === 0) continue;
    let o = 0; for (const t of tok) if (b.has(t)) o++;
    if (o >= 4 || (o >= 2 && o / Math.min(tok.size, b.size) >= 0.6)) return true;
  }
  return false;
}

// Add a normalized candidate to the pool (with headline-level + near-duplicate de-dupe).
function add(pool, seen, { headline, outlet, link, pub, pillar, conversion, trade = false, lang = '' }) {
  if (!headline || !link) return;
  if (JUNK.test(headline)) return;
  // Hard off-brand gate for EVERY candidate — including curated trade feeds.
  if (OFFTOPIC_RX.test(headline) || FINANCE_OUTLETS_RX.test(String(outlet || '').trim())) return;
  const key = headline.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60);
  if (seen.has(key)) return;
  const tok = dupTokens(headline);
  if (isNearDup(tok, pool)) return;   // same story, different outlet → skip
  seen.add(key);
  const kind = moneyKind(headline);
  const money = kind ? { kind, amount: moneyAmount(headline) } : null;
  pool.push({ headline, outlet, link, pub, pillar, conversion, trade, money, _tok: tok, _score: scoreCandidate({ headline, trade, lang, money }) });
}

async function run() {
  const pool = [];
  const seen = new Set();
  let scanned = 0;

  // 1) Google News across editions (global-leaning).
  for (const qo of QUERIES) {
    for (const ed of EDITIONS) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(qo.q)}&hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.ceid}`;
      try {
        for (const it of parseItems(await getXml(url))) {
          scanned++;
          const cut = it.title.lastIndexOf(' - ');
          const headline = cut > 20 ? it.title.slice(0, cut) : it.title;
          const outlet = it.source || (cut > 20 ? it.title.slice(cut + 3) : 'source');
          if (!isOnBrand(headline, outlet)) continue;   // strong industry term required; finance/markets always out
          const [pillar, conversion] = classify(headline, qo);
          add(pool, seen, { headline, outlet, link: it.link, pub: it.pub, pillar, conversion });
        }
      } catch (e) { console.error('google', ed.ceid, qo.q.slice(0, 30), e.message); }
    }
  }

  // 2) Direct trade / global-wellness feeds (curated → skip keyword gate).
  for (const f of FEEDS) {
    try {
      for (const it of parseItems(await getXml(f.url))) {
        scanned++;
        const headline = it.title;
        const [pillar, conversion] = classify(headline, f);
        add(pool, seen, { headline, outlet: f.outlet, link: it.link, pub: it.pub, pillar, conversion, trade: true, lang: f.lang || '' });
      }
    } catch (e) { console.error('feed', f.outlet, e.message); }
  }

  console.error(`scanned ${scanned}, kept ${pool.length} unique candidates`);

  // Variety gate: spread across pillars AND cap per outlet so no single source
  // (or topic) dominates. Raise the per-outlet cap only if we can't fill MAX.
  const byPillar = {};
  for (const p of pool) (byPillar[p.pillar] ||= []).push(p);
  // Rank within each pillar by editorial score (operator-relevance, DACH/EU, legible
  // numbers; micro-raises in illegible currencies sink), tie-broken toward trade feeds.
  for (const arr of Object.values(byPillar)) arr.sort((a, b) => (b._score - a._score) || ((b.trade === true) - (a.trade === true)));
  const ordered = [];
  const outletN = {};
  for (let cap = 1; cap <= 3 && ordered.length < MAX; cap++) {
    let round = 0, progress = true;
    while (ordered.length < MAX && progress) {
      progress = false;
      for (const arr of Object.values(byPillar)) {
        const item = arr[round];
        if (!item || ordered.includes(item)) continue;
        if ((outletN[item.outlet] || 0) >= cap) continue;
        ordered.push(item); outletN[item.outlet] = (outletN[item.outlet] || 0) + 1;
        progress = true;
        if (ordered.length >= MAX) break;
      }
      round++;
      if (round > 50) break;
    }
  }

  const sources = ordered.map((p, i) => ({
    id: `news-${date}-${i + 1}`,
    entity: p.outlet,
    topic: p.headline,
    pillar: p.pillar,
    conversion: p.conversion,
    provenance: `${p.outlet} (${p.pub || date})`,
    facts: [
      { label: 'Story', value: p.headline },
      { label: 'Outlet', value: p.outlet },
      ...(p.money ? [{ label: 'Deal', value: `${p.money.kind}${p.money.amount ? ' ' + p.money.amount : ''}` }] : []),
    ],
    en: { headline: p.headline, dek: `Via ${p.outlet}.`, readMore: p.link },
    de: { headline: p.headline, dek: `Via ${p.outlet}.`, readMore: p.link },
  }));

  mkdirSync(OUT, { recursive: true });
  if (!sources.length) { console.error('No stories ingested — leaving sources untouched.'); process.exit(0); }
  writeFileSync(join(OUT, `${date}.json`), JSON.stringify(sources, null, 2));
  console.log(`✓ ingested ${sources.length} stories (from ${Object.keys(outletN).length} outlets) → automation/sources/${date}.json`);
  sources.forEach((s) => console.log(`  · [${s.pillar}] ${s.topic}  (${s.entity})`));
}
run();
