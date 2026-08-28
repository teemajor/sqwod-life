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
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isOnBrand, OFFTOPIC_RX, FINANCE_OUTLETS_RX, primaryEntity, allEntities, WATCHLIST_RX, DEAL_RX } from './onbrand.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'sources');
const LEDGER_PATH = join(__dirname, 'covered-ledger.json');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const MAX = parseInt(args.max || '6', 10);
// Freshness: a DAILY only ships genuinely recent news. Anything older than this
// (by its own pubDate) is dropped — this is what stops evergreen feed posts (a Jan
// DSSV/Trainingsworld piece) from resurfacing as "today's" lead every single day.
const MAX_AGE_DAYS = parseInt(args['max-age'] || '10', 10);
// Cross-day memory: how long a story we've already covered stays "seen" so it can't
// lead the Daily again tomorrow. The single biggest fix for the repetition problem.
const LEDGER_DAYS = parseInt(args['ledger-days'] || '21', 10);
// Entity-diversity cooldown: dedupe stops the SAME story repeating, but not the same
// COMPANY leading several issues in a row with fresh follow-on angles (Garmin buys
// TrainingPeaks → "Garmin owns your coaching stack" → "Garmin AI marathon"). We look
// back this many published issues and down-weight any candidate whose primary entity
// already appeared, decaying with age (most-recent issue = full penalty). The story can
// still land lower in the Rundown — it just stops hogging the lead. 0 disables.
const ENTITY_COOLDOWN = parseInt(args['entity-cooldown'] || '3', 10);
const ENTITY_PENALTY = parseFloat(args['entity-penalty'] || '5');
const NOW = date ? new Date(`${date}T12:00:00Z`).getTime() : Date.now();

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
  // Fitt-Insider-adjacent beat (added 2026-07-23): the "future of health" money + science
  // stories our reader keeps seeing elsewhere. Scoped so the on-brand STRONG gate still
  // filters, and freshness-bounded so they're never stale.
  { q: '("digital health" OR "health tech" OR "wellness startup" OR longevity OR "metabolic health") (raises OR "Series A" OR "Series B" OR "Series C" OR acquires OR acquisition OR "growth capital" OR IPO OR valuation) when:6d', pillar: 'industry-trends', conversion: 'sqwod-os' },
  { q: '("GLP-1" OR Ozempic OR Wegovy OR Mounjaro OR peptide OR "metabolic health" OR longevity) (fitness OR gym OR wellness OR muscle OR coach OR nutrition OR training) when:7d', pillar: 'industry-trends', conversion: 'list-growth' },
  { q: '(Oura OR Whoop OR "Eight Sleep" OR "preventive health" OR "health screening" OR biohacking OR "recovery tech") (funding OR partnership OR launch OR raises OR study OR acquisition) when:6d', pillar: 'operations-technology', conversion: 'verified' },
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

// Newswire / PR-distribution feeds (added 2026-08-20).
//
// WHY THESE ARE NOT JUST MORE `FEEDS`: a wire's own topic tagging is close to
// noise. Verified by fetching them before wiring them in —
//   · PR Newswire "health"   → mostly pharma, plus pay-to-play vanity releases
//                              ("The Inner Circle acknowledges … Preferred Psychiatrist")
//                              and the same release posted twice a minute apart.
//   · PR Newswire "sports"   → gold mining, dental practices, law-firm awards.
//   · GlobeNewswire "health" → mining, WWI shipwreck preservation, 3 language variants.
//   · PR Newswire "consumer" → one skincare release repeated in 5 languages.
// Business Wire is excluded: its feed host disallows automated fetching in robots.txt.
// openPR returns 403.
//
// So a wire item must clear MORE gates than a trade item, not fewer:
//   isOnBrand() STRONG  AND  (a company on our watchlist OR a real deal/launch event)
//   AND not wire-vanity boilerplate  AND not a translation of one we already took.
// They are capped, score-penalised so they can never lead an issue, and labelled
// as company announcements — a press release is the company's own claim, not reporting.
const WIRES = [
  { url: 'https://www.prnewswire.com/rss/health-latest-news/health-latest-news-list.rss',
    outlet: 'PR Newswire', pillar: 'industry-trends', conversion: 'sqwod-os' },
  { url: 'https://www.prnewswire.com/rss/consumer-products-retail-latest-news/consumer-products-retail-latest-news-list.rss',
    outlet: 'PR Newswire', pillar: 'industry-trends', conversion: 'verified' },
  { url: 'https://www.globenewswire.com/RssFeed/subjectcode/23-Health/feedTitle/GlobeNewswire-Health',
    outlet: 'GlobeNewswire', pillar: 'industry-trends', conversion: 'sqwod-os' },
];
// Wire content reached through Google News rather than the wires' own category
// feeds — Google does the topic matching the wires don't. Same strict wire gate
// applies on the way in. `edge.prnewswire.com` is PR Newswire's paid content-
// syndication subdomain (pure advertising: "Shokz Official", "Doctor's Best") and
// is blocked outright below.
const WIRE_SITES = 'site:prnewswire.com OR site:businesswire.com OR site:globenewswire.com OR site:einpresswire.com OR site:accesswire.com';
const WIRE_QUERIES = [
  { q: `(${WIRE_SITES}) (fitness OR gym OR "health club" OR "personal training" OR wearable OR "fitness tracker" OR supplement OR recovery OR longevity OR wellness) (launches OR raises OR acquires OR acquisition OR partnership OR expansion OR opens OR funding) when:5d`,
    pillar: 'industry-trends', conversion: 'sqwod-os' },
  { q: `(site:presseportal.de OR site:openpr.de OR ${WIRE_SITES}) (Fitness OR Fitnessstudio OR Gesundheit OR Wearable OR "Nahrungsergänzung" OR Wellness) (startet OR übernimmt OR Übernahme OR Finanzierung OR Kooperation OR eröffnet) when:6d`,
    pillar: 'industry-trends', conversion: 'pods', lang: 'de', ed: { hl: 'de', gl: 'DE', ceid: 'DE:de' } },
];
// PR Newswire's advertising subdomain — never a story.
const WIRE_HOST_BLOCK = /(^|\.)edge\.prnewswire\.com$|(^|\/\/)edge\.prnewswire\.com/i;

// How many wire items may reach the issue at all. Wires are a supporting source
// for the money beat, never the substance of the Daily.
const MAX_WIRE = parseInt(args['max-wire'] || '2', 10);

// Pay-to-play and vanity releases — the dominant failure mode on the health wires.
const WIRE_VANITY = /(\binner circle\b|\bmarquis\b|who'?s who|\bbest lawyers\b|ones to watch|\bpreferred (?:psychiatrist|physician|dentist|provider|professional)\b|\btop (?:doctor|dentist|lawyer|100)\b|recognized (?:in|as|by)|named (?:to|one of) the\b|\baward winner\b|\bhonoree\b|proudly announces its recognition)/i;
// Personnel announcements. A wire's single most common release type and never a
// Daily story — "Ashleigh Barker Joins Stout's Consumer Investment Banking Team"
// was outscoring a real EoS Fitness / HYROX partnership before this gate existed.
const WIRE_PERSONNEL = /(\bjoins?\b.{0,40}\b(team|group|board|practice|firm|division|as\b)|\bappoints?\b|\bappointment of\b|\bnames?\b\s+[A-Z][a-z]+\s+[A-Z]|\bhires?\b|\bwelcomes?\b\s+[A-Z][a-z]+|promoted to\b|\bsteps down\b|\bto retire\b|\bnew (?:ceo|cfo|coo|cmo|cto|president|chair(?:man)?|managing director|vice president)\b|\b(?:ceo|cfo|coo|cmo|cto) transition\b)/i;

// Wires publish one release in many languages within minutes ("MimiSilk …" in
// EN/DE/ES/FR/SK). Near-dup token matching is English-shaped and misses these,
// so collapse on the invariant part: the named subject plus the numbers.
function wireDupKey(headline) {
  const nums = (headline.match(/\d[\d.,]*/g) || []).slice(0, 3).join('-');
  const ent = (primaryEntity(headline)
    || (headline.match(/\b[A-Z][A-Za-z0-9&'\u2019-]{2,}\b/) || [''])[0] || '').toLowerCase();
  return ent + '|' + nums;
}

// Relevance is now decided by isOnBrand() (automation/onbrand.mjs): a story must
// carry a STRONG industry term AND not match the finance/markets OFFTOPIC list.
// The old RELEVANT regex accepted ambiguous words ("recovery", "strength") alone —
// that's how a gold/XAU story slipped into the 2026-07-08 Daily. Never again.
const JUNK = /(\bhoroscope\b|\bzodiac\b|\brecipe\b|\bkardashian\b|\broyal\b|^meet\s|\bquiz\b|\bweight loss pill\b|\bcelebrit|sponsored content|\bdeal of the day\b)/i;
// Advertorial / non-story noise. WordPress "Geschützt:"/"Protected:" posts are
// password-gated (no readable story), and webinar/whitepaper promos are ads, not news
// — these are exactly the body LIFE / DSSV items that kept leading the Daily. Drop them.
const PROMO = /(^\s*(?:geschützt|protected)\s*:|password[-\s]?protected|\bwebinar\b|\bwhite\s?paper\b|jetzt anmelden|kostenlos(?:es)?\s+(?:webinar|e-?book|whitepaper)|\badvertorial\b|présentée? par|präsentiert von)/i;

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

// Age of a story in days from its pubDate (RFC-822 or ISO). null when the feed
// gives no parseable date — we keep those but never treat them as fresh.
function ageDays(pub) {
  if (!pub) return null;
  const t = Date.parse(pub);
  if (Number.isNaN(t)) return null;
  return (NOW - t) / 86400000;
}

// ---- editorial scoring: rank candidates so the issue serves OUR reader --------
// Reader = DE/EN coaches, PTs, studio founders, operators. We up-rank stories they
// can act on, native DACH/EU coverage, and globally-legible numbers; we down-rank
// hyper-local micro-raises in currencies our reader can't size (₹/crore, ¥, etc.).
const OPERATOR_RX = /\b(retention|churn|pricing|price|membership|revenue|profit|margin|clients?|acquisition|leads?|marketing|brand|franchise|studio|gym owner|operator|coach|coaching|personal train|onboarding|scheduling|booking|staff|hiring|payroll|programming|community|referral|loyalty|no-?show|upsell|class(es)?|boutique)\b/i;
const DACH_EU_RX = /\b(german|germany|berlin|munich|münchen|hamburg|cologne|köln|frankfurt|dach|austria|vienna|wien|swiss|switzerland|zurich|zürich|europe|european|\beu\b|uk|britain|london|nordic|france|paris|spain|madrid|italy|milan|netherlands|amsterdam)\b/i;
const LEGIBLE_MONEY_RX = /([$€£]\s?\d|\bUSD\b|\bEUR\b|\bGBP\b|\b\d[\d.,]*\s?(?:k|m|bn|million|billion)\b)/i;
const ILLEGIBLE_MONEY_RX = /(\bcrore\b|\blakh\b|\brs\.?\s?\d|₹|¥|\brmb\b|\byuan\b|₩|\bwon\b|\brupees?\b|\bpesos?\b|\bbaht\b|\bringgit\b|\brupiah\b|\bnaira\b|\btaka\b|\bdirham\b)/i;

const DEAL_KINDS = new Set(['raise', 'acquisition', 'ipo', 'valuation']);
function scoreCandidate({ headline, trade, wire, lang, money, age }) {
  const h = headline || '';
  let s = 0;
  if (trade) s += 3;                        // curated trade/global feeds = higher signal
  if (wire) s -= 2;                         // press release = the company's own claim, so it
                                            // loses ties to reported journalism. Kept mild:
                                            // the lead slot is blocked deterministically below,
                                            // so this only needs to break ties, not bury good
                                            // wire stories (a -6 penalty sank "EoS Fitness and
                                            // HYROX Join Forces" — exactly what we want to keep).
  if (lang === 'de') s += 2;                // native DACH content = core audience (was +3;
                                            // trimmed so fresh global money/M&A isn't buried
                                            // under a handful of low-velocity German feeds)
  if (OPERATOR_RX.test(h)) s += 4;          // directly useful to a coach/studio operator
  if (DACH_EU_RX.test(h)) s += 2;           // EU/DACH geography
  if (LEGIBLE_MONEY_RX.test(h)) s += 1;     // reader can size the number
  if (ILLEGIBLE_MONEY_RX.test(h)) s -= 4;   // ₹/crore/¥/etc. — illegible to our reader
  if (money && money.kind === 'raise' && ILLEGIBLE_MONEY_RX.test(h)) s -= 3;  // hyper-local micro-raise
  // Freshness reward: a daily should feel like today. Brand-new stories beat week-old ones
  // even when both survive the age gate — this is what keeps the lead moving day to day.
  if (age != null) { if (age <= 2) s += 3; else if (age <= 5) s += 1; }
  // The Fitt-beat signal: a legible funding round / M&A / IPO is exactly the news our reader
  // sees elsewhere and expects from us. Make sure it competes with operator how-tos.
  if (money && DEAL_KINDS.has(money.kind) && LEGIBLE_MONEY_RX.test(h)) s += 3;
  return s;
}

// ---- cross-day "already covered" ledger ---------------------------------
// Persist a rolling record of every story we've shipped so the SAME item (or the
// same event under a different outlet's headline) can't lead the Daily again for
// LEDGER_DAYS. Without this the ranker re-picks the top-scoring evergreen every run.
function loadLedger() {
  try {
    const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    const entries = Array.isArray(raw) ? raw : (raw.entries || []);
    const cutoff = NOW - LEDGER_DAYS * 86400000;
    return entries
      .filter((e) => e && e.date && new Date(`${e.date}T12:00:00Z`).getTime() >= cutoff)
      .map((e) => ({ ...e, _tok: new Set(e.tokens || []) }));
  } catch { return []; }
}
const normUrl = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
function seenBefore(tok, url, ledger) {
  const nu = normUrl(url);
  for (const e of ledger) {
    if (nu && e.url && normUrl(e.url) === nu) return true;   // exact same link
    if (isNearDup(tok, [e])) return true;                    // same event, different headline
  }
  return false;
}
function saveLedger(ledger, shipped) {
  const out = ledger.map((e) => ({ date: e.date, key: e.key, url: e.url, tokens: [...(e._tok || e.tokens || [])], ...(e.entities ? { entities: e.entities } : {}) }));
  for (const s of shipped) out.push({ date, key: s.key, url: s.url, tokens: [...s._tok], ...(s._ents && s._ents.length ? { entities: s._ents } : {}) });
  try { writeFileSync(LEDGER_PATH, JSON.stringify(out, null, 2)); }
  catch (e) { console.error('ledger write failed:', e.message); }
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

// Add a normalized candidate to the pool (with headline-level + near-duplicate de-dupe,
// a freshness gate, and cross-day de-dupe against the covered ledger).
function add(pool, seen, ledger, { headline, outlet, link, pub, pillar, conversion, trade = false, wire = false, lang = '', wireSeen = null }) {
  if (!headline || !link) return;
  if (JUNK.test(headline) || PROMO.test(headline)) return;   // horoscopes, webinars, protected posts
  if (wire) {
    // A wire item earns its place or it doesn't get one. See the WIRES comment.
    if (WIRE_HOST_BLOCK.test(link) || WIRE_HOST_BLOCK.test(String(outlet || ''))) return;
    if (WIRE_VANITY.test(headline) || WIRE_PERSONNEL.test(headline)) return;
    if (!isOnBrand(headline, outlet)) return;
    if (!(WATCHLIST_RX.test(headline) || DEAL_RX.test(headline))) return;
    if (wireSeen) {
      const wk = wireDupKey(headline);
      if (wireSeen.has(wk)) return;          // same release, another language
      wireSeen.add(wk);
    }
  }
  // Hard off-brand gate for EVERY candidate — including curated trade feeds.
  if (OFFTOPIC_RX.test(headline) || FINANCE_OUTLETS_RX.test(String(outlet || '').trim())) return;
  // Freshness gate: drop anything older than MAX_AGE_DAYS by its own pubDate. This is
  // what kills the evergreen-feed repeat (a Jan Trainingsworld / Jun DSSV post leading
  // "today's" issue). Undated items pass (rare) but never earn the freshness boost.
  const age = ageDays(pub);
  if (age != null && age > MAX_AGE_DAYS) return;
  const key = headline.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60);
  if (seen.has(key)) return;
  const tok = dupTokens(headline);
  if (isNearDup(tok, pool)) return;               // same story, different outlet → skip
  if (seenBefore(tok, link, ledger)) return;      // already covered in the last LEDGER_DAYS → skip
  seen.add(key);
  const kind = moneyKind(headline);
  const money = kind ? { kind, amount: moneyAmount(headline) } : null;
  pool.push({ headline, outlet, link, pub, pillar, conversion, trade, wire, pressRelease: wire || undefined, money, key, _tok: tok, _score: scoreCandidate({ headline, trade, wire, lang, money, age }) });
}

async function run() {
  const pool = [];
  const seen = new Set();
  const ledger = loadLedger();
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
          add(pool, seen, ledger, { headline, outlet, link: it.link, pub: it.pub, pillar, conversion });
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
        add(pool, seen, ledger, { headline, outlet: f.outlet, link: it.link, pub: it.pub, pillar, conversion, trade: true, lang: f.lang || '' });
      }
    } catch (e) { console.error('feed', f.outlet, e.message); }
  }

  // 3) Newswires / PR distribution — strictest gate, hard cap, never the lead.
  const wireSeen = new Set();
  const wireBefore = pool.length;
  for (const w of WIRES) {
    try {
      for (const it of parseItems(await getXml(w.url))) {
        scanned++;
        const headline = it.title;
        const [pillar, conversion] = classify(headline, w);
        add(pool, seen, ledger, {
          headline, outlet: `${w.outlet} (press release)`, link: it.link, pub: it.pub,
          pillar, conversion, wire: true, lang: w.lang || '', wireSeen,
        });
      }
    } catch (e) { console.error('wire', w.outlet, e.message); }
  }
  // 3b) Wire content via Google News — better topic matching than the wires' own feeds.
  for (const wq of WIRE_QUERIES) {
    const ed = wq.ed || EDITIONS[0];
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(wq.q)}&hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.ceid}`;
    try {
      for (const it of parseItems(await getXml(url))) {
        scanned++;
        const headline = it.title.replace(/\s+-\s+[^-]+$/, '').trim();   // strip " - Outlet" suffix
        const [pillar, conversion] = classify(headline, wq);
        add(pool, seen, ledger, {
          headline, outlet: `${(it.source || 'Newswire').trim()} (press release)`,
          link: it.link, pub: it.pub, pillar, conversion,
          wire: true, lang: wq.lang || '', wireSeen,
        });
      }
    } catch (e) { console.error('wire-query', e.message); }
  }

  if (args['debug-wire']) {
    console.error('--- wire candidates that passed the gate ---');
    for (const p of pool.filter((x) => x.wire).sort((a, b) => b._score - a._score))
      console.error(`   [${p._score.toFixed(1)}] ${p.outlet} — ${p.headline.slice(0, 95)}`);
  }

  // Cap: keep only the strongest MAX_WIRE wire candidates, drop the rest before
  // they can crowd out reported journalism in the variety gate.
  const wireCands = pool.filter((p) => p.wire).sort((a, b) => b._score - a._score);
  if (wireCands.length > MAX_WIRE) {
    const drop = new Set(wireCands.slice(MAX_WIRE));
    for (let i = pool.length - 1; i >= 0; i--) if (drop.has(pool[i])) pool.splice(i, 1);
  }
  console.error(`wires: ${pool.length - wireBefore + Math.max(0, wireCands.length - MAX_WIRE)} passed the gate, ${Math.min(wireCands.length, MAX_WIRE)} kept`);

  console.error(`scanned ${scanned}, kept ${pool.length} unique candidates (ledger: ${ledger.length} recent stories excluded from repeats)`);

  // Entity-diversity cooldown: down-weight candidates whose primary entity led/appeared
  // in the last ENTITY_COOLDOWN issues, decaying with age. This is what stops one company
  // (Garmin, Whoop, …) headlining the Daily three days running on evolving coverage that
  // the near-dup guard reads as separate stories.
  for (const p of pool) { p._ents = allEntities(p.headline); p._ent = p._ents[0] || null; }
  if (ENTITY_COOLDOWN > 0 && ENTITY_PENALTY > 0) {
    const recentIssues = [...new Set(ledger.map((e) => e.date).filter(Boolean))].sort().reverse().slice(0, ENTITY_COOLDOWN);
    const entByIssue = {};   // date → Set(all entities covered that day)
    for (const e of ledger) {
      if (!recentIssues.includes(e.date)) continue;
      const ents = (Array.isArray(e.entities) && e.entities.length) ? e.entities : allEntities(e.key || (e.tokens || []).join(' '));
      if (ents.length) (entByIssue[e.date] ||= new Set(), ents.forEach((x) => entByIssue[e.date].add(x)));
    }
    const penalized = {};
    for (const p of pool) {
      if (!p._ents.length) continue;
      let pen = 0;
      recentIssues.forEach((d, i) => {
        const hit = entByIssue[d] && p._ents.some((x) => entByIssue[d].has(x));
        if (hit) pen += ENTITY_PENALTY / (i + 1);
      });
      if (pen > 0) { p._score -= pen; const lbl = p._ents.join('/'); penalized[lbl] = Math.max(penalized[lbl] || 0, pen); }
    }
    const summary = Object.entries(penalized).map(([e, v]) => `${e} −${v.toFixed(1)}`).join(', ');
    if (summary) console.error(`entity cooldown (last ${recentIssues.length} issues): ${summary}`);
  }

  // Variety gate: spread across pillars AND cap per outlet so no single source
  // (or topic) dominates. Raise the per-outlet cap only if we can't fill MAX.
  const byPillar = {};
  for (const p of pool) (byPillar[p.pillar] ||= []).push(p);
  // Rank within each pillar by editorial score (operator-relevance, DACH/EU, legible
  // numbers; micro-raises in illegible currencies sink), tie-broken toward trade feeds.
  for (const arr of Object.values(byPillar)) arr.sort((a, b) => (b._score - a._score) || ((b.trade === true) - (a.trade === true)));
  const ordered = [];
  const outletN = {};
  const entN = {};   // in-issue cap: same subject entity can't fill multiple slots until we're forced to
  for (let cap = 1; cap <= 3 && ordered.length < MAX; cap++) {
    let round = 0, progress = true;
    while (ordered.length < MAX && progress) {
      progress = false;
      for (const arr of Object.values(byPillar)) {
        const item = arr[round];
        if (!item || ordered.includes(item)) continue;
        if ((outletN[item.outlet] || 0) >= cap) continue;
        const ents = item._ents || [];
        if (ents.some((e) => (entN[e] || 0) >= cap)) continue;   // one company per slot-tier (any named entity)
        ordered.push(item); outletN[item.outlet] = (outletN[item.outlet] || 0) + 1;
        ents.forEach((e) => { entN[e] = (entN[e] || 0) + 1; });
        progress = true;
        if (ordered.length >= MAX) break;
      }
      round++;
      if (round > 50) break;
    }
  }

  // A press release never leads the Daily. The score penalty makes this unlikely;
  // this makes it certain, because "unlikely" is how a vendor announcement ends up
  // as the top story on a day the real news was thin.
  if (ordered.length > 1 && ordered[0].wire) {
    const firstReported = ordered.findIndex((p) => !p.wire);
    if (firstReported > 0) {
      const [w] = ordered.splice(0, 1);
      ordered.splice(firstReported, 0, w);
      console.error('wire demoted from lead:', w.headline.slice(0, 70));
    }
  }

  // Guarantee "the money" is always covered. Both the EN and DE issues are built from THIS
  // shared pool, so ensuring ≥ MIN_DEALS funding/M&A/IPO items here means neither edition
  // ever ships a money-free day when the day actually offered a deal. If the variety gate
  // didn't pick one, swap the weakest non-deal pick for the strongest deal candidate.
  const isDeal = (p) => p && p.money && DEAL_KINDS.has(p.money.kind);
  const MIN_DEALS = parseInt(args['min-deals'] || '1', 10);
  if (MIN_DEALS > 0 && ordered.length) {
    let dealsIn = ordered.filter(isDeal).length;
    const dealPool = pool.filter(isDeal).sort((a, b) => b._score - a._score);
    for (const cand of dealPool) {
      if (dealsIn >= MIN_DEALS) break;
      if (ordered.includes(cand)) continue;
      let worstIdx = -1, worst = Infinity;
      ordered.forEach((p, i) => { if (!isDeal(p) && p._score < worst) { worst = p._score; worstIdx = i; } });
      if (worstIdx === -1) break;   // everything already a deal — nothing to swap out
      console.error(`↑ guaranteeing money coverage: swapped in "${cand.headline.slice(0, 50)}…"`);
      ordered[worstIdx] = cand; dealsIn++;
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
  // Record what we shipped so tomorrow's run can't repeat it (rolling LEDGER_DAYS window).
  saveLedger(ledger, ordered);
  console.log(`✓ ingested ${sources.length} stories (from ${Object.keys(outletN).length} outlets) → automation/sources/${date}.json`);
  sources.forEach((s) => console.log(`  · [${s.pillar}] ${s.topic}  (${s.entity})`));
}
run();
