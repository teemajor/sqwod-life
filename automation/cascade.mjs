#!/usr/bin/env node
/**
 * sqwod.life — content cascade runner.
 *
 * Turns one source document into many formats in both languages:
 *   source → (report → article →) DAILY ITEM → newsletter → social
 *
 * This runner implements the DAILY step end-to-end and writes valid Astro
 * content files. The other steps are pluggable (see STEPS + prompts/cascade.md).
 *
 * generate() is the single seam where the LLM plugs in:
 *   - With LLM_API_KEY set, generate() should call the model using the prompt
 *     in prompts/cascade.md + the source's neutral facts (TODO marked below).
 *   - In --dry-run (default, no key needed), it uses the source's pre-authored
 *     editorial block so the pipeline runs and produces real, valid output.
 *
 * Usage:
 *   node automation/cascade.mjs            # dry-run, date = latest source file
 *   node automation/cascade.mjs --date=2026-06-17
 *   node automation/cascade.mjs --status=review
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, 'sources');
const DAILY_OUT = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const LANGS = ['en', 'de'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const status = args.status || 'draft';
const apiKey = process.env.ANTHROPIC_API_KEY;
const dryRun = !apiKey; // real mode only when an API key is present
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';

// ---- load sources -------------------------------------------------------
function loadSources() {
  const files = readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'));
  const byDate = {};
  for (const f of files) {
    const date = f.replace('.json', '');
    const data = JSON.parse(readFileSync(join(SOURCES_DIR, f), 'utf8'));
    byDate[date] = Array.isArray(data) ? data : [data];
  }
  return byDate;
}

// ---- the LLM seam -------------------------------------------------------
// In production this calls the model with prompts/cascade.md + source.facts.
async function generate(step, source, lang) {
  if (apiKey) {
    // Real authoring: the model writes natively in `lang` from the source facts.
    const facts = (source.facts || []).map((f) => `${f.label}: ${f.value}${f.unit || ''}`).join('; ');
    const langName = lang === 'de' ? 'German' : 'English';
    const prompt = `You are Sqwod's editor. Write ONE Sqwod Daily news item in ${langName} from these facts about "${source.entity}" (${source.topic}).

VOICE — think Morning Brew for the business of fitness: smart, witty, conversational, a little cheeky. Facts are airtight; the delivery is fun. We talk to coaches, trainers, studio founders and operators — a fun audience, so we have a bit of fun. Never corporate, never dry, never try-hard. One light joke, pun, or wink is plenty; clarity and the fact always win over the bit.

Facts: ${facts}
Source: ${source.provenance || 'n/a'}

Rules:
- headline <= 70 chars: punchy and a touch playful, lead with the number where possible. A clever hook beats a clever pun.
- dek = 1–2 sentences. Open with the fact, land on the "so what" for a coach/operator/founder. You can be funny on the setup, but the payoff is real and useful.
- Never invent numbers or facts beyond what's given. The humor is in the framing, not in made-up details.
- In German: write native, idiomatic German wit — do NOT translate English jokes; German is first-class.
Respond ONLY as minified JSON: {"headline":"...","dek":"..."}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${await r.text()}`);
    const data = await r.json();
    let txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const obj = JSON.parse(txt);
    return { headline: obj.headline, dek: obj.dek, readMore: (source[lang] || {}).readMore };
  }
  // dry-run: use the source's pre-authored editorial block so the pipeline
  // yields valid output without a key.
  const block = source[lang] || source.en;
  return { headline: block.headline, dek: block.dek, readMore: block.readMore };
}

// ---- issue-level "teaching" sections: connect-the-dots + action + entertainment
async function generateLead(items, lang) {
  if (!apiKey || !items.length) return null;
  const langName = lang === 'de' ? 'German' : 'English';
  const list = items.map((i, n) => `${n + 1}. ${i.headline} — ${i.dek}`).join('\n');
  const prompt = `You are Sqwod's editor — Morning Brew for the business of fitness: witty, sharp, teaches the reader something, connects dots others miss. Audience: coaches, studio founders, operators. Write natively in ${langName}.

Today's items:
${list}

Produce JSON with four fields:
{"connectTitle":"<=60 chars; the one non-obvious thread tying these stories together",
 "connectBody":"two short paragraphs separated by \\n; teach the underlying pattern and why it matters to an operator; specific, no fluff, a little wit",
 "doThis":"one concrete action the reader can take this week",
 "meanwhile":"one light, entertaining industry observation; no invented numbers"}
Respond ONLY as minified JSON.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
    const data = await r.json();
    const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return JSON.parse(txt);
  } catch (e) { console.error('lead generation failed:', e.message); return null; }
}

// ---- YAML helper (JSON strings are valid YAML double-quoted scalars) -----
const q = (s) => JSON.stringify(s ?? '');

function issueFrontmatter(date, lang, items, lead) {
  const lines = [
    '---',
    `urlSlug: ${q(date)}`,
    `lang: ${q(lang)}`,
    `counterpart: ${q(date)}`,
    `date: ${q(date)}`,
    `edition: ${q('Weekday')}`,
    `title: ${q('Sqwod Daily')}`,
    `status: ${q(status)}`,
    `intro: ${q(lang === 'de'
      ? 'Heutige Reps: was sich in der Branche bewegt hat, ohne Fachchinesisch — und warum es dich interessieren sollte.'
      : "Today's reps: what moved in the industry, minus the corporate snooze — and why you should care.")}`,
  ];
  if (lead && lead.connectTitle) {
    lines.push('connectDots:');
    lines.push(`  title: ${q(lead.connectTitle)}`);
    lines.push(`  body: ${q(lead.connectBody)}`);
    if (lead.doThis) lines.push(`doThis: ${q(lead.doThis)}`);
    if (lead.meanwhile) lines.push(`meanwhile: ${q(lead.meanwhile)}`);
  }
  lines.push('items:');
  for (const it of items) {
    lines.push(`  - headline: ${q(it.headline)}`);
    lines.push(`    dek: ${q(it.dek)}`);
    lines.push(`    pillar: ${q(it.pillar)}`);
    lines.push(`    conversion: ${q(it.conversion)}`);
    lines.push(`    sourceId: ${q(it.sourceId)}`);
    if (it.readMore) lines.push(`    readMore: ${q(it.readMore)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ---- run the daily step -------------------------------------------------
async function run() {
  const byDate = loadSources();
  const dates = Object.keys(byDate).sort();
  const date = args.date || dates[dates.length - 1];
  if (!byDate[date]) {
    console.error(`No source file for ${date}. Have: ${dates.join(', ')}`);
    process.exit(1);
  }
  const sources = byDate[date];
  mkdirSync(DAILY_OUT, { recursive: true });

  for (const lang of LANGS) {
    const items = [];
    for (const src of sources) {
      const out = await generate('daily-item', src, lang);
      items.push({ ...out, pillar: src.pillar, conversion: src.conversion, sourceId: src.id });
    }
    const lead = await generateLead(items, lang);
    const file = join(DAILY_OUT, `${date}.${lang}.md`);
    writeFileSync(file, issueFrontmatter(date, lang, items, lead));
    console.log(`✓ ${lang.toUpperCase()} issue → site/src/content/daily/${date}.${lang}.md  (${items.length} items, status: ${status})`);
  }

  console.log(`\nMode: ${dryRun ? 'DRY-RUN (no LLM key)' : 'LLM'}  ·  Source: ${date}  ·  ${sources.length} sources → ${LANGS.length} bilingual issues`);
  console.log('Cascade steps still available per source (see prompts/cascade.md): report · article · newsletter · social.');
  console.log('Next: review the drafts, then run with --status=published (or approve in your editor).');
}

run();
