#!/usr/bin/env node
/**
 * Sqwod Intelligence — RELEVANCE-DRIVEN report generator.
 *
 * The missing engine: mines the Statista fact bank (automation/intelligence/*.json,
 * ~100+ extracted datasets) and drafts a TIMELY new Intelligence report from the most
 * relevant, not-yet-covered topic. Relevance = overlap with the last few weeks of Daily
 * news + a coverage gap + data recency.
 *
 * SAFE BY DESIGN — draft, not publish:
 *   • Writes to automation/intel-drafts/<slug>.{en,de}.md, NOT the live articles
 *     collection. Nothing renders on the site until YOU verify the figures and move the
 *     two files into site/src/content/articles/.
 *   • Never invents numbers: figures come only from the chosen dataset's chart values,
 *     each attributed. A changelog line flags that figures need human verification.
 *
 *   node automation/intelligence-generate.mjs [--date=YYYY-MM-DD]
 *
 * Env: ANTHROPIC_API_KEY (drafting). Dry-run without it (prints the pick + rationale).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTS = join(__dirname, 'intelligence');
const SOURCES = join(__dirname, 'sources');
const DRAFTS = join(__dirname, 'intel-drafts');
const ARTICLES = join(__dirname, '..', 'site', 'src', 'content', 'articles');
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);

const q = (s) => JSON.stringify(s ?? '');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const STOP = new Set(['the','and','for','with','from','worldwide','global','market','data','analysis','report','statista','dossier','study','share','number','value','rate','2019','2020','2021','2022','2023','2024','2025','2026','2027','2028','2029','2030','united','states','usd','revenue','billion','million','industry','by','in','of','to','a','on','per']);
const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n; };

// A chart is "real data" (not axis ticks) if its values aren't a constant-step ramp from ~0.
function looksReal(vals) {
  if (!Array.isArray(vals) || vals.length < 2) return false;
  if (!vals.every((v) => typeof v === 'number' && isFinite(v))) return false;
  const diffs = vals.slice(1).map((v, i) => +(v - vals[i]).toFixed(4));
  const allEqual = diffs.every((d) => d === diffs[0]);
  if (allEqual && vals[0] <= 0.001) return false;               // 0,10,20,… axis
  if (vals.every((v) => v % 10 === 0) && allEqual) return false; // round-ten ticks
  return true;
}

// ---- load the fact bank into topic candidates ----
function candidates() {
  if (!existsSync(FACTS)) return [];
  return readdirSync(FACTS).filter((f) => f.endsWith('.json')).map((f) => {
    let j; try { j = JSON.parse(readFileSync(join(FACTS, f), 'utf8')); } catch { return null; }
    const charts = (Array.isArray(j.charts) ? j.charts : [])
      .filter((c) => c && c.title && Array.isArray(c.years) && Array.isArray(c.values) && c.values.length === c.years.length && looksReal(c.values))
      .map((c) => ({ title: c.title, unit: c.unit || '', years: c.years, values: c.values }));
    if (!charts.length) return null;
    const name = (j.study || f).replace(/^(study|statistic)_id\d+[_-]?/i, '').replace(/[-_]+/g, ' ').replace(/\.json$/, '').trim();
    const maxYear = Math.max(...charts.flatMap((c) => c.years.map((y) => parseInt(y, 10)).filter(Boolean)), 0);
    return { file: f, name, charts, key: toks(name + ' ' + charts.map((c) => c.title).join(' ')), maxYear };
  }).filter(Boolean);
}

// ---- signals: recent Daily news keywords + already-covered report topics ----
function newsKeywords(days = 28) {
  if (!existsSync(SOURCES)) return new Set();
  const cutoff = Date.now() - days * 86400000;
  const set = new Set();
  for (const f of readdirSync(SOURCES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    if (new Date(f.slice(0, 10)).getTime() < cutoff) continue;
    try { for (const it of JSON.parse(readFileSync(join(SOURCES, f), 'utf8'))) for (const t of toks(`${it.topic || ''} ${it.headline || ''} ${(it.facts || []).join(' ')}`)) set.add(t); } catch {}
  }
  return set;
}
function coveredKeys() {
  const set = new Set(), slugs = new Set();
  for (const dir of [ARTICLES, DRAFTS]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.en.md'))) {
      slugs.add(f.replace('.en.md', ''));
      const fm = (readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
      const title = (fm.match(/^title:\s*(.+)$/m) || [])[1] || '';
      for (const t of toks(title)) set.add(t);
    }
  }
  return { set, slugs };
}

function pickTopic() {
  const cands = candidates();
  if (!cands.length) return null;
  const news = newsKeywords();
  const { set: covered } = coveredKeys();
  const scored = cands.map((c) => {
    const newsHit = overlap(c.key, news);
    const coverHit = overlap(c.key, covered);
    const recency = Math.max(0, c.maxYear - 2022);        // fresher data scores higher
    const score = newsHit * 3 + Math.min(c.charts.length, 4) * 1.5 + recency * 1.2 - coverHit * 4;
    return { ...c, newsHit, coverHit, recency, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0];
}

// ---- draft the report from the chosen dataset ----
async function draft(topic, lang) {
  const langName = lang === 'de' ? 'German' : 'English';
  const data = topic.charts.slice(0, 6).map((c, i) =>
    `${i + 1}. "${c.title}" (${c.unit})\n   ${c.years.map((y, k) => `${y}: ${c.values[k]}`).join(' · ')}`).join('\n');
  const prompt = `You are Sqwod Intelligence — strategic data journalism for the business of fitness & wellness, in ${langName}. Audience: coaches, studio founders, operators.

Topic dataset (Statista, "${topic.name}"). These chart figures are the ONLY numbers you may use:
${data}

Write a flagship Intelligence report that turns this data into an operator insight.

HARD RULES:
- Use ONLY figures that appear verbatim above. NEVER invent, round differently, extrapolate, or add a number that isn't listed. If you want to make a point without a supporting figure, make it qualitatively.
- Every figure you cite must map to one of the chart titles above.
- ${lang === 'de' ? 'Natürliches, idiomatisches Deutsch — keine Übersetzung.' : 'Sharp, plain English.'}

Respond ONLY as minified JSON:
{
 "title":"<=60 chars, a real report title",
 "description":"1-sentence promise of the report",
 "takeaways":["3-4 one-line takeaways, each may cite ONE figure from above"],
 "playbook":[{"move":"a specific operator action","why":"why it follows from the data"}],
 "figures":[{"label":"what it measures","value":"the figure verbatim (with unit)","note":"years/context","chart":"the exact chart title it came from"}],
 "body":"350-550 words of markdown: hook the shift → what the data shows → why it matters to a coach/operator → what to do. 2-3 '##' subheads. Do not restate every figure; interpret."
}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const o = JSON.parse((await r.json()).content?.[0]?.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (o.title && o.body) return o;
    } catch (e) { console.error(`· draft retry ${attempt}/3 (${lang}): ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 2000)); }
  }
  return null;
}

function frontmatter(slug, lang, art, topic) {
  const takeaways = (art.takeaways || []).map((t) => `  - ${q(t)}`);
  const playbook = (art.playbook || []).map((p) => `  - { move: ${q(p.move)}, why: ${q(p.why)} }`);
  const figures = (art.figures || []).map((f) => `  - { label: ${q(f.label)}, value: ${q(f.value)}, note: ${q(f.note)}, source: "Statista", url: "" }`);
  return [
    '---',
    `urlSlug: ${slug}`,
    `lang: ${q(lang)}`,
    `counterpart: ${slug}`,
    `title: ${q(art.title)}`,
    `description: ${q(art.description)}`,
    `pillar: signal`,
    `type: market-data`,
    `format: report`,
    `conversion: sqwod-os`,
    `publishedAt: ${date}`,
    `updatedAt: ${date}`,
    `asOf: ${q(date)}`,
    `author: "Sqwod Intelligence"`,
    `draft: true   # AUTO-DRAFT — verify every figure against Statista, then move into site/src/content/articles/ to publish`,
    `gated: true`,
    'takeaways:',
    ...takeaways,
    'playbook:',
    ...playbook,
    'sources:',
    `  - { label: ${q('Statista — ' + topic.name)}, url: "" }`,
    'figures:',
    ...figures,
    'changelog:',
    `  - { date: ${q(date)}, note: "Auto-drafted by Sqwod Intelligence from the Statista fact bank. Figures are machine-extracted and MUST be human-verified against the source before publishing." }`,
    'hero:',
    `  kind: orbit`,
    `tags: []`,
    '---',
    '',
    art.body.trim(),
    '',
    `*Draft — a Sqwod Intelligence report auto-composed from Statista data. Every figure is pending human verification.*`,
    '',
  ].join('\n');
}

async function run() {
  const topic = pickTopic();
  if (!topic) { console.log('· no eligible fact-bank topic found — skipping'); process.exit(0); }
  console.log(`Pick: "${topic.name}"  [score ${topic.score.toFixed(1)} · news ${topic.newsHit} · charts ${topic.charts.length} · recency ${topic.recency} · covered ${topic.coverHit}]`);
  topic.charts.slice(0, 6).forEach((c) => console.log(`   · ${c.title}`));

  if (!apiKey) { console.log('\n· dry-run (no ANTHROPIC_API_KEY): would draft EN + DE report from the pick above.'); process.exit(0); }

  const en = await draft(topic, 'en');
  if (!en) { console.error('✗ EN draft failed — aborting'); process.exit(0); }
  const slug = slugify(en.title);
  const { slugs } = coveredKeys();
  if (slugs.has(slug) || existsSync(join(DRAFTS, `${slug}.en.md`)) || existsSync(join(ARTICLES, `${slug}.en.md`))) {
    console.log(`· "${slug}" already exists (live or drafted) — skipping to avoid a dupe`); process.exit(0);
  }
  const de = await draft(topic, 'de') || en;

  mkdirSync(DRAFTS, { recursive: true });
  writeFileSync(join(DRAFTS, `${slug}.en.md`), frontmatter(slug, 'en', en, topic));
  writeFileSync(join(DRAFTS, `${slug}.de.md`), frontmatter(slug, 'de', de, topic));
  console.log(`\n✓ DRAFT report → automation/intel-drafts/${slug}.{en,de}.md  (verify figures, then move into site/src/content/articles/)`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## 📊 New Intelligence report drafted\n**${en.title}**\n\nFrom Statista topic: *${topic.name}*. Review \`automation/intel-drafts/${slug}.*.md\`, verify every figure, then move both files into \`site/src/content/articles/\` to publish.\n`, { flag: 'a' }); } catch {}
  }
}
run();
