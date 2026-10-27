#!/usr/bin/env node
/**
 * Sqwod article engine: turns the same cited news pool the Daily uses into
 * one-story lane articles (BUILD for operators, SIGNAL for market moves).
 * Since 27 Oct 2026 each article covers ONE lead story and its title must name
 * who did what (or a number from the story); generic, reader-addressed and
 * near-duplicate titles are rejected in code (titles.mjs). The Daily is the
 * roundup and is not affected.
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
import { titleProblems, headingProblems, recentArticles, pickLead } from './titles.mjs';
import { noEmDash, phraseProblems } from './quality.mjs';

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
// Topic chips for the Articles section (site/src/config/topics.ts). Keep in sync.
const ARTICLE_TOPICS = ['retention', 'pricing-revenue', 'marketing-community', 'offer-programming', 'ai-tools', 'strategy', 'market-moves', 'dach'];
const topicFor = (o) => (ARTICLE_TOPICS.includes(o?.topic) ? o.topic : (LANE === 'signal' ? 'market-moves' : 'strategy'));
const LANE_BRIEF = {
  build: 'a news analysis for fitness coaches, studio owners and operators',
  signal: 'a news analysis for fitness operators, founders and investors',
};
// Move retired as a lane on 27 Oct 2026 (nav is now Daily, Articles, Evidence,
// Reports, Verified). Its pieces were studio-business news filed under training.
// The workflow still calls --lane=move; it now exits cleanly without writing.
if (LANE === 'move') { console.log('· move lane retired 2026-10-27: nothing to write'); process.exit(0); }

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
      const text = ((s.facts || []).find((f) => f.label === 'Article') || {}).value || '';
      items.push({ headline: s.topic, outlet: s.entity, url: (s.en && s.en.readMore) || s.readMore || '', conversion: s.conversion, text, thin: !!s.thin });
    }
  }
  return items;
}

// Sqwod's own data (27 Oct 2026): if the Deal Tracker holds earlier approved deals for the
// company or its category, the article may cite them. That is the one number nobody else has.
function trackerContext(lead) {
  const p = join(__dirname, '..', 'site', 'src', 'data', 'deals.json');
  if (!existsSync(p)) return '';
  let deals = []; try { deals = JSON.parse(readFileSync(p, 'utf8')).deals.filter((d) => d.status === 'approved'); } catch { return ''; }
  const text = `${lead.headline} ${lead.text || ''}`.toLowerCase();
  const same = deals.filter((d) => text.includes(String(d.entity).split(/[\s/(]/)[0].toLowerCase()));
  const cat = same[0]?.category;
  const peers = cat ? deals.filter((d) => d.category === cat && !same.includes(d)) : [];
  if (!same.length && !peers.length) return '';
  const usd = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}bn` : `$${Math.round(n / 1e6)}M`);
  const sum = peers.reduce((a, d) => a + (d.amountUsd || 0), 0);
  return `SQWOD DEAL TRACKER (our own database of approved fitness/wellness deals since ${deals.at(-1)?.date}; cite it as "the Sqwod Deal Tracker"):
${same.map((d) => `- ${d.date}: ${d.entity} ${d.kind} ${d.amount || '(amount undisclosed)'}`).join('\n')}
${peers.length ? `- ${peers.length} other ${cat} deals tracked${sum ? `, ${usd(sum)} disclosed in total` : ''}: ${peers.slice(0, 5).map((d) => d.entity).join(', ')}` : ''}`;
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const q = (s) => JSON.stringify(s ?? '');

// One lead story per article (titles.mjs). Context stories only when they are about
// the same subject. The Daily is the roundup; lane articles go deep on one thing.
async function authour({ lead, context }, lang, { recentTitles, enTitle } = {}) {
  const langName = lang === 'de' ? 'German' : 'English';
  const ctx = context.map((c, i) => `${i + 1}. ${c.headline} (${c.outlet})`).join('\n') || '(none)';
  const base = `You are Sqwod's editor writing ${LANE_BRIEF[LANE]} in ${langName}.

THE LEAD STORY (the article is about this one story):
${lead.headline} (${lead.outlet})
${lead.text ? `What the article says: ${lead.text.slice(0, 1500)}\n` : ''}
CONTEXT STORIES (use only if they add directly to the lead; otherwise ignore):
${ctx}
${trackerContext(lead)}

STRUCTURE: say what happened (who, what, how much), why it matters to studio and gym operators, and what an operator can do with it. 350 to 550 words, Markdown, 3 short sections with \`##\` subheads.
- Put the story in context with at least one comparison from the material above (an earlier deal, a competitor, a Deal Tracker figure). If there is none, say what is still unknown instead.
- The last section is the editor's view: one clear opinion on what this means and who wins or loses, written as Sqwod's take, signed off by nobody. Opinion is allowed there; facts still come only from the material above.
- Every source you rely on must be about this story or this company. Never use an unrelated story as evidence.

TITLE RULES (checked by code; a failing title is rejected):
- Name the company, organisation or person from the lead story exactly as the story spells it, or use one of its numbers. Like a trade news desk: "WILDE Lands $40M to Scale Protein Snacks", "Inside Erewhon's Growth Strategy".
- At most 70 characters. A statement, never a question. No em dashes.
- Never address the reader ("Your studio...", "You're...", "Dein Studio..."). No formulas: "which side are you on", "pick a lane", "splitting in two", "are you ready", "here's how", "leaving money on the table".
${enTitle ? `- Use the same name or number as the English title: "${enTitle}".\n` : ''}SUBHEAD RULES: each subhead says something specific about this story. Never generic labels like "What's really happening", "Do this now", "The bottom line", "Your move".

HARD RULES:
- Never invent numbers, dollar figures, percentages, dates, or company facts. If a number isn't in the stories above, don't state one.
- Attribute claims to the outlets. Plain words, no slang. No em dashes.
- ${lang === 'de' ? 'Schreibe natürliches, idiomatisches Deutsch, keine Übersetzung. Keine Anrede mit du im Titel.' : 'Plain, direct English.'}

TOPIC: pick the one topic this story belongs to: ${ARTICLE_TOPICS.join(', ')}.

Respond ONLY as minified JSON: {"topic":"one of the topics above","title":"...","entity":"the exact name from the lead story your title uses, or empty","number":"the exact number from the lead story your title uses, or empty","description":"1 sentence saying what the reader learns","body":"the full markdown article"}`;

  let feedback = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    let o;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: 'user', content: base + feedback }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      o = JSON.parse(txt);
      if (!o.title || !o.body) throw new Error('missing title/body');
    } catch (e) { console.error(`· author retry ${attempt}/3 (${lang}): ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 2000)); continue; }

    o.title = noEmDash(o.title).trim(); o.description = noEmDash(o.description || ''); o.body = noEmDash(o.body);
    const problems = [
      ...titleProblems(o.title, { lang, recentTitles, leadText: `${lead.headline} ${lead.text || ''}`, entity: o.entity, number: o.number }),
      ...phraseProblems(o.title).map((x) => `title: ${x}`),
      ...headingProblems(o.body),
    ];
    if (!problems.length) return o;
    console.error(`· ${lang} draft rejected (${attempt}/3): ${problems.join(' | ')}`);
    feedback = `\n\nYOUR PREVIOUS DRAFT WAS REJECTED. Title was: "${o.title}". Fix every problem:\n- ${problems.join('\n- ')}`;
  }
  return null; // never ship a generic or duplicate title: skip this run instead
}

function frontmatter(slug, lang, lane, type, art, cluster) {
  const sources = cluster.filter((c) => c.url).slice(0, 3).map((c) => `  - { label: ${q(c.outlet)}, url: ${q(c.url)} }`);
  const conv = (cluster[0] && cluster[0].conversion) || 'list-growth';
  return [
    '---',
    `urlSlug: ${slug}`,
    `lang: ${q(lang)}`,
    `counterpart: ${slug}`,
    `title: ${q(art.title)}`,
    `topic: ${topicFor(art)}`,
    `description: ${q(art.description)}`,
    `pillar: ${lane}`,
    `type: ${type}`,
    `format: analysis`,
    `conversion: ${conv}`,
    `publishedAt: ${date}`,
    `updatedAt: ${date}`,
    `asOf: ${q(date)}`,
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
  const pooled = pool(LANE);
  const recentEn = recentArticles(OUT, 'en', 60);
  const recentDe = recentArticles(OUT, 'de', 60);
  const pick = pickLead(pooled, { usedUrls: recentEn.urls, recentTitles: recentEn.titles });
  if (!pick) { console.log(`· no ${LANE} story in the last ${DAYS}d that the last 60 articles haven't covered (${pooled.length} in pool): skipping`); process.exit(0); }
  const cluster = [pick.lead, ...pick.context];
  console.log(`Lead (${LANE}): ${pick.lead.headline} (${pick.lead.outlet})`);
  pick.context.forEach((c) => console.log(`  context: ${c.headline} (${c.outlet})`));

  if (!apiKey) { console.log('\n· dry-run (no ANTHROPIC_API_KEY): would author EN + DE from the lead above.'); process.exit(0); }

  const en = await authour(pick, 'en', { recentTitles: recentEn.titles });
  if (!en) { console.error('✗ EN draft failed the title/structure rules 3 times: no article this run'); process.exit(0); }
  const slug = slugify(en.title) + '-' + date.slice(5).replace('-', '');
  if (existsSync(join(OUT, `${slug}.en.md`))) { console.log(`· ${slug} already exists: skipping`); process.exit(0); }
  const type = typeFor(LANE, cluster.map((c) => c.headline).join(' '));
  const de = await authour(pick, 'de', { recentTitles: recentDe.titles, enTitle: en.title });
  if (!de) { console.error('✗ DE draft failed the title/structure rules 3 times: no article this run (EN+DE ship together)'); process.exit(0); }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${slug}.en.md`), frontmatter(slug, 'en', LANE, type, en, cluster));
  writeFileSync(join(OUT, `${slug}.de.md`), frontmatter(slug, 'de', LANE, type, { ...de, topic: topicFor(en) }, cluster));
  console.log(`\n✓ article → ${slug} (${LANE}/${type}, EN+DE)`);
}
run();
