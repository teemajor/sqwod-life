#!/usr/bin/env node
/**
 * Sqwod article engine — turns the same cited news pool the Daily uses into full
 * lane articles: problem → solution playbooks (BUILD) and trend briefs (SIGNAL).
 *
 * SAFETY: it never invents figures. It synthesises an actionable piece from real,
 * cited headlines (problem → solution → takeaway) and links the source outlets.
 * Figure-heavy data REPORTS stay human-curated (truth wins) — this engine writes
 * analysis, not statistics.
 *
 *   node automation/articles.mjs --lane=build           # one BUILD playbook
 *   node automation/articles.mjs --lane=signal --days=4
 *
 * Env: ANTHROPIC_API_KEY (required to author; without it, prints the cluster only).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(__dirname, 'sources');
const OUT = join(__dirname, '..', 'site', 'src', 'content', 'articles');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const LANE = args.lane || 'build';
const DAYS = parseInt(args.days || '4', 10);
const date = args.date || new Date().toISOString().slice(0, 10);
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';

// granular sub-type chosen per lane + cluster signal
const typeFor = (lane, text) => {
  const s = text.toLowerCase();
  if (lane === 'build') return /\b(ai|automation|gpt|prompt|chatbot)\b/.test(s) ? 'ai-automation' : (/\b(market|brand|influencer|social)\b/.test(s) ? 'marketing' : 'coaching-business');
  if (lane === 'signal') return /\b(market|report|forecast|economy|billion|million)\b/.test(s) ? 'market-data' : 'trends';
  if (lane === 'move') return 'method';
  return 'analysis';
};
const LANE_BRIEF = {
  build: 'an actionable playbook for fitness coaches, studio owners and operators',
  signal: 'a sharp trend brief for fitness operators and investors',
  move: 'a practical training/method note for coaches',
};

// ---- gather the recent cited news pool, filtered to the lane ----
function pool(lane) {
  if (!existsSync(SOURCES)) return [];
  const files = readdirSync(SOURCES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(0, DAYS);
  const items = [];
  const seen = new Set();
  for (const f of files) {
    let arr; try { arr = JSON.parse(readFileSync(join(SOURCES, f), 'utf8')); } catch { continue; }
    for (const s of arr) {
      if (s.pillar !== lane) continue;
      const key = (s.topic || '').toLowerCase().slice(0, 50);
      if (seen.has(key)) continue; seen.add(key);
      items.push({ headline: s.topic, outlet: s.entity, url: (s.en && s.en.readMore) || s.readMore || '', conversion: s.conversion });
    }
  }
  return items;
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const q = (s) => JSON.stringify(s ?? '');

async function authour(cluster, lang) {
  const langName = lang === 'de' ? 'German' : 'English';
  const list = cluster.map((c, i) => `${i + 1}. ${c.headline} (${c.outlet})`).join('\n');
  const prompt = `You are Sqwod's editor writing ${LANE_BRIEF[LANE]} in ${langName}.

VOICE: emotion creates motion. Lead with the reader's problem, then the solution. Witty, specific, useful — Morning Brew for the business of fitness. Never corporate.

These are today's real, cited stories (the ONLY facts you may rely on):
${list}

Write ONE original article that connects these into a single useful thread for the reader. STRUCTURE: hook the problem → explain what's really happening → give a concrete, do-this-now solution. 400–600 words, Markdown, 2–4 short sections with \`##\` subheads.

HARD RULES:
- Never invent numbers, dollar figures, percentages, dates, or company facts. If a number isn't in the stories above, don't state one.
- It's analysis and advice grounded in the stories — attribute claims to the outlets where relevant.
- ${lang === 'de' ? 'Schreibe natürliches, idiomatisches Deutsch — keine Übersetzung.' : 'Plain, punchy English.'}

Respond ONLY as minified JSON: {"title":"<=70 chars, problem-led","description":"1 sentence promise","body":"the full markdown article"}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const o = JSON.parse(txt);
      if (o.title && o.body) return o;
    } catch (e) { console.error(`· author retry ${attempt}/3 (${lang}): ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 2000)); }
  }
  return null;
}

function frontmatter(slug, lang, lane, type, art, cluster) {
  const sources = cluster.filter((c) => c.url).slice(0, 6).map((c) => `  - { label: ${q(c.outlet)}, url: ${q(c.url)} }`);
  const conv = (cluster[0] && cluster[0].conversion) || 'list-growth';
  return [
    '---',
    `urlSlug: ${slug}`,
    `lang: ${q(lang)}`,
    `counterpart: ${slug}`,
    `title: ${q(art.title)}`,
    `description: ${q(art.description)}`,
    `pillar: ${lane}`,
    `type: ${type}`,
    `format: analysis`,
    `conversion: ${conv}`,
    `publishedAt: ${date}`,
    `updatedAt: ${date}`,
    `asOf: ${date}`,
    `author: "Sqwod"`,
    `gated: false`,
    'sources:',
    ...sources,
    'hero:',
    `  kind: ${lane === 'signal' ? 'bars' : 'line'}`,
    'tags: []',
    '---',
    '',
    art.body.trim(),
    '',
  ].join('\n');
}

async function run() {
  const cluster = pool(LANE).slice(0, 6);
  if (cluster.length < 2) { console.log(`· not enough ${LANE} stories in the last ${DAYS}d (${cluster.length}) — skipping`); process.exit(0); }
  console.log(`Cluster (${LANE}, ${cluster.length}):`); cluster.forEach((c) => console.log(`  · ${c.headline} — ${c.outlet}`));

  if (!apiKey) { console.log('\n· dry-run (no ANTHROPIC_API_KEY): would author EN + DE from the cluster above.'); process.exit(0); }

  const en = await authour(cluster, 'en');
  if (!en) { console.error('✗ EN authoring failed — aborting'); process.exit(0); }
  const slug = slugify(en.title) + '-' + date.slice(5).replace('-', '');
  if (existsSync(join(OUT, `${slug}.en.md`))) { console.log(`· ${slug} already exists — skipping`); process.exit(0); }
  const type = typeFor(LANE, cluster.map((c) => c.headline).join(' '));
  const de = await authour(cluster, 'de') || en;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${slug}.en.md`), frontmatter(slug, 'en', LANE, type, en, cluster));
  writeFileSync(join(OUT, `${slug}.de.md`), frontmatter(slug, 'de', LANE, type, de, cluster));
  console.log(`\n✓ article → ${slug} (${LANE}/${type}, EN+DE)`);
}
run();
