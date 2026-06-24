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
    // retry transient API errors (429/5xx/overloaded); never let one item crash the run
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
        });
        if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
        const data = await r.json();
        const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
        const obj = JSON.parse(txt);
        if (!obj.headline) throw new Error('empty result');
        return { headline: obj.headline, dek: obj.dek, readMore: (source[lang] || {}).readMore };
      } catch (e) {
        console.error(`· generate retry ${attempt}/3 (${lang}, ${source.id}): ${e.message}`);
        if (attempt < 3) await new Promise((res) => setTimeout(res, attempt * 2000));
      }
    }
    console.error(`· generate fell back to source block for ${source.id} (${lang})`);
  }
  // dry-run: use the source's pre-authored editorial block so the pipeline
  // yields valid output without a key.
  const block = source[lang] || source.en || { headline: source.topic || 'Industry update', dek: `Via ${source.entity || 'source'}.`, readMore: '' };
  return { headline: block.headline, dek: block.dek, readMore: block.readMore };
}

// ---- issue-level "teaching" sections: connect-the-dots + action + entertainment
async function generateLead(items, lang) {
  if (!apiKey || !items.length) return null;
  const langName = lang === 'de' ? 'German' : 'English';
  const list = items.map((i, n) => `${n + 1}. ${i.headline} — ${i.dek}`).join('\n');
  const prompt = `You are Sqwod's editor — Morning Brew for the business of fitness: witty, sharp, teaches, connects dots others miss. Audience: coaches, studio founders, operators. Write natively in ${langName}.

Today's items (these are the ONLY facts available):
${list}

Produce ONE minified JSON object. CRITICAL: never invent numbers, companies, deals, or statistics. Only use figures that appear verbatim above. If a section has no real basis, return null (or []) for it — do not fabricate.
{
 "connectTitle":"<=60 chars; the one non-obvious thread tying these stories together",
 "connectBody":"two short paragraphs separated by \\n; teach the pattern and why it matters to an operator; specific, witty, no fluff",
 "doThis":"one concrete action the reader can take this week",
 "meanwhile":"a light, witty aside about a DIFFERENT story than connectTitle focuses on. Must NOT restate or recap anything already covered in connectBody or the items list — pick the most off-beat angle and make a wry one-liner. Return an empty string if there is no genuinely distinct, fun angle left. No invented numbers.",
 "moneyMoves":[{"entity":"name from the items","kind":"raise|acquisition|valuation|ipo|shutdown","amount":"only if stated verbatim, else empty string","note":"one clause"}]  // ONLY for items that are actually raises/M&A/valuations; [] if none,
 "policyWatch":{"title":"...","body":"1-2 sentences on a regulation/policy that affects coaches or studios"} or null if no item is policy/regulatory,
 "stat":{"number":"the figure verbatim","label":"what it measures","body":"why it matters"} or null if no real number appears,
 "recs":[{"label":"Read|Steal|Try|Watch","text":"a concrete, useful action or resource"}]  // 2-3 items
}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1100, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
    const data = await r.json();
    const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return JSON.parse(txt);
  } catch (e) { console.error('lead generation failed:', e.message); return null; }
}

// ---- SPOKEN BRIEF: a daily news brief written for the EAR, not the page ----
// Distinct from the on-page copy: a host reading you the day's fitness-business
// news — factual, fun, and you walk away knowing something new. Drives the TTS.
async function generateAudioScript(items, sections, lang) {
  if (!apiKey || !items.length) return '';
  const langName = lang === 'de' ? 'German' : 'English';
  const list = items.map((i, n) => `${n + 1}. ${i.headline} — ${i.dek}`).join('\n');
  const thread = sections?.connectTitle ? `Today's through-line: ${sections.connectTitle} — ${sections.connectBody || ''}` : '';
  const prompt = `You are the host of Sqwod Daily, a spoken news brief on the business of fitness and wellness. Write the FULL script for today's episode in ${langName}, to be read aloud by one host.

This is AUDIO, not an article. It must sound like a smart, fun person telling you the day's news — NOT a list being read out. The listener should walk away having actually learned something: a number, a shift, a "huh, didn't know that." Factual first; the fun is in the delivery.

Today's stories (these are the ONLY facts available — never invent numbers, companies, or deals):
${list}
${thread}

Write the script with:
- A short cold open (1–2 sentences) that hooks — a hook, a number, or a wry line. Do NOT start with "Welcome" or "Hello".
- The stories woven into a flowing brief with spoken transitions ("First up...", "Meanwhile...", "And here's the part most people miss..."). Add the ONE useful insight or "so what" per story — that's the knowledge they walk away with.
- A quick sign-off line in Sqwod's voice.
- Length: 280–420 words. Conversational sentences, contractions, said-out-loud rhythm. No headers, no bullet points, no stage directions, no "[pause]". German must be native, idiomatic spoken German — never a translation.

Respond ONLY as minified JSON: {"script":"the full spoken script as one string, paragraphs separated by \\n"}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
    const data = await r.json();
    const txt = (data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const obj = JSON.parse(txt);
    return typeof obj.script === 'string' ? obj.script.trim() : '';
  } catch (e) { console.error(`audio-script generation failed (${lang}):`, e.message); return ''; }
}

// Pick a Sqwod Verified review to feature as the affiliate rec (keeps recs monetized + factual).
const REVIEWS_DIR = join(__dirname, '..', 'site', 'src', 'content', 'reviews');
function pickAffiliateRec(lang) {
  let files = [];
  try { files = readdirSync(REVIEWS_DIR).filter((f) => f.endsWith(`.${lang}.md`)); } catch { return null; }
  if (!files.length) return null;
  const fm = readFileSync(join(REVIEWS_DIR, files[0]), 'utf8');
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.replace(/^["']|["']$/g, '').trim();
  const product = get('productName') || get('title') || 'our top pick';
  const slug = get('urlSlug') || files[0].replace(`.${lang}.md`, '');
  return {
    label: 'Gear', affiliate: true, url: `/${lang}/verified/${slug}`,
    text: lang === 'de' ? `${product} — unser Urteil + bester Preis.` : `${product} — our verdict + best price.`,
  };
}

// Build the full section package (model output + programmatic affiliate rec + Play).
function buildSections(lead, lang) {
  const s = lead && lead.connectTitle ? { ...lead } : {};
  const aff = pickAffiliateRec(lang);
  s.recs = [...(Array.isArray(lead?.recs) ? lead.recs : []), ...(aff ? [aff] : [])];
  s.play = {
    title: 'Sqwod Readiness Tap',
    prompt: lang === 'de'
      ? 'Wie wach bist du heute? 30-Sekunden-Reaktionstest — derselbe PVT, mit dem Schlafforscher Wachheit messen.'
      : 'How sharp are you today? 30-second reaction test — the same PVT sleep scientists use to measure alertness.',
    url: `/${lang}/play`,
  };
  return s;
}

// ---- VERIFICATION PASS: fact-check the draft against the source facts ----
// Catches the model attributing a number/event to the wrong entity or inventing
// figures. Strips unsupported stat/money claims and downgrades the issue to
// `review` so a human looks before it can publish. No-op without an API key.
async function verifyIssue(items, sections, sources, lang) {
  if (!apiKey) return { issues: [], sections };
  const facts = sources.map((s) => `- ${s.entity}: ${s.topic}${(s.facts || []).map((f) => ` | ${f.label}: ${f.value}${f.unit || ''}`).join('')}`).join('\n');
  const draft = {
    items: items.map((i) => ({ headline: i.headline, dek: i.dek })),
    connectDots: sections.connectTitle ? { title: sections.connectTitle, body: sections.connectBody } : null,
    stat: sections.stat || null,
    moneyMoves: sections.moneyMoves || [],
  };
  const prompt = `You are a strict fact-checker for a fitness-industry newsletter. The ONLY facts available are these source items:
${facts}

Here is the drafted content (${lang}):
${JSON.stringify(draft)}

Find every claim in the draft that is NOT directly supported by the source facts — invented numbers, a figure/deal attributed to the wrong company, events not in the sources, or stats with no basis. Be conservative: framing/opinion is fine; only flag factual claims that aren't supported.
Classify each issue: set "blocking":true ONLY when the unsupported claim is baked into an item headline, an item dek, or the connectDots synthesis body (text we cannot auto-remove). Set "blocking":false when the claim lives in the standalone "stat" or a "moneyMoves" entry — those get auto-dropped, so they are NOT blocking.
Respond ONLY as minified JSON: {"issues":[{"claim":"...","problem":"...","blocking":true|false}],"dropStat":true|false,"dropMoneyIndexes":[ints]}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const v = JSON.parse((data.content?.[0]?.text || '{}').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if (v.dropStat) delete sections.stat;
    if (Array.isArray(v.dropMoneyIndexes) && v.dropMoneyIndexes.length && Array.isArray(sections.moneyMoves)) {
      sections.moneyMoves = sections.moneyMoves.filter((_, i) => !v.dropMoneyIndexes.includes(i));
    }
    const issues = Array.isArray(v.issues) ? v.issues : [];
    const blocking = issues.filter((i) => i.blocking === true);
    return { issues, blocking, sections };
  } catch (e) { return { issues: [{ claim: 'verification', problem: 'check failed: ' + e.message }], blocking: [], sections }; }
}

// ---- YAML helper (JSON strings are valid YAML double-quoted scalars) -----
const q = (s) => JSON.stringify(s ?? '');

function issueFrontmatter(date, lang, items, sections, issueStatus = status) {
  const lines = [
    '---',
    `urlSlug: ${q(date)}`,
    `lang: ${q(lang)}`,
    `counterpart: ${q(date)}`,
    `date: ${q(date)}`,
    `edition: ${q('Weekday')}`,
    `title: ${q('Sqwod Daily')}`,
    `status: ${q(issueStatus)}`,
    `intro: ${q(lang === 'de'
      ? 'Heutige Reps: was sich in der Branche bewegt hat, ohne Fachchinesisch — und warum es dich interessieren sollte.'
      : "Today's reps: what moved in the industry, minus the corporate snooze — and why you should care.")}`,
  ];
  const s = sections || {};
  if (s.audioScript) lines.push(`audioScript: ${q(s.audioScript)}`);  // spoken brief (ear, not page)
  if (s.connectTitle) {
    lines.push('connectDots:');
    lines.push(`  title: ${q(s.connectTitle)}`);
    lines.push(`  body: ${q(s.connectBody)}`);
  }
  if (s.doThis) lines.push(`doThis: ${q(s.doThis)}`);
  if (s.meanwhile) lines.push(`meanwhile: ${q(s.meanwhile)}`);
  if (Array.isArray(s.moneyMoves) && s.moneyMoves.length) {
    lines.push('moneyMoves:');
    for (const m of s.moneyMoves) {
      lines.push(`  - entity: ${q(m.entity)}`);
      lines.push(`    kind: ${q(m.kind || 'raise')}`);
      if (m.amount) lines.push(`    amount: ${q(m.amount)}`);
      if (m.note) lines.push(`    note: ${q(m.note)}`);
      if (m.url) lines.push(`    url: ${q(m.url)}`);
    }
  }
  if (s.policyWatch && s.policyWatch.title) {
    lines.push('policyWatch:');
    lines.push(`  title: ${q(s.policyWatch.title)}`);
    lines.push(`  body: ${q(s.policyWatch.body)}`);
    if (s.policyWatch.url) lines.push(`  url: ${q(s.policyWatch.url)}`);
  }
  if (s.stat && s.stat.number) {
    lines.push('stat:');
    lines.push(`  number: ${q(s.stat.number)}`);
    lines.push(`  label: ${q(s.stat.label)}`);
    if (s.stat.body) lines.push(`  body: ${q(s.stat.body)}`);
  }
  if (Array.isArray(s.recs) && s.recs.length) {
    lines.push('recs:');
    for (const r of s.recs) {
      lines.push(`  - label: ${q(r.label)}`);
      lines.push(`    text: ${q(r.text)}`);
      if (r.url) lines.push(`    url: ${q(r.url)}`);
      if (r.affiliate) lines.push(`    affiliate: true`);
    }
  }
  if (s.play && s.play.title) {
    lines.push('play:');
    lines.push(`  title: ${q(s.play.title)}`);
    lines.push(`  prompt: ${q(s.play.prompt)}`);
    if (s.play.url) lines.push(`  url: ${q(s.play.url)}`);
  }
  lines.push('items:');
  for (const it of items) {
    lines.push(`  - headline: ${q(it.headline)}`);
    lines.push(`    dek: ${q(it.dek)}`);
    lines.push(`    pillar: ${q(it.pillar)}`);
    lines.push(`    conversion: ${q(it.conversion)}`);
    lines.push(`    sourceId: ${q(it.sourceId)}`);
    if (it.source) lines.push(`    source: ${q(it.source)}`);
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
    console.log(`No source file for ${date} (ingest found nothing today). Nothing to generate — exiting cleanly.`);
    process.exit(0);   // no-op day, not a failure
  }
  const sources = byDate[date];
  mkdirSync(DAILY_OUT, { recursive: true });

  for (const lang of LANGS) {
    const items = [];
    for (const src of sources) {
      const out = await generate('daily-item', src, lang);
      items.push({ ...out, pillar: src.pillar, conversion: src.conversion, sourceId: src.id, source: src.entity });
    }
    const lead = await generateLead(items, lang);
    let sections = buildSections(lead, lang);     // model output + affiliate rec + Play (even in dry-run)
    const v = await verifyIssue(items, sections, sources, lang);  // fact-check vs source facts
    sections = v.sections;
    const blocking = v.blocking || [];
    const issueStatus = blocking.length ? 'review' : status;      // only UN-remediable flags hold for human
    if (v.issues.length) {
      const dropped = v.issues.length - blocking.length;
      if (dropped) console.log(`✓ ${lang.toUpperCase()} verification auto-removed ${dropped} unsupported stat/money claim(s) — publishing the rest`);
      if (blocking.length) {
        console.log(`⚠ ${lang.toUpperCase()} verification flagged ${blocking.length} embedded claim(s) → status: review`);
        blocking.forEach((i) => console.log(`   · ${i.claim} — ${i.problem}`));
      }
    }
    sections.audioScript = await generateAudioScript(items, sections, lang);  // spoken brief for TTS (verified facts only)
    if (sections.audioScript) console.log(`🎙  ${lang.toUpperCase()} audio brief authored (${sections.audioScript.split(/\s+/).length} words)`);
    const file = join(DAILY_OUT, `${date}.${lang}.md`);
    writeFileSync(file, issueFrontmatter(date, lang, items, sections, issueStatus));
    console.log(`✓ ${lang.toUpperCase()} issue → site/src/content/daily/${date}.${lang}.md  (${items.length} items, status: ${issueStatus})`);
  }

  console.log(`\nMode: ${dryRun ? 'DRY-RUN (no LLM key)' : 'LLM'}  ·  Source: ${date}  ·  ${sources.length} sources → ${LANGS.length} bilingual issues`);
  console.log('Cascade steps still available per source (see prompts/cascade.md): report · article · newsletter · social.');
  console.log('Next: review the drafts, then run with --status=published (or approve in your editor).');
}

run();
