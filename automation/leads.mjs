#!/usr/bin/env node
/**
 * Sqwod leads — idea/source discovery from public industry RSS feeds (Fitt
 * Insider et al.). This is COMPETITIVE MONITORING, not republishing: we use these
 * feeds to spot what's moving and which PRIMARY sources to chase, then write our
 * own original Sqwod take from those primary sources. We never copy their words.
 *
 * Output: automation/leads/<date>.json — a research queue for articles / press /
 * Daily ideas. NOT auto-published; you (or the cascade, with sourcing) decide.
 *
 *   node automation/leads.mjs
 *   node automation/leads.mjs --date=2026-06-20 --max=20
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'leads');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const MAX = parseInt(args.max || '25', 10);

// Public, openly-syndicated industry feeds used for IDEAS + lead discovery.
// (Fitt Insider blocks automated access / has no public feed, so we use the same
// fitness-business beat from outlets that DO syndicate. Verify + source independently.)
const FEEDS = [
  { name: 'Athletech News', urls: ['https://athletechnews.com/feed/'] },     // fitness-industry business — Fitt's beat
  { name: 'Outside', urls: ['https://www.outsideonline.com/feed/'] },        // endurance / wellness culture
];

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const strip = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function parse(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const desc = strip((b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '').slice(0, 280);
    const pub = decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
    if (title) out.push({ title, link, summary: desc, pub });
  }
  return out;
}

// rough pillar guess so leads slot into our taxonomy
function pillar(t) {
  const s = t.toLowerCase();
  if (/\b(rais|funding|acqui|valuation|ipo|invest|million|billion)\b/.test(s)) return 'industry-trends';
  if (/\b(ai|automation|software|app|platform|wearable)\b/.test(s)) return 'ai-automation';
  if (/\b(marketing|brand|creator|influencer|social)\b/.test(s)) return 'marketing-visibility';
  if (/\b(gym|studio|franchise|membership|open|expansion|coach|trainer)\b/.test(s)) return 'business-strategy';
  return 'industry-trends';
}

async function fetchFirst(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': 'sqwod-leads/1.0' } });
      if (r.ok) { const x = await r.text(); if (/<item>/.test(x)) return x; }
    } catch {}
  }
  return null;
}

async function run() {
  const leads = [];
  for (const f of FEEDS) {
    const xml = await fetchFirst(f.urls);
    if (!xml) { console.error(`· no feed for ${f.name} (skipped)`); continue; }
    for (const it of parse(xml)) {
      leads.push({ source: f.name, title: it.title, link: it.link, summary: it.summary, pub: it.pub, pillar: pillar(it.title), status: 'idea' });
    }
    console.error(`· ${f.name}: ${parse(xml).length} items`);
  }
  // newest-ish first, cap
  const picked = leads.slice(0, MAX);
  mkdirSync(OUT, { recursive: true });
  if (!picked.length) { console.error('No leads found.'); process.exit(0); }
  writeFileSync(join(OUT, `${date}.json`), JSON.stringify({
    note: 'Discovery only. Ideas + which primary sources to chase. Write original from primary sources; never republish.',
    leads: picked,
  }, null, 2));
  console.log(`✓ ${picked.length} leads → automation/leads/${date}.json`);
  picked.slice(0, 8).forEach((l) => console.log(`  · [${l.pillar}] ${l.title}  (${l.source})`));
}
run();
