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
const MAX = parseInt(args.max || '4', 10);

// industry-focused queries (last 2 days)
const QUERIES = [
  'fitness industry business when:2d',
  'wellness industry OR "boutique fitness" when:2d',
  'gym OR studio OR coaching business when:2d',
  'fitness startup funding OR acquisition when:2d',
];

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

// pillar classification (new Articles taxonomy) + conversion route
function classify(t) {
  const s = t.toLowerCase();
  if (/\b(raise|raises|raised|funding|million|billion|\$|investment|valuation|ipo|m&a|merger|acqui)/.test(s)) return ['industry-trends', 'sqwod-os'];
  if (/\b(ai|a\.i\.|automation|chatbot|gpt|model|algorithm)\b/.test(s)) return ['ai-automation', 'sqwod-ai'];
  if (/\b(app|software|platform|wearable|tech|api|booking|device)\b/.test(s)) return ['operations-technology', 'sqwod-os'];
  if (/\b(marketing|brand|campaign|social|influencer|tiktok|instagram|ad )\b/.test(s)) return ['marketing-visibility', 'sqwod-os'];
  if (/\b(founder|ceo|profile|journey|story)\b/.test(s)) return ['founder-stories', 'pods'];
  if (/\b(open|opens|expansion|franchise|hire|hiring|studio|gym|club|membership|pricing)\b/.test(s)) return ['business-strategy', 'pods'];
  return ['industry-trends', 'sqwod-os'];
}

async function run() {
  const seen = new Set();
  const picked = [];
  for (const q of QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'sqwod-ingest/1.0' } });
      if (!r.ok) { console.error('feed', r.status, q); continue; }
      for (const it of parseItems(await r.text())) {
        // Google titles are "Headline - Outlet"
        const cut = it.title.lastIndexOf(' - ');
        const headline = cut > 20 ? it.title.slice(0, cut) : it.title;
        const outlet = it.source || (cut > 20 ? it.title.slice(cut + 3) : 'source');
        const key = headline.toLowerCase().slice(0, 60);
        if (seen.has(key)) continue; seen.add(key);
        const [pillar, conversion] = classify(headline);
        picked.push({ headline, outlet, link: it.link, pub: it.pub, pillar, conversion });
      }
    } catch (e) { console.error('fetch failed', q, e.message); }
  }
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
    facts: [{ label: 'Story', value: p.headline }, { label: 'Outlet', value: p.outlet }],
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
