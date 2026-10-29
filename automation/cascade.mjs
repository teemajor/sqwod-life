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
import { isOnBrand, isProductReview } from './onbrand.mjs';
import { staleReason, isLabelledAd } from './article.mjs';
import { isGoogleNews, resolveAll, phraseProblems, isObituary, stripPhrases, noEmDash, pickGearRec, wrongLanguage, foreignSentences } from './quality.mjs';

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
const SEARCH_TOOL = process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209';

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
// ---- HOUSE VOICE (rewritten 2026-10-19) ----------------------------------------
// The old brief ("Morning Brew for the fitness industry: witty, cheeky, a joke per
// item") produced clever jargon and spin on top of headline-only facts ("the corporate
// wellness gravy train", "go move something"). Tee's call: it's news, so a real update
// with facts, told plainly, as a story the reader can follow. One definition, used by
// every prompt below, so the voice cannot drift between steps.
const LANG_NAME = { en: 'English', de: 'German' };
// The issue date, so the writer can tell past from future (set in run()).
let ISSUE_DATE = new Date().toISOString().slice(0, 10);
const longDate = (lang) => new Date(`${ISSUE_DATE}T12:00:00Z`).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function voice(lang) {
  const de = lang === 'de';
  return `VOICE: Sqwod Daily is a trusted news brief for fitness industry professionals: studio and gym founders and operators first, then coaches and personal trainers, brand operators, investors and the companies that sell into the industry. Write like a good trade reporter explaining the news to a smart peer.
- Report first: who did what, where, when, and how much. Use the names, numbers and dates in the source.
- TODAY is ${longDate(lang)}. Compare every date in the source with today. Something dated before today already happened: report it in the past tense, never as upcoming. Never present an old result or an event that is over as new.
- Then, where the facts support it, one plain sentence on what it means for operators, coaches or the brands and investors in that category. If the facts do not support a lesson, just report the news.
- Plain words, short sentences, active voice. Explain any term a coach might not know in a few words.
- No slang, idioms, puns, jokes, wordplay, hype or clever phrasing. No unexplained abbreviations.
- Never invent anything. If a detail is not in the source, leave it out.
- LANGUAGE: write ONLY in ${LANG_NAME[lang]}. Every sentence, including names of events and programmes and any quotes, must be in ${LANG_NAME[lang]}: translate them, keeping only proper names (companies, people, product names) as they are.${de ? ' Address the reader as "du". Use normal German words, not English buzzwords, where a German word exists.' : ' When a German organisation appears, say briefly what it is (e.g. "the DSSV, Germany\'s association of fitness and health club operators").'}
- House style: no em dashes (use a colon, comma or full stop). Never write "the business of fitness".`;
}
// The facts we may use for one source: headline, outlet, deal, and the article text.
const factsOf = (source) => (source?.facts || []).map((f) => `${f.label}: ${f.value}${f.unit || ''}`).join('\n');
async function askJSON(prompt, maxTokens = 600) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
  const data = await r.json();
  return JSON.parse((data.content?.[0]?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
// The news-item brief, shared by first draft, language rewrite and fact repair.
function itemPrompt(source, lang, note = '') {
  const thin = source?.thin || !(source?.facts || []).some((f) => f.label === 'Article');
  return `You are the editor of Sqwod Daily. Write ONE news item in ${LANG_NAME[lang]} about this story.
${note ? `\nIMPORTANT: ${note}\n` : ''}
${voice(lang)}

Source facts (the ONLY facts you may use):
${factsOf(source)}
Source: ${source?.provenance || 'n/a'}

Write:
- "headline": a plain news headline, <= 80 characters, that states what happened (who did what). Lead with the key number when there is one.
- "dek": ${thin ? 'ONE sentence that restates the headline in plain words. Only the headline is available, so add nothing else.' : '2 to 3 sentences: what happened with the key details (where, when, how much, who is involved), then one sentence on why it matters for studio owners, coaches or brands, drawn from the facts (a competitor move, a price, a market signal). If the facts give no basis for that sentence, stop after the details.'}
- If the story is about someone's death: respectful and factual only. No lesson, no advice.
Respond ONLY as minified JSON: {"headline":"...","dek":"..."}`;
}

async function generate(step, source, lang) {
  if (apiKey) {
    // Real authoring: the model writes natively in `lang` from the source facts.
    const prompt = itemPrompt(source, lang);
    // retry transient API errors (429/5xx/overloaded); never let one item crash the run
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
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
// Every problem in a block of finished text: wrong language, clickbait, slang, tagline.
function textProblems(text, lang) {
  const out = foreignSentences(text, lang).map((s) => `this sentence is not in ${LANG_NAME[lang]}: "${s.slice(0, 120)}"`);
  return [...out, ...phraseProblems(text)];
}
// The strings inside the framing sections, with a path so a bad one can be removed.
function sectionStrings(s) {
  const out = [];
  for (const k of ['summary', 'intro', 'connectTitle', 'connectBody', 'doThis', 'dealRead', 'meanwhile']) if (typeof s?.[k] === 'string' && s[k]) out.push([k, s[k]]);
  if (s?.stat) out.push(['stat', `${s.stat.label || ''}. ${s.stat.body || ''}`]);
  if (s?.policyWatch) out.push(['policyWatch', `${s.policyWatch.title || ''}. ${s.policyWatch.body || ''}`]);
  (s?.recs || []).forEach((r, i) => { if (!r.affiliate) out.push([`recs.${i}`, r.text || '']); });
  (s?.moneyMoves || []).forEach((m, i) => out.push([`moneyMoves.${i}`, m.note || '']));
  return out;
}
const sectionProblems = (s, lang) => sectionStrings(s).flatMap(([k, v]) => textProblems(v, lang).map((p) => `${k}: ${p}`));
// Last resort: drop whatever still fails. A missing box beats a wrong one.
function stripBadSections(s, lang) {
  const bad = new Set(sectionStrings(s).filter(([, v]) => textProblems(v, lang).length).map(([k]) => k));
  if (!bad.size) return s;
  console.log(`  ⛔ ${lang.toUpperCase()} removed section(s) that failed the language/style check: ${[...bad].join(', ')}`);
  for (const k of bad) {
    if (k === 'connectTitle' || k === 'connectBody') { delete s.connectTitle; delete s.connectBody; }
    else if (k.startsWith('recs.')) s.recs[+k.split('.')[1]] = null;
    else if (k.startsWith('moneyMoves.')) s.moneyMoves[+k.split('.')[1]] = null;
    else delete s[k];
  }
  if (s.recs) s.recs = s.recs.filter(Boolean);
  if (s.moneyMoves) s.moneyMoves = s.moneyMoves.filter(Boolean);
  return s;
}
// Rewrite a wrong-language item natively from its source facts; null on failure.
async function rewriteInLanguage(source, lang) {
  if (!apiKey || !source) return null;
  try {
    const obj = await askJSON(itemPrompt(source, lang, `The previous draft was written in the WRONG LANGUAGE. Write it natively in ${LANG_NAME[lang]}, never as a word-for-word translation.`), 500);
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

// ---- issue-level sections: the through-line, one action, the boxes ----------------
// Built from the FINAL item list (after every drop), so it can never be about a story
// the reader doesn't see (Oct 2026: the whole 19 Oct issue hung on a dropped item).
function storyList(items, sources, withText = true) {
  return items.map((it, n) => {
    const src = sources.find((s) => s.id === it.sourceId);
    const art = withText ? ((src?.facts || []).find((f) => f.label === 'Article')?.value || '') : '';
    return `${n + 1}. ${it.headline}\n   ${it.dek}${art ? `\n   Article: ${art.slice(0, 900)}` : ''}`;
  }).join('\n');
}
async function generateLead(items, sources, lang, note = '') {
  if (!apiKey || !items.length) return null;
  const prompt = `You are the editor of Sqwod Daily. Today's stories are below. Write the issue's framing sections in ${LANG_NAME[lang]}.
${note ? `\nIMPORTANT: ${note}\n` : ''}
${voice(lang)}

Today's stories (the ONLY facts available):
${storyList(items, sources)}

Produce ONE minified JSON object. Never invent numbers, companies, deals, dates or statistics: only use what appears above. If a section has no real basis, return null (or [] or "") for it.
{
 "summary":"<=90 chars; the email SUBJECT LINE. Name the day's 2 or 3 most important stories in plain words, joined with commas and '&', most important first, e.g. 'Huppa raises €1M for studio software, Reformd plans a US Lagree flagship & DSSV prevention training'.",
 "intro":"ONE plain sentence (<=160 chars) telling the reader what today's issue covers, starting with the most important story.",
 "connectTitle":"<=70 chars; a plain title for the most useful story for coaches and studio owners (the same story the summary leads with).",
 "connectBody":"two short paragraphs separated by \\n. Paragraph 1: the facts of that story, told as a short story (what happened, the details, the context given). Paragraph 2: what it means in practice for a coach or studio owner, grounded in those facts. No speculation beyond the facts.",
 "doThis":"one concrete thing a coach or studio owner can do this week, linked to today's news",
 "meanwhile":"",
 "moneyMoves":[{"entity":"company name from the stories","kind":"raise|acquisition|valuation|ipo|shutdown","amount":"only if stated verbatim, else empty string","note":"one plain clause"}]  // ONLY real raises, M&A, valuations, IPOs, and closures (kind "shutdown": a company closes, goes bankrupt, insolvent or into administration); [] if none,
 "dealRead":"ONLY if moneyMoves is non-empty: 1-2 plain sentences for investors and brand operators on what today's deals signal for that category (who is funding what, which model is attracting money, what it means for incumbents). Facts only; else \"\"",
 "policyWatch":{"title":"...","body":"1-2 plain sentences"} or null. Only for a law, regulation, health-insurance rule, association programme or official requirement that affects coaches or studios,
 "stat":{"number":"a figure verbatim from the stories","label":"what it measures","body":"one plain sentence on why it matters"} or null. Must be a different figure than any moneyMoves amount,
 "recs":[{"label":"Try|Read|Track","text":"a concrete, evergreen, useful tip or resource for a coach or studio owner"}]  // exactly 2. Each a different type and topic; NOT a recap of today's stories; no invented brand names, prices or numbers.
}`;
  try { return await askJSON(prompt, 1300); } catch (e) { console.error('lead generation failed:', e.message); return null; }
}

// ---- SPOKEN BRIEF: the day's news, told for the ear --------------------------------
const WEEKDAY = { en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], de: ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'] };
async function generateAudioScript(items, sections, sources, lang, date, note = '') {
  if (!apiKey || !items.length) return '';
  const day = WEEKDAY[lang][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const close = lang === 'de' ? `Das war Sqwod Daily am ${day}. Danke fürs Zuhören.` : `That's Sqwod Daily for ${day}. Thanks for listening.`;
  const prompt = `You are the host of Sqwod Daily, a spoken news bulletin for people who run fitness businesses. Write the full script for today's episode in ${LANG_NAME[lang]}, read aloud by one host.
${note ? `\nIMPORTANT: ${note}\n` : ''}
${voice(lang)}

Today's stories, most important first (the ONLY facts available):
${storyList(items, sources)}

How to tell it:
- Open with the most important story in one or two sentences: what happened, in plain words. No "Welcome", no teaser, no riddle.
- Then take each story in turn. For each: what happened, the key details (names, places, numbers, dates), and, where the facts support it, one sentence on what it means for coaches or studio owners.
- Simple spoken links between stories ("Next, ...", "In Germany, ...", "And finally, ...").
- Say numbers the way a person would say them. Explain unfamiliar terms in a few words.
- Every single sentence must be in ${LANG_NAME[lang]}: translate event names, programme names and quotes.
- End with exactly: "${close}"
- 250 to 420 words. No headers, bullet points, stage directions or "[pause]".

Respond ONLY as minified JSON: {"script":"the full script as one string, paragraphs separated by \\n"}`;
  try {
    const obj = await askJSON(prompt, 1600);
    return typeof obj.script === 'string' ? obj.script.trim() : '';
  } catch (e) { console.error(`audio-script generation failed (${lang}):`, e.message); return ''; }
}
// Deterministic fallback when the model script fails a guard twice: headlines + deks,
// read in order. Plain, correct, in the right language.
function fallbackScript(items, lang, date) {
  const day = WEEKDAY[lang][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const open = lang === 'de' ? `Das ist Sqwod Daily am ${day}.` : `This is Sqwod Daily for ${day}.`;
  const close = lang === 'de' ? `Das war Sqwod Daily am ${day}. Danke fürs Zuhören.` : `That's Sqwod Daily for ${day}. Thanks for listening.`;
  return [open, ...items.map((i) => `${i.headline}. ${i.dek}`), close].join('\n');
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
  const s = lead ? { ...lead } : {};   // keep summary/intro/boxes even when the through-line was dropped
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
  // Topical, rotating Gear rec (quality.mjs); falls back to the old first-review pick.
  const aff = pickGearRec({ reviewsDir: REVIEWS_DIR, dailyDir: DAILY_OUT, lang, items, date: args.date || new Date().toISOString().slice(0, 10) }) || pickAffiliateRec(lang);
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
  try {
    const obj = await askJSON(itemPrompt(source, lang, `A check flagged the previous draft: ${critique}. Fix that, and state nothing beyond the source facts.`), 500);
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
// Every string written to an issue passes the house-style scrub (quality.mjs):
// no em dashes, never Fitt Insider's tagline. URLs are left untouched.
const q = (s) => JSON.stringify(typeof s === 'string' ? noEmDash(stripPhrases(s)) : (s ?? ''));

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
      ? 'Die wichtigsten Nachrichten aus der Fitnessbranche von heute, kurz und klar erklärt.'
      : "Today's most important fitness industry news, explained in plain words."))}`,
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

// ---- thin-item enrichment (27 Oct 2026) --------------------------------------
// A headline-only source made one-sentence items ("Whoop valued at $10.1 billion." and
// nothing else). Before writing, each thin source gets ONE web lookup for the facts a
// reader needs (who, how much, when, why it matters), each with the URL it came from.
// The facts join the source's fact list, so the item fact-check below still holds every
// claim to a source. No verified facts back = the item stays thin, never padded.
async function enrichThin(sources) {
  if (!apiKey || args['no-enrich']) return;
  const thin = sources.filter((s) => s.thin || !(s.facts || []).some((f) => f.label === 'Article'));
  for (const src of thin) {
    const prompt = `Find the facts behind this fitness/wellness industry news headline. Search the web, open the most reliable reports (company release, trade press, major outlet), and list ONLY facts stated there.
Headline: ${src.topic}
Outlet: ${src.entity || 'n/a'}${src.readMore || src.en?.readMore ? `\nOriginal link: ${src.readMore || src.en.readMore}` : ''}
Respond ONLY as minified JSON: {"facts":[{"fact":"one short factual sentence (who, what, how much, when)","url":"https://... the page that states it"}],"context":"one sentence of verified background (e.g. prior round, size, market), or empty"}
Rules: 2 to 5 facts. Every fact needs a URL you opened. No estimates, no opinion. Today is ${ISSUE_DATE}: the facts must be about what THIS headline reports, from coverage published in the last 14 days. Do not fill the gap with an older story about the same company (an earlier quarter, last year's event). Put the date in each fact. If you cannot verify recent facts, return {"facts":[]}.`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }], tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 4 }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const txt = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const m = txt.match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : null;
      const facts = (j?.facts || []).filter((f) => f && f.fact && /^https?:\/\//.test(f.url || ''));
      if (facts.length < 2) { console.log(`  · enrich: no verified facts for "${src.topic}" (stays short)`); continue; }
      const text = [...facts.map((f) => `${f.fact} (${f.url})`), ...(j.context ? [`Background: ${j.context}`] : [])].join(' ');
      src.facts = [...(src.facts || []), { label: 'Article', value: text }];
      src.provenance = `${src.provenance || src.entity || ''}; enriched from ${[...new Set(facts.map((f) => new URL(f.url).hostname))].join(', ')}`;
      src.thin = false;
      console.log(`  ＋ enriched "${src.topic}" with ${facts.length} sourced facts`);
    } catch (e) { console.error(`  · enrich failed for "${src.topic}": ${e.message}`); }
  }
}

// ---- run the daily step -------------------------------------------------
async function run() {
  const byDate = loadSources();
  const dates = Object.keys(byDate).sort();
  const date = args.date || dates[dates.length - 1];
  ISSUE_DATE = date;
  if (!byDate[date]) {
    console.log(`No source file for ${date} (ingest found nothing today). Nothing to generate — exiting cleanly.`);
    process.exit(0);   // no-op day, not a failure
  }
  const sources = byDate[date];
  mkdirSync(DAILY_OUT, { recursive: true });
  await enrichThin(sources);   // headline-only stories get sourced facts before anyone writes
  // NOT NEWS ANY MORE (28 Oct 2026). The dates in the facts decide, not the feed date:
  // a stock app's 2026 page was "enriched" with Xponential's March 2025 results, and a
  // DSSV photo gallery with the announcement of an event that had already ended.
  for (let k = sources.length - 1; k >= 0; k--) {
    const src = sources[k];
    const text = (src.facts || []).filter((f) => f.label === 'Article').map((f) => f.value).join(' ');
    const why = isLabelledAd(text) ? 'the publisher labels it as an ad' : staleReason(text, date, src.topic);
    if (why) { console.log(`  ⌛ dropped "${String(src.topic).slice(0, 60)}": ${why}`); sources.splice(k, 1); }
  }
  if (!sources.length) { console.log(`No current stories left for ${date}. Nothing to publish.`); process.exit(0); }

  const move = pickMove();   // one curated clip for the day (same in EN + DE); null if queue empty
  if (move) console.log(`🎬 Move of the Day: ${move.platform || 'clip'} ${move.handle || ''} ${move.url}`);
  let published = false;

  // ITEMS for one language from a list of sources: write, then every guard. Returns
  // the items that survived (each keeps its sourceId).
  const srcOf = (it) => sources.find((s) => s.id === it.sourceId) || {};
  async function buildItems(lang, srcList) {
    let items = [];
    for (const src of srcList) {
      const out = await generate('daily-item', src, lang);
      items.push({ ...out, pillar: src.pillar, conversion: src.conversion, sourceId: src.id, source: src.entity });
    }
    items = await enforceLanguage(items, sources, lang);   // an EN issue never ships German copy
    // ON-BRAND GUARDRAIL: nothing outside the fitness/wellness industry EVER ships
    // (belt-and-braces on top of ingest — catches a polluted source file too).
    {
      const before = items.length;
      items = items.filter((it) => {
        const src = srcOf(it);
        if (isProductReview(src.topic || '')) return false;   // the Daily is news, not product reviews
        return isOnBrand(`${src.topic || ''} ${it.headline || ''} ${it.dek || ''}`, src.entity || '');
      });
      if (items.length < before) console.log(`  ⛔ ${lang.toUpperCase()} dropped ${before - items.length} OFF-BRAND item(s) — not fitness/wellness industry news`);
    }
    // QUALITY GUARD (quality.mjs): clickbait, slang, Fitt's tagline and obituary spin get
    // one rewrite from the source facts; if that fails, deterministic clean-up.
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const txt = `${it.headline || ''} ${it.dek || ''}`;
      const src = srcOf(it);
      const obit = isObituary(`${src?.topic || ''} ${txt}`);
      const probs = phraseProblems(txt);
      if (obit) items[i].conversion = 'list-growth';   // never tag a death with a product path
      if (!probs.length && !obit) continue;
      const critique = [...probs, ...(obit ? ['this is about a death: respectful and factual only, no business lesson, no advice, no joke'] : [])].join('; ');
      const fixed = apiKey ? await repairItem(src, lang, critique) : null;
      const next = fixed ? { ...items[i], ...fixed } : items[i];
      next.headline = stripPhrases(next.headline); next.dek = stripPhrases(next.dek);
      items[i] = next;
      console.log(`  ✎ ${lang.toUpperCase()} quality rewrite item ${i + 1}: ${critique}`);
    }

    // ITEM FACT-CHECK first, so the issue's framing is written from the FINAL story
    // list. (19 Oct 2026: the lead, stat, intro and audio all hung on a story that was
    // dropped after they were written.) Repair once from the item's OWN source, re-check,
    // then drop what is still unsupported.
    if (apiKey && items.length) {
      const v = await verifyIssue(items, {}, sources, lang);
      const bad = [...new Set((v.blocking || []).filter((b) => Number.isInteger(b.itemIndex) && b.itemIndex >= 0).map((b) => b.itemIndex))];
      for (const i of bad) {
        if (!items[i]) continue;
        const critique = v.blocking.filter((b) => b.itemIndex === i).map((b) => b.problem).join('; ');
        const fixed = await repairItem(srcOf(items[i]), lang, critique);
        if (fixed) { items[i] = { ...items[i], ...fixed }; console.log(`  ↻ ${lang.toUpperCase()} repaired item ${i + 1} (${items[i].source})`); }
      }
      if (bad.length) {
        const v2 = await verifyIssue(items, {}, sources, lang);
        const stillBad = new Set((v2.blocking || []).filter((b) => Number.isInteger(b.itemIndex) && b.itemIndex >= 0).map((b) => b.itemIndex));
        if (stillBad.size) {
          console.log(`  ⛔ ${lang.toUpperCase()} dropped ${stillBad.size} item(s) still unsupported after repair`);
          items = items.filter((_, i) => !stillBad.has(i));
        }
      }
    }

    // LINK GUARD: replace Google News redirect links with the publisher's own URL.
    {
      const idx = items.map((it, k) => (isGoogleNews(it.readMore) ? k : -1)).filter((k) => k >= 0);
      if (idx.length) {
        const fixed = await resolveAll(idx.map((k) => items[k].readMore));
        let n = 0; idx.forEach((k, j) => { if (fixed[j] !== items[k].readMore) { items[k].readMore = fixed[j]; n++; } });
        console.log(`  🔗 ${lang.toUpperCase()} resolved ${n}/${idx.length} Google News link(s) to the publisher`);
      }
    }
    // SOURCE GUARDRAIL: a factual issue only ships items that trace to a live source link.
    {
      const before = items.length;
      items = items.filter((it) => it.readMore && /^https?:\/\//.test(it.readMore));
      if (items.length < before) console.log(`  ⛔ ${lang.toUpperCase()} dropped ${before - items.length} item(s) with no source link`);
    }
    return items;
  }

  // ONE STORY SET, TWO LANGUAGES (28 Oct 2026). Each edition used to run its guards on
  // its own, so a story dropped in one language could survive in the other: the EN issue
  // had SATS and no Xponential, the DE issue the reverse. Now a story missing from one
  // edition gets one more try in that language; if it still fails, neither edition runs it.
  const itemsBy = {};
  for (const lang of LANGS) itemsBy[lang] = await buildItems(lang, sources);
  const idsOf = (lang) => new Set(itemsBy[lang].map((it) => it.sourceId));
  const union = new Set(LANGS.flatMap((l) => [...idsOf(l)]));
  for (const lang of LANGS) {
    const missing = sources.filter((s) => union.has(s.id) && !idsOf(lang).has(s.id));
    if (!missing.length) continue;
    console.log(`  ↻ ${lang.toUpperCase()} retrying ${missing.length} story(ies) the other edition kept`);
    itemsBy[lang].push(...await buildItems(lang, missing));
  }
  const common = [...union].filter((id) => LANGS.every((l) => idsOf(l).has(id)));
  const order = (id) => sources.findIndex((s) => s.id === id);
  for (const lang of LANGS) {
    const dropped = itemsBy[lang].filter((it) => !common.includes(it.sourceId)).length;
    if (dropped) console.log(`  ⛔ ${lang.toUpperCase()} dropped ${dropped} story(ies) the other edition could not run`);
    itemsBy[lang] = itemsBy[lang].filter((it) => common.includes(it.sourceId)).sort((x, y) => order(x.sourceId) - order(y.sourceId));
  }

  for (const lang of LANGS) {
    const items = itemsBy[lang];
    if (!items.length) { console.log(`  ⚠ ${lang.toUpperCase()} no verifiable items left — NOT publishing ${date}.${lang}`); continue; }

    // FRAMING from the final list: lead, boxes, recs. Language/style checked; one
    // rewrite with the problems named, then anything still failing is removed.
    let lead = await generateLead(items, sources, lang);
    if (lead) {
      const probs = sectionProblems(lead, lang);
      if (probs.length) {
        console.log(`  ✎ ${lang.toUpperCase()} rewriting framing: ${probs.slice(0, 3).join(' | ')}`);
        lead = (await generateLead(items, sources, lang, `A check flagged the previous draft: ${probs.slice(0, 6).join('; ')}. Fix every one.`)) || lead;
      }
    }
    let sections = buildSections(lead, lang, items);
    if (move) sections.move = move;               // feature the curated clip at the top of the Daily
    const v = await verifyIssue(items, sections, sources, lang);  // fact-check the framing vs source facts
    sections = v.sections;
    if ((v.blocking || []).length) {
      console.log(`  ⛔ ${lang.toUpperCase()} removed unsupported framing (${v.blocking.length} claim(s))`);
      delete sections.connectTitle; delete sections.connectBody;
    }
    sections = stripBadSections(sections, lang);

    const issueStatus = status;  // always publish; the guardrail already remediated everything
    // Subject line — a COMBINATION of the day's topics. Fallback stitches the top two headlines.
    const frag = (h) => String(h || '').split(/\s+[—–:]\s+|,\s/)[0].trim();
    const combo = items.slice(0, 2).map((i) => frag(i.headline)).filter(Boolean).join(' & ');
    sections.summary = sections.summary || combo || sections.connectTitle || 'Sqwod Daily';

    // AUDIO: written from the final stories, then checked sentence by sentence. A
    // foreign-language or slang sentence gets one rewrite; failing that, the plain
    // fallback script (headlines + deks) is used. The voice reads whatever we write.
    {
      let script = await generateAudioScript(items, sections, sources, lang, date);
      let probs = script ? textProblems(script, lang) : [];
      if (script && probs.length) {
        console.log(`  ✎ ${lang.toUpperCase()} rewriting audio script: ${probs.slice(0, 3).join(' | ')}`);
        script = await generateAudioScript(items, sections, sources, lang, date, `A check flagged the previous script: ${probs.slice(0, 6).join('; ')}. Fix every one.`);
        probs = script ? textProblems(script, lang) : [];
      }
      if (!script || probs.length) {
        if (apiKey) console.log(`  ⛔ ${lang.toUpperCase()} audio script still failing checks — using the plain fallback script`);
        script = apiKey ? fallbackScript(items, lang, date) : '';
      }
      sections.audioScript = script;
      if (script) console.log(`🎙  ${lang.toUpperCase()} audio brief authored (${script.split(/\s+/).length} words)`);
    }
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
