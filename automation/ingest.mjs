#!/usr/bin/env node
/**
 * Sqwod news ingest — pulls current fitness/wellness-industry headlines (free,
 * via Google News RSS) and writes a dated source file the cascade turns into a
 * bilingual Sqwod Daily. No API key needed for this step.
 *
 *   node automation/ingest.mjs                 # writes sources/<today>.json
 *   node automation/ingest.mjs --date=2026-06-19 --max=4
 *
 * Then: node automation/cascade.mjs --date=<today>   (rewrites in Sqwod voice)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'sources');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const MAX = parseInt(args.max || '5', 10);

// Sharper, pillar-mapped queries. Each carries a prior (pillar+conversion) so
// classification is reliable even when a headline is terse. Wider windows
// (3–7d) give enough signal to fill a strong issue.
const QUERIES = [
  // money: raises, M&A, valuations → the "Money Movement" section
  { q: '(fitness OR wellness OR gym OR "health club") ("raises" OR "funding round" OR "Series A" OR "Series B" OR "seed round" OR acquires OR acquisition OR valuation OR IPO) when:5d', pillar: 'industry-trends', conversion: 'sqwod-os' },
  // gym / studio / franchise operations + openings
  { q: '("boutique fitness" OR gym OR "fitness studio" OR "fitness franchise" OR "health club") (opens OR expansion OR launches OR membership OR pricing OR revenue OR closes) when:4d', pillar: 'business-strategy', conversion: 'pods' },
  // wearables & health tech (feeds Tech & Tools / deals)
  { q: '(wearable OR "smart ring" OR Oura OR Whoop OR Garmin OR "fitness tracker" OR Peloton) (launch OR review OR feature OR funding OR partnership) when:6d', pillar: 'operations-technology', conversion: 'verified' },
  // AI in fitness / coaching
  { q: '("AI" OR "artificial intelligence") (fitness OR gym OR coaching OR workout OR wellness OR "personal training") when:6d', pillar: 'ai-automation', conversion: 'sqwod-ai' },
  // coaching / PT business
  { q: '("personal trainer" OR "fitness coach" OR "online coaching") (business OR clients OR pricing OR platform OR income) when:7d', pillar: 'business-strategy', conversion: 'pods' },
  // recovery / longevity / supplements market (broad reach, Wellness Culture)
  { q: '(longevity OR recovery OR supplements OR "cold plunge" OR sauna OR "creatine") (market OR brand OR launch OR study OR trend) when:6d', pillar: 'industry-trends', conversion: 'list-growth' },
  // creator / marketing in fitness
  { q: '(fitness OR wellness) (influencer OR creator OR "social media") (brand OR marketing OR campaign OR deal) when:6d', pillar: 'marketing-visibility', conversion: 'sqwod-os' },
  // industry data / reports
  { q: '(fitness OR wellness OR "health club") ("market size" OR report OR forecast OR trends OR Statista OR growth) when:7d', pillar: 'industry-trends', conversion: 'sqwod-os' },
];

// must look like industry news…
const RELEVANT = /\b(fitness|wellness|gym|studio|coach|coaching|trainer|workout|exercise|wearable|tracker|smart ring|health club|boutique|membership|nutrition|supplement|recovery|longevity|sauna|cold plunge|pilates|crossfit|hyrox|peloton|oura|whoop|garmin|strength|athlete|sport)\b/i;
// …and not be tabloid / listicle / fluff
const JUNK = /(\bhoroscope\b|\bzodiac\b|\brecipe\b|\bkardashian\b|\broyal\b|^meet\s|\bquiz\b|\bweight loss pill\b|\bcelebrit|sponsored content|\bdeal of the day\b)/i;

const decode = (s) => s
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const pub = decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
    const source = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
    if (title && link) items.push({ title, link, pub, source });
  }
  return items;
}

// Refine the pillar from the headline; fall back to the query's prior.
function classify(t, prior) {
  const s = t.toLowerCase();
  if (/\b(raise|raises|raised|funding|\$\d|€\d|million|billion|investment|valuation|ipo|m&a|merger|acqui)/.test(s)) return ['industry-trends', 'sqwod-os'];
  if (/\b(ai|a\.i\.|automation|chatbot|gpt|model|algorithm)\b/.test(s)) return ['ai-automation', 'sqwod-ai'];
  if (/\b(wearable|smart ring|tracker|oura|whoop|garmin|device|gadget)\b/.test(s)) return ['operations-technology', 'verified'];
  if (/\b(marketing|brand|campaign|influencer|creator|tiktok|instagram|sponsor)\b/.test(s)) return ['marketing-visibility', 'sqwod-os'];
  if (/\b(opens|expansion|franchise|membership|pricing|revenue|studio|gym|club|hires|hiring)\b/.test(s)) return ['business-strategy', 'pods'];
  if (/\b(founder|ceo|journey)\b/.test(s)) return ['founder-stories', 'pods'];
  return [prior.pillar, prior.conversion];
}

// flag whether a story is a money move (for the Money Movement section)
function moneyKind(t) {
  const s = t.toLowerCase();
  if (/\b(acquir|acquisition|buys|merger|m&a)\b/.test(s)) return 'acquisition';
  if (/\b(ipo|goes public)\b/.test(s)) return 'ipo';
  if (/\b(valuation|valued at)\b/.test(s)) return 'valuation';
  if (/\b(shuts down|shutting down|bankrupt|closes)\b/.test(s)) return 'shutdown';
  if (/\b(raise|raises|raised|funding|seed|series [a-d]|invest)\b/.test(s)) return 'raise';
  return null;
}
// pull a money amount if stated verbatim (e.g. $1M, €3.5M, $20 million)
function moneyAmount(t) {
  const m = t.match(/([$€£]\s?\d[\d.,]*\s?(?:k|m|bn|b|million|billion)?)/i);
  return m ? m[1].replace(/\s+/g, '') : '';
}

async function run() {
  const seen = new Set();
  const picked = [];
  let scanned = 0, dropped = 0;
  for (const qo of QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(qo.q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'sqwod-ingest/1.0' } });
      if (!r.ok) { console.error('feed', r.status, qo.q.slice(0, 40)); continue; }
      for (const it of parseItems(await r.text())) {
        scanned++;
        // Google titles are "Headline - Outlet"
        const cut = it.title.lastIndexOf(' - ');
        const headline = cut > 20 ? it.title.slice(0, cut) : it.title;
        const outlet = it.source || (cut > 20 ? it.title.slice(cut + 3) : 'source');
        // quality gates: must read as industry news, must not be fluff
        if (!RELEVANT.test(headline) || JUNK.test(headline)) { dropped++; continue; }
        const key = headline.toLowerCase().slice(0, 60);
        if (seen.has(key)) continue; seen.add(key);
        const [pillar, conversion] = classify(headline, qo);
        const kind = moneyKind(headline);
        picked.push({ headline, outlet, link: it.link, pub: it.pub, pillar, conversion, money: kind ? { kind, amount: moneyAmount(headline) } : null });
      }
    } catch (e) { console.error('fetch failed', qo.q.slice(0, 40), e.message); }
  }
  console.error(`scanned ${scanned}, dropped ${dropped} off-topic, kept ${picked.length} unique`);
  // spread across pillars where possible, cap at MAX
  const byPillar = {}; const ordered = [];
  for (const p of picked) { (byPillar[p.pillar] ||= []).push(p); }
  let round = 0;
  while (ordered.length < MAX && Object.values(byPillar).some((a) => a.length)) {
    for (const arr of Object.values(byPillar)) { if (arr[round]) { ordered.push(arr[round]); if (ordered.length >= MAX) break; } }
    round++;
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
    // raw fallback (used only in dry-run); cascade + LLM rewrites natively per language
    en: { headline: p.headline, dek: `Via ${p.outlet}.`, readMore: p.link },
    de: { headline: p.headline, dek: `Via ${p.outlet}.`, readMore: p.link },
  }));

  mkdirSync(OUT, { recursive: true });
  if (!sources.length) { console.error('No stories ingested — leaving sources untouched.'); process.exit(0); }
  writeFileSync(join(OUT, `${date}.json`), JSON.stringify(sources, null, 2));
  console.log(`✓ ingested ${sources.length} stories → automation/sources/${date}.json`);
  sources.forEach((s) => console.log(`  · [${s.pillar}] ${s.topic}  (${s.entity})`));
}
run();
