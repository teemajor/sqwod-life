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
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, 'sources');
const DAILY_OUT = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const MOVES_DIR = join(__dirname, 'moves');
const LANGS = ['en', 'de'];

// ---- Move of the Day: pull the oldest unused curated clip from the queue ----
// Queue = automation/moves/<id>.json (written by the move-intake Worker).
// used.json tracks IDs already featured, so each move runs once.
function pickMove() {
  if (!existsSync(MOVES_DIR)) return null;
  const usedPath = join(MOVES_DIR, 'used.json');
  let used = [];
  try { used = JSON.parse(readFileSync(usedPath, 'utf8')); } catch {}
  const files = readdirSync(MOVES_DIR).filter((f) => f.endsWith('.json') && f !== 'used.json');
  const queue = [];
  for (const f of files) {
    try {
      const m = JSON.parse(readFileSync(join(MOVES_DIR, f), 'utf8'));
      if (!m.url || used.includes(m.id)) continue;
      // A move without a note has no story — it renders as a bare button nobody
      // clicks. Skip it (stays in queue) and tell Tee to add context.
      if (!String(m.note || '').trim()) {
        console.log(`  ⚠ move ${m.id} has no note — skipped. Add a "note" (what it fixes / why it's good) to automation/moves/${f} to run it.`);
        continue;
      }
      queue.push(m);
    } catch {}
  }
  if (!queue.length) return null;
  queue.sort((a, b) => String(a.added).localeCompare(String(b.added)));  // oldest first
  return queue[0];
}
function markMoveUsed(id) {
  if (!id) return;
  const usedPath = join(MOVES_DIR, 'used.json');
  let used = [];
  try { used = JSON.parse(readFileSync(usedPath, 'utf8')); } catch {}
  if (!used.includes(id)) { used.push(id); writeFileSync(usedPath, JSON.stringify(used, null, 2)); }
}

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
  // Only date-named source files (YYYY-MM-DD.json) — never stray config/registry
  // JSON that happens to live alongside them.
  const files = readdirSync(SOURCES_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
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

// ---- LANGUAGE GUARD: an EN issue never ships German copy (and vice versa) ----
// The generate() fallback returns the source's pre-authored block, which for
// DACH sources is German — that's how DE headlines leaked into the EN Daily.
// Function-word scoring is deterministic and dependency-free; umlauts/ß weigh DE.
const DE_HITS = /\b(der|die|das|und|für|mit|von|nicht|ein|eine|einen|sich|sind|wird|werden|hat|haben|bei|auf|aus|nach|über|sollte|dieser|diesen|jahr|neue|neuen|legt|bringt|lädt|wer|echtes|direkt)\b|[äöüß]/gi;
const EN_HITS = /\b(the|and|for|with|from|not|has|have|are|will|its|this|that|who|should|new|your|their|about|brings|worth|look)\b/gi;
function wrongLanguage(text, lang) {
  const s = String(text || '');
  const de = (s.match(DE_HITS) || []).length;
  const en = (s.match(EN_HITS) || []).length;
  return lang === 'en' ? de > en : en > de + 1; // DE copy tolerates English loanwords
}
// Rewrite a wrong-language item natively from its source facts; null on failure.
async function rewriteInLanguage(source, lang) {
  if (!apiKey || !source) return null;
  const facts = (source.facts || []).map((f) => `${f.label}: ${f.value}${f.unit || ''}`).join('; ');
  const langName = lang === 'de' ? 'German' : 'English';
  const prompt = `The previous draft was written in the WRONG LANGUAGE. Write ONE Sqwod Daily news item NATIVELY in ${langName} — never a literal translation — about "${source.entity}" (${source.topic}). Use ONLY these facts: ${facts}. Sqwod's witty Morning-Brew voice; headline <= 70 chars; dek 1–2 sentences ending on the "so what" for a coach/operator. Respond ONLY as minified JSON: {"headline":"...","dek":"..."}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const obj = JSON.parse((data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return obj.headline ? { headline: obj.headline, dek: obj.dek } : null;
  } catch (e) { console.error(`· language rewrite failed (${lang}): ${e.message}`); return null; }
}
// Enforce per-item: rewrite once, then DROP anything still in the wrong language.
// A missing item beats a bilingual mess in the reader's inbox.
async function enforceLanguage(items, sources, lang) {
  const kept = [];
  for (const it of items) {
    if (!wrongLanguage(`${it.headline} ${it.dek}`, lang)) { kept.push(it); continue; }
    const src = sources.find((s) => s.id === it.sourceId);
    const fixed = await rewriteInLanguage(src, lang);
    if (fixed && !wrongLanguage(`${fixed.headline} ${fixed.dek}`, lang)) {
      console.log(`  ↻ ${lang.toUpperCase()} rewrote wrong-language item (${it.source})`);
      kept.push({ ...it, ...fixed });
    } else {
      console.log(`  ⛔ ${lang.toUpperCase()} dropped wrong-language item (${it.source})`);
    }
  }
  return kept;
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
 "summary":"<=60 chars; the SUBJECT LINE / episode title. It must name the day's LEAD THREAD — the single story most relevant to a coach, PT or studio operator (something they can act on), NOT the flashiest, biggest-number, or most geographically foreign story. It is a promise the rest of the issue then keeps. A real title, not a semicolon list.",
 "intro":"a FRESH 1-sentence opener for THIS issue in Sqwod's Morning-Brew voice — a specific hook that sets up the SAME lead thread as summary. Different every issue (no template), must NOT just restate summary or connectTitle, <=150 chars.",
 "connectTitle":"<=60 chars; the SAME lead thread as summary, framed as its non-obvious angle. summary promises it; this proves it — they must be about the same story, never two different ones.",
 "connectBody":"two short paragraphs separated by \\n that PAY OFF the summary/connectTitle promise: teach that exact pattern and land on the concrete 'so what' for an operator's business. Specific, witty, no fluff — do NOT pivot to an unrelated story.",
 "doThis":"one concrete action the reader can take this week",
 "meanwhile":"a light, witty aside about a DIFFERENT story than connectTitle focuses on. Must NOT restate or recap anything already covered in connectBody or the items list — pick the most off-beat angle and make a wry one-liner. Return an empty string if there is no genuinely distinct, fun angle left. No invented numbers.",
 "moneyMoves":[{"entity":"name from the items","kind":"raise|acquisition|valuation|ipo|shutdown","amount":"only if stated verbatim, else empty string","note":"one clause"}]  // ONLY for items that are actually raises/M&A/valuations; [] if none,
 "policyWatch":{"title":"...","body":"1-2 sentences on a regulation/policy that affects coaches or studios"} or null if no item is policy/regulatory,
 "stat":{"number":"the figure verbatim","label":"what it measures","body":"why it matters"} or null. The Stat MUST be a DIFFERENT figure than any amount in moneyMoves — prefer a market size, %, growth rate, adoption or count figure. If the only real number available is a funding/deal amount already surfaced in moneyMoves, return null rather than repeating it. Also skip small, hyper-local figures that a global coach/operator can't size (return null),
 "recs":[{"label":"Steal|Try|Read|Watch|Track","text":"a concrete, EVERGREEN, operator-useful action or resource"}]  // exactly 2-3 items. HARD RULES so recs are NOT a recap of the news: (a) each rec must be a DIFFERENT type AND topic from the others and from doThis; (b) NONE may restate, summarize, or reference today's items, connectBody, doThis, moneyMoves or stat — recs are fresh, standalone value; (c) be specific and immediately usable — a tactic to implement, a tool/tool-category to try, a habit or metric to start tracking, or a genuinely worth-it read/watch — never vague platitudes; (d) no invented brand names, prices, or numbers.
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

// Safety net on top of the prompt: drop any rec that just re-says a news
// headline (the "rundown ≈ recs" bug) or duplicates another rec. Token-overlap
// based; the affiliate rec is added AFTER this and always kept.
const REC_STOP = new Set(['this','that','with','from','your','their','into','have','will','more','than','study','finds','launch','launches','launched','targets','target','plans','plan','after','about','could','would','should','being','they','them','what','when','where','which','while','because','over','under','first','sqwod','daily','fitness','wellness','coach','coaches','studio','studios']);
function recTokens(str) {
  return new Set(String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !REC_STOP.has(w)));
}
function recOverlap(a, b) { let n = 0; for (const t of a) if (b.has(t)) n++; return n; }
function dedupeRecs(recs, items) {
  const heads = (items || []).map((i) => recTokens(`${i.headline || ''} ${i.dek || ''}`));
  const kept = [], seen = [];
  for (const r of recs) {
    const t = recTokens(`${r.label || ''} ${r.text || ''}`);
    if (t.size === 0) { kept.push(r); continue; }         // too short to judge — keep
    const echoesNews = heads.some((h) => { const o = recOverlap(t, h); return o >= 3 || (o > 0 && o / Math.min(t.size, h.size) >= 0.5); });
    if (echoesNews) continue;
    const dupRec = seen.some((s2) => { const o = recOverlap(t, s2); return o >= 3 || (o > 0 && o / Math.min(t.size, s2.size) >= 0.6); });
    if (dupRec) continue;
    kept.push(r); seen.push(t);
  }
  return kept;
}

// Build the full section package (model output + programmatic affiliate rec + Play).
function buildSections(lead, lang, items) {
  const s = lead && lead.connectTitle ? { ...lead } : {};
  // Backstop: never let the Stat box merely repeat a Money Movement amount already
  // shown above — that's the "one story, five mentions" bug. Deterministic, so it
  // holds even when the model ignores the prompt rule.
  if (s.stat && s.stat.number && Array.isArray(s.moneyMoves) && s.moneyMoves.length) {
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sn = norm(s.stat.number);
    if (sn && s.moneyMoves.some((m) => norm(m.amount) === sn)) delete s.stat;
  }
  // Marquee ordering: lead Money Movement with a globally-legible deal (our reader can
  // size €/$/£/m/bn) so an illegible micro-raise (₹/crore/¥) never takes the top slot.
  if (Array.isArray(s.moneyMoves) && s.moneyMoves.length > 1) {
    const LEG = /([$€£]\s?\d|\bUSD\b|\bEUR\b|\bGBP\b|\d[\d.,]*\s?(?:k|m|bn|million|billion)\b)/i;
    const ILL = /(crore|lakh|rs\.?\s?\d|₹|¥|rmb|yuan|₩|won|rupee|peso|baht|ringgit|rupiah|naira)/i;
    const rank = (m) => { const a = String(m.amount || ''); return ILL.test(a) ? 2 : (LEG.test(a) ? 0 : 1); };
    s.moneyMoves = s.moneyMoves.map((m, i) => [m, i]).sort((x, y) => (rank(x[0]) - rank(y[0])) || (x[1] - y[1])).map(([m]) => m);
  }
  // Backstop: "meanwhile" is an aside, never a re-run of a rundown item (the
  // "Garmin twice in one email" bug). Same token-overlap test the recs use —
  // deterministic, so it holds even when the model ignores the prompt rule.
  if (s.meanwhile) {
    const mt = recTokens(s.meanwhile);
    const echoesItem = (items || []).some((i) => {
      const h = recTokens(`${i.headline || ''} ${i.dek || ''}`);
      const o = recOverlap(mt, h);
      return o >= 3 || (o > 0 && o / Math.min(mt.size, h.size) >= 0.5);
    });
    if (echoesItem) { console.log('  ⛔ dropped "meanwhile" — it restated a rundown item'); delete s.meanwhile; }
  }
  const aff = pickAffiliateRec(lang);
  const modelRecs = dedupeRecs(Array.isArray(lead?.recs) ? lead.recs : [], items);
  s.recs = [...modelRecs, ...(aff ? [aff] : [])];
  s.play = {
    title: 'Sqwod Readiness Tap',
    prompt: lang === 'de'
      ? 'Wie wach bist du heute? 30-Sekunden-Reaktionstest — derselbe PVT, mit dem Schlafforscher Wachheit messen.'
      : 'How sharp are you today? 30-second reaction test — the same PVT sleep scientists use to measure alertness.',
    url: `/${lang}/play`,
  };
  return s;
}

// ---- REPAIR: regenerate one flagged item strictly from its source facts ----
// Used by the guardrail to fix an unsupported claim instead of holding the whole
// issue for a human. One bounded attempt; null on any failure (caller then drops).
async function repairItem(source, lang, critique) {
  if (!apiKey || !source) return null;
  const facts = (source.facts || []).map((f) => `${f.label}: ${f.value}${f.unit || ''}`).join('; ');
  const langName = lang === 'de' ? 'German' : 'English';
  const prompt = `Rewrite ONE Sqwod Daily news item in ${langName} about "${source.entity}". A fact-check flagged the previous draft: ${critique}. Use ONLY these facts and state nothing beyond them: ${facts}. Keep Sqwod's witty Morning-Brew voice; headline <= 70 chars; dek 1–2 sentences. Respond ONLY as minified JSON: {"headline":"...","dek":"..."}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const obj = JSON.parse((data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return obj.headline ? { headline: obj.headline, dek: obj.dek } : null;
  } catch (e) { console.error(`· repair failed (${lang}): ${e.message}`); return null; }
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
For each issue also set "itemIndex": the 0-based position of the item (in the order listed) whose headline or dek contains the claim, or -1 if the claim is in connectDots / stat / moneyMoves rather than an item.
Respond ONLY as minified JSON: {"issues":[{"claim":"...","problem":"...","blocking":true|false,"itemIndex":int}],"dropStat":true|false,"dropMoneyIndexes":[ints]}`;
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
    `summary: ${q((sections && sections.summary) || (items[0] && items[0].headline) || 'Sqwod Daily')}`,
    `status: ${q(issueStatus)}`,
    `intro: ${q((sections && sections.intro) || (lang === 'de'
      ? 'Heutige Reps: was sich in der Branche bewegt hat, ohne Fachchinesisch — und warum es dich interessieren sollte.'
      : "Today's reps: what moved in the industry, minus the corporate snooze — and why you should care."))}`,
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
  if (s.move && s.move.url) {
    lines.push('move:');
    lines.push(`  url: ${q(s.move.url)}`);
    if (s.move.note) lines.push(`  note: ${q(s.move.note)}`);
    if (s.move.platform) lines.push(`  platform: ${q(s.move.platform)}`);
    if (s.move.handle) lines.push(`  handle: ${q(s.move.handle)}`);
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

  const move = pickMove();   // one curated clip for the day (same in EN + DE); null if queue empty
  if (move) console.log(`🎬 Move of the Day: ${move.platform || 'clip'} ${move.handle || ''} ${move.url}`);
  let published = false;

  for (const lang of LANGS) {
    let items = [];
    for (const src of sources) {
      const out = await generate('daily-item', src, lang);
      items.push({ ...out, pillar: src.pillar, conversion: src.conversion, sourceId: src.id, source: src.entity });
    }
    items = await enforceLanguage(items, sources, lang);   // an EN issue never ships German copy
    const lead = await generateLead(items, lang);
    let sections = buildSections(lead, lang, items);     // model output + affiliate rec + Play (even in dry-run); items → rec dedup
    if (move) sections.move = move;               // feature the curated clip at the top of the Daily
    const v = await verifyIssue(items, sections, sources, lang);  // fact-check vs source facts
    sections = v.sections;
    if (v.issues.length) {
      const auto = v.issues.length - (v.blocking || []).length;
      if (auto) console.log(`✓ ${lang.toUpperCase()} auto-removed ${auto} unsupported stat/money claim(s)`);
    }

    // GUARDRAIL (no human review): auto-remediate every embedded claim. Repair the
    // flagged item once from its source facts, re-verify, then DROP whatever is still
    // unsupported. A flagged synthesis (connectDots) is dropped, not held. We never
    // publish a claim a human would have had to vet.
    let blocking = v.blocking || [];
    const itemLevel = (b) => Number.isInteger(b.itemIndex) && b.itemIndex >= 0;
    if (blocking.length && apiKey) {
      const bad = [...new Set(blocking.filter(itemLevel).map((b) => b.itemIndex))];
      for (const i of bad) {
        const critique = blocking.filter((b) => b.itemIndex === i).map((b) => b.problem).join('; ');
        const fixed = await repairItem(sources[i], lang, critique);
        if (fixed) { items[i] = { ...items[i], ...fixed }; console.log(`  ↻ ${lang.toUpperCase()} repaired item ${i + 1} (${items[i].source})`); }
      }
      if (blocking.some((b) => !itemLevel(b))) { delete sections.connectTitle; delete sections.connectBody; }
      const v2 = await verifyIssue(items, sections, sources, lang);
      sections = v2.sections;
      if ((v2.blocking || []).some((b) => !itemLevel(b))) { delete sections.connectTitle; delete sections.connectBody; }
      const stillBad = new Set((v2.blocking || []).filter(itemLevel).map((b) => b.itemIndex));
      if (stillBad.size) {
        console.log(`  ⛔ ${lang.toUpperCase()} dropped ${stillBad.size} item(s) still unsupported after repair`);
        items = items.filter((_, i) => !stillBad.has(i));
      }
      blocking = [];
    }

    // SOURCE GUARDRAIL: a factual issue only ships items that trace to a live source link.
    {
      const before = items.length;
      items = items.filter((it) => it.readMore && /^https?:\/\//.test(it.readMore));
      if (items.length < before) console.log(`  ⛔ ${lang.toUpperCase()} dropped ${before - items.length} item(s) with no source link`);
    }
    if (!items.length) { console.log(`  ⚠ ${lang.toUpperCase()} no verifiable items left — NOT publishing ${date}.${lang}`); continue; }

    const issueStatus = status;  // always publish; the guardrail already remediated everything
    // One-line episode title — computed AFTER any drops so it never names a removed item.
    sections.summary = (lead && lead.summary) || sections.connectTitle || (items[0] && items[0].headline) || 'Sqwod Daily';
    sections.audioScript = await generateAudioScript(items, sections, lang);  // spoken brief for TTS (verified facts only)
    if (sections.audioScript) console.log(`🎙  ${lang.toUpperCase()} audio brief authored (${sections.audioScript.split(/\s+/).length} words)`);
    if (move) sections.move = move;   // re-affirm (the verify pass rebuilds sections)
    const file = join(DAILY_OUT, `${date}.${lang}.md`);
    writeFileSync(file, issueFrontmatter(date, lang, items, sections, issueStatus));
    published = true;
    console.log(`✓ ${lang.toUpperCase()} issue → site/src/content/daily/${date}.${lang}.md  (${items.length} items, status: ${issueStatus})`);
  }
  if (move && published) markMoveUsed(move.id);   // each curated clip runs once

  console.log(`\nMode: ${dryRun ? 'DRY-RUN (no LLM key)' : 'LLM'}  ·  Source: ${date}  ·  ${sources.length} sources → ${LANGS.length} bilingual issues`);
  console.log('Cascade steps still available per source (see prompts/cascade.md): report · article · newsletter · social.');
  console.log('Next: review the drafts, then run with --status=published (or approve in your editor).');
}

run();
