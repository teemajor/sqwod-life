#!/usr/bin/env node
/**
 * Sqwod Intelligence — MONTHLY FLAGSHIP report generator (v2, Oct 2026).
 *
 * Replaces the weekly auto-drafter. One flagship per month, built on the CHART BANK
 * (automation/intelligence-charts/*.json — exact chart data pulled from the Statista PPTX
 * decks by statista-charts.mjs) plus newer public sources found by web search.
 *
 *   node automation/intelligence-flagship.mjs                 # pick + draft + queue + email
 *   node automation/intelligence-flagship.mjs --study=63282   # force a study
 *   node automation/intelligence-flagship.mjs --dry           # pick only, print the plan
 *   node automation/intelligence-flagship.mjs --apply         # publish approved / archive rejected
 *
 * What makes it safe:
 *   • Figures come ONLY from the chart bank (+ fresh sources with URLs). Every number in the
 *     draft body is checked against that allow-list; strays are listed in the approval email.
 *   • German is written natively and VERIFIED to be German; there is no English fallback.
 *   • A study is never reused within 18 months, and topics already covered live are skipped.
 *   • Nothing reaches the site until Tee taps Approve in the email (then --apply moves it).
 *
 * Env: ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_FROM, INTEL_REVIEWER_EMAIL,
 *      INTEL_SIGNING_SECRET, INTEL_WORKER_URL, SQWOD_MODEL (default claude-sonnet-4-6)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BANK = join(__dirname, 'intelligence-charts');
const SOURCES = join(__dirname, 'sources');
const DRAFTS = join(__dirname, 'intel-drafts');
const QUEUE = join(__dirname, 'intel-queue');
const LOG = join(__dirname, 'intel-flagship-log.json');
const ARTICLES = join(ROOT, 'site', 'src', 'content', 'articles');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = args.date || new Date().toISOString().slice(0, 10);
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const SEARCH_TOOL = process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209';
const RESEND = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';
const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');
const REPO = process.env.GITHUB_REPOSITORY || 'teemajor/sqwod-life';
const REUSE_MONTHS = 18;

const q = (s) => JSON.stringify(s ?? '');
const slugify = (s) => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'worldwide', 'global', 'market', 'data', 'analysis', 'report', 'statista', 'dossier', 'study', 'share', 'number', 'value', 'rate', 'united', 'states', 'usd', 'revenue', 'billion', 'million', 'industry', 'that', 'this', 'what', 'your', 'how', 'why']);
const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9äöüß\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)));
const overlap = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n; };

// ---------- 1. candidates from the chart bank ----------
const CORE = /fitness|gym|club|studio|coach|trainer|wearable|smartwatch|tracker|equipment|supplement|protein|nutrition|recovery|wellness|spa|sport|physical activity|yoga|pilates|peloton|digital health|online fitness|functional/i;
const OFF = /tiktok|e mail marketing|email marketing|content marketing|sme marketing|text based|public relations|influencer|instagram|social media marketing|marketing in the united states|video content creators|creative content|metaverse/i;

function loadBank() {
  if (!existsSync(BANK)) return [];
  return readdirSync(BANK).filter((f) => f.endsWith('.json')).map((f) => {
    const j = JSON.parse(readFileSync(join(BANK, f), 'utf8'));
    const charts = (j.charts || []).filter((c) => c.title && c.categories?.length >= 2 && c.series?.length);
    const ts = charts.filter((c) => c.kind === 'timeseries');
    const cap = new Date().getFullYear() + 6; // forecasts beyond that are decorative, not data recency
    const maxYear = Math.max(0, ...charts.flatMap((c) => c.categories.map((y) => parseInt(String(y).match(/(19|20)\d{2}/)?.[0] || 0, 10)).filter((y) => y <= cap)));
    return { studyId: j.studyId, study: j.study, file: j.file, charts, ts: ts.length, cat: charts.length - ts.length, maxYear, key: toks(j.study + ' ' + charts.map((c) => c.title).join(' ')) };
  }).filter((s) => s.charts.length >= 6);
}
function newsKeywords(days = 45) {
  const set = new Set(); if (!existsSync(SOURCES)) return set;
  const cutoff = Date.now() - days * 86400000;
  for (const f of readdirSync(SOURCES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    if (new Date(f.slice(0, 10)).getTime() < cutoff) continue;
    try { for (const it of JSON.parse(readFileSync(join(SOURCES, f), 'utf8'))) for (const t of toks(`${it.topic || ''} ${it.headline || ''}`)) set.add(t); } catch {}
  }
  return set;
}
function liveReports() {
  const out = [];
  for (const dir of [ARTICLES, DRAFTS]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.en.md'))) {
      const fm = (readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
      const title = (fm.match(/^title:\s*(.+)$/m) || [])[1] || '', desc = (fm.match(/^description:\s*(.+)$/m) || [])[1] || '';
      const tags = (fm.match(/^tags:\s*(.+)$/m) || [])[1] || '';
      out.push({ slug: f.replace('.en.md', ''), key: toks(`${title} ${desc} ${tags}`), format: (fm.match(/^format:\s*(\w+)/m) || [])[1] });
    }
  }
  return out;
}
const readLog = () => (existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { used: {} });
function queuedStudies() {
  if (!existsSync(QUEUE)) return new Set();
  return new Set(readdirSync(QUEUE).filter((f) => f.startsWith('flagship-')).map((f) => { try { return String(JSON.parse(readFileSync(join(QUEUE, f), 'utf8')).studyId); } catch { return ''; } }));
}

function pick() {
  const bank = loadBank(), news = newsKeywords(), live = liveReports(), log = readLog(), queued = queuedStudies();
  const cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - REUSE_MONTHS);
  const scored = bank.map((s) => {
    const used = log.used[s.studyId]; const recentlyUsed = used && new Date(used) > cutoff;
    const covered = Math.max(0, ...live.filter((r) => r.format === 'report').map((r) => overlap(s.key, r.key)));
    const newsHit = overlap(s.key, news);
    const core = CORE.test(s.study) ? 4 : -6, off = OFF.test(s.study) ? -12 : 0;
    const recency = Math.max(0, s.maxYear - 2023) * 1.5;
    const score = s.ts * 1.2 + Math.min(s.cat, 20) * 0.3 + recency + Math.min(newsHit, 8) * 1.2 + core + off - (covered >= 5 ? 10 : covered >= 3 ? 4 : 0) - (recentlyUsed || queued.has(String(s.studyId)) ? 100 : 0);
    return { ...s, score, covered, newsHit, recentlyUsed };
  }).sort((a, b) => b.score - a.score);
  if (args.study) { const f = scored.find((s) => String(s.studyId) === String(args.study)); if (!f) throw new Error(`study ${args.study} not in chart bank`); return { top: f, scored }; }
  return { top: scored[0], scored };
}

// ---------- 2. model calls ----------
async function claude(prompt, { maxTokens = 4000, tools = null, system = '' } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
      if (system) body.system = system;
      if (tools) body.tools = tools;
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    } catch (e) { console.error(`  · model retry ${attempt}/3: ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 3000)); }
  }
  return '';
}
const parseJson = (t) => { try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

function datasetText(s) {
  return s.charts.map((c, i) => {
    const rows = c.series.map((x) => `${x.name ? x.name + ': ' : ''}${c.categories.map((cat, k) => `${cat}=${x.values[k] ?? '–'}`).join(', ')}`).join(' | ');
    return `[${i}] ${c.title}${c.unit ? ` (${c.unit})` : ''} — source: ${c.source || 'Statista'}${c.note ? ` — note: ${c.note.slice(0, 120)}` : ''}\n    ${rows}`;
  }).join('\n');
}

async function freshSources(s) {
  if (!apiKey) return [];
  const prompt = `You are a research assistant for Sqwod Intelligence (fitness & wellness industry media). Topic: "${s.study}". Our baseline dataset runs to ${s.maxYear}.
Search the web for 4 to 8 NEWER public figures (published ${s.maxYear + 1} or later) from credible primary sources (trade associations, company filings, government statistics, named research firms, peer-reviewed studies). Each must be a concrete number with a date and a URL you actually opened.
Respond ONLY as minified JSON: {"fresh":[{"label":"what it measures","value":"the figure with unit","period":"year or date","source":"publisher name","url":"https://...","note":"one line of context"}]}
Rules: no estimates of your own, no figures without a URL, no paywalled teasers, no Statista pages (we already have Statista).`;
  const t = await claude(prompt, { maxTokens: 2500, tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 8 }] });
  const j = parseJson(t);
  return (j?.fresh || []).filter((f) => f && f.value && /^https?:\/\//.test(f.url || '') && !/statista\.com/i.test(f.url)).slice(0, 8);
}

const LANG = { en: { name: 'English', style: 'Sharp, plain, specific English. Short sentences. No hype, no filler. Never use em dashes.' }, de: { name: 'German', style: 'Natürliches, präzises Deutsch, direkt für Coaches und Studiobetreiber:innen geschrieben, keine Übersetzung aus dem Englischen. Du-Ansprache. Keine Gedankenstriche (—).' } };
const SYSTEM = 'You are Sqwod Intelligence, the data desk of sqwod.life: strategic intelligence for fitness industry professionals. Readers, in priority order: studio, gym and brand founders and operators; coaches and personal trainers; investors, buyers and the companies that sell into the industry. Positioning: on the practitioner\'s side, a builder not an observer. Every claim is sourced. You never invent, round differently, extrapolate or combine numbers into new ones the reader cannot verify.';

async function structure(s, fresh, lang, enRef) {
  const L = LANG[lang];
  const prompt = `${lang === 'de' ? 'Schreibe auf Deutsch.' : 'Write in English.'} ${L.style}
${enRef ? `This is the GERMAN edition of a report whose English structure is below. Keep the same chart picks (same indices), the same figures and the same benchmark numbers, but write every label, title and sentence natively in German (not a translation).\nEnglish reference: ${JSON.stringify(enRef).slice(0, 6000)}\n` : ''}
DATASET (Statista, "${s.study}", study ${s.studyId}). These are the ONLY Statista numbers you may use. Each chart has an index in [brackets]:
${datasetText(s)}

NEWER PUBLIC SOURCES (each verified with a URL; cite them by source name):
${fresh.length ? fresh.map((f, i) => `(F${i}) ${f.label}: ${f.value} (${f.period}) — ${f.source} — ${f.url}${f.note ? ' — ' + f.note : ''}`).join('\n') : '(none found this month)'}

Design a FLAGSHIP report (3,000+ words will be written next) for fitness industry professionals: founders and operators first, then coaches, then investors and brands. Respond ONLY as minified JSON:
{
 "title": "<= 70 chars, a real headline with a number in it",
 "description": "2 sentences: the finding + why an operator should care. Ends with 'A living Sqwod Intelligence report.' (DE: 'Ein lebender Sqwod-Intelligence-Report.')",
 "pillar": "one of build|gear|signal|move (build=studio business, gear=products/equipment/wearables, signal=market data, move=training)",
 "conversion": "one of pods|sqwod-os|products|sqwod-ai|verified|list-growth",
 "takeaways": ["5 to 6 one-liners, each with exactly ONE figure from the data above"],
 "figures": [{"label":"what it measures","value":"figure with unit, verbatim","note":"period/context","source":"source name","chart":<index or null>,"fresh":<F-index or null>}],   // 6 to 8, the scoreboard
 "charts": [{"idx":<chart index>,"label":"short reader-facing title in ${L.name}","unit":"short unit e.g. $bn, Mio. €, %","note":"optional one-line reading of the chart"}],   // 8 to 10 distinct indices, time-series first, the single most important one FIRST
 "benchmark": null OR {"label":"what the reader enters","unit":"%","prompt":"one-line prompt","betterIsHigh":true,"min":0,"max":100,"median":<a value from a categorical chart>,"medianLabel":"what that median is","bands":[{"to":<n>,"label":"..."},{"to":<n>,"label":"..."},{"to":<n>,"label":"..."}],"source":"chart source","chart":<index>}   // ONLY if a categorical chart compares countries/segments on one metric a reader can self-report; bands must sit inside the real spread of that chart's values
 "playbook": [{"move":"specific operator action","why":"why it follows from the data, naming the figure"}],   // 5 to 6
 "outline": [{"h2":"section heading","points":["3-4 bullet points of what the section argues, each naming the figures it will use"]}],   // 7 to 9 sections: first = the hook; second-to-last = "What investors and brands should read into this" (capital flows, who wins, model risk, what a buyer or sponsor should do), written for investors, brand operators and companies selling into the industry; last = what operators and coaches should do
 "hero": {"stat":"the single headline figure","statLabel":"6 words max"},
 "tags": ["3 to 5 lowercase tags"]
}`;
  return parseJson(await claude(prompt, { maxTokens: 6000, system: SYSTEM }));
}

async function body(s, fresh, lang, st) {
  const L = LANG[lang];
  const allowed = st.charts.map((c) => `[${c.idx}] ${s.charts[c.idx]?.title}`).join('\n');
  const prompt = `${lang === 'de' ? 'Schreibe auf Deutsch.' : 'Write in English.'} ${L.style}
Write the full body of the flagship report "${st.title}" for fitness industry professionals: studio, gym and brand founders and operators first, then coaches and trainers, then investors, buyers and companies selling into the industry. Minimum 3,000 words. Markdown. Use exactly these sections, in order, as '## ' headings:
${st.outline.map((o, i) => `${i + 1}. ${o.h2}\n   ${o.points.join('\n   ')}`).join('\n')}

DATA you may cite (nothing else; quote values exactly as given, you may compute a percentage change or multiple between two values of the SAME chart and must show both endpoints when you do):
${datasetText(s)}
${fresh.length ? '\nNEWER SOURCES:\n' + fresh.map((f, i) => `(F${i}) ${f.label}: ${f.value} (${f.period}) — ${f.source}`).join('\n') : ''}

The page already shows these charts above the text, so refer to them as "the chart" / "Chart N" (N = position in this list, starting at 1) instead of repeating every row:
${st.charts.map((c, i) => `Chart ${i + 1}: ${c.label}`).join('\n')}

Rules: bold the key figure in each paragraph the first time it appears; name the source in brackets after each figure, e.g. (SFIA via Statista) or (${fresh[0]?.source || 'source name'}); no bullet lists longer than 5 items; no tables (the charts carry the data); no intro before the first ## heading; close the final section with 3 concrete actions the reader can take this month. ${lang === 'de' ? 'Zahlenformat deutsch (28,5 Mio., 7 %, 1,6 Mrd. €).' : ''}
Output ONLY the markdown body.`;
  let t = await claude(prompt, { maxTokens: 12000, system: SYSTEM });
  if (words(t) < 2600) { // one expansion pass
    const more = await claude(`${lang === 'de' ? 'Erweitere' : 'Expand'} this report body to at least 3,000 words without adding any number that is not already in it or in the data below. Deepen the operator analysis, add worked examples and keep every heading. Output ONLY the full revised markdown.\n\nDATA:\n${datasetText(s)}\n\nBODY:\n${t}`, { maxTokens: 12000, system: SYSTEM });
    if (words(more) > words(t)) t = more;
  }
  return t.replace(/—/g, ', ').trim();
}

// ---------- 3. validation ----------
function allowedNumbers(s, fresh, st) {
  const set = new Set(); const add = (n) => { if (Number.isFinite(n)) { set.add(+n.toFixed(2)); set.add(Math.round(n)); set.add(+n.toFixed(1)); } };
  for (const c of s.charts) {
    for (const x of c.series) for (const v of x.values) if (v != null) { add(v); add(v * 1000); add(v / 1000); add(v * 100); }
    for (const x of c.series) { const vals = x.values.filter((v) => v != null); // pairwise % change & multiples, same chart
      for (let i = 0; i < vals.length; i++) for (let k = 0; k < vals.length; k++) if (i !== k && vals[k]) { add(((vals[i] - vals[k]) / Math.abs(vals[k])) * 100); add(vals[i] / vals[k]); add(vals[i] - vals[k]); } }
    for (const cat of c.categories) { const n = parseFloat(cat); if (Number.isFinite(n)) add(n); }
  }
  for (const f of fresh) for (const m of String(f.value).matchAll(/\d+(?:[.,]\d+)?/g)) add(parseFloat(m[0].replace(',', '.')));
  for (const f of st.figures || []) for (const m of String(f.value).matchAll(/\d+(?:[.,]\d+)?/g)) add(parseFloat(m[0].replace(',', '.')));
  for (let y = 1990; y <= 2035; y++) add(y);
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 25, 30, 50, 100].forEach(add);
  return set;
}
function strayNumbers(text, allowed) {
  const out = new Set();
  for (const m of text.replace(/\d\.\d{3}/g, (x) => x.replace('.', '')).matchAll(/(?<![\w/-])(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d+))?/g)) {
    const raw = m[0]; let n = parseFloat(raw.replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2').replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    const ok = allowed.has(+n.toFixed(2)) || allowed.has(Math.round(n)) || allowed.has(+n.toFixed(1));
    if (!ok) out.add(raw);
  }
  return [...out];
}
const DE_WORDS = /\b(und|der|die|das|nicht|für|ist|sind|mit|auf|eine|einen|einem|auch|wird|werden|bei|nach|aus|oder|wie|dass|sich|noch|mehr|nur|zu|im|von|dem|des|als|wenn|aber)\b/gi;
const germanRatio = (t) => ((t.match(DE_WORDS) || []).length / Math.max(1, words(t)));
function isGerman(t, enBody) { if (germanRatio(t) < 0.06) return false; if (enBody && t.slice(0, 300) === enBody.slice(0, 300)) return false; return true; }

// ---------- 4. file emission ----------
function chartYaml(s, st, lang) {
  const lines = ['charts:'];
  for (const c of st.charts) {
    const src = s.charts[c.idx]; if (!src) continue;
    lines.push(`  - label: ${q(c.label)}`, `    unit: ${q(c.unit || src.unit)}`, `    kind: ${src.kind}`, `    categories: ${q(src.categories.map(String))}`, '    series:');
    for (const x of src.series) lines.push(`      - { name: ${q(x.name || '')}, points: ${JSON.stringify(x.values)} }`);
    if (c.note) lines.push(`    note: ${q(c.note)}`);
    lines.push(`    source: ${q((src.source ? src.source + ' via Statista' : 'Statista'))}`, `    url: ${q(`https://www.statista.com/study/${s.studyId}/`)}`);
  }
  return lines;
}
function benchmarkYaml(b) {
  if (!b || !Array.isArray(b.bands) || b.bands.length < 2 || !Number.isFinite(+b.median)) return [];
  return ['benchmark:', `  label: ${q(b.label)}`, `  unit: ${q(b.unit || '%')}`, b.prompt ? `  prompt: ${q(b.prompt)}` : null, `  betterIsHigh: ${b.betterIsHigh === false ? 'false' : 'true'}`, `  min: ${+b.min || 0}`, `  max: ${+b.max || 100}`, `  median: ${+b.median}`, b.medianLabel ? `  medianLabel: ${q(b.medianLabel)}` : null, '  bands:', ...b.bands.map((x) => `    - { to: ${+x.to}, label: ${q(x.label)} }`), b.source ? `  source: ${q(b.source)}` : null].filter(Boolean);
}
function frontmatter(slug, lang, s, st, fresh, bodyMd) {
  const first = s.charts[st.charts[0]?.idx];
  const series = first && first.kind === 'timeseries' ? ['series:', `  label: ${q(st.charts[0].label)}`, `  unit: ${q(st.charts[0].unit || first.unit)}`, `  points: ${JSON.stringify(first.series[0].values.map((v) => v ?? 0))}`, `  years: ${q(first.categories.map(String))}`] : [];
  const sources = [`  - { label: ${q(`Statista: ${s.study} (study ${s.studyId})`)}, url: ${q(`https://www.statista.com/study/${s.studyId}/`)} }`, ...fresh.map((f) => `  - { label: ${q(`${f.source}: ${f.label} (${f.period})`)}, url: ${q(f.url)} }`)];
  const figures = (st.figures || []).slice(0, 8).map((f) => { const fr = f.fresh != null ? fresh[f.fresh] : null; return `  - { label: ${q(f.label)}, value: ${q(f.value)}, note: ${q(f.note || '')}, source: ${q(fr ? fr.source : (f.source || 'Statista'))}, url: ${q(fr ? fr.url : `https://www.statista.com/study/${s.studyId}/`)} }`; });
  const note = lang === 'de'
    ? `Erstveröffentlichung. Zahlen aus den Chartdaten der Statista-Studie ${s.studyId}${fresh.length ? ` plus ${fresh.length} neuere öffentliche Quellen` : ''}. Vor Veröffentlichung geprüft.`
    : `First publish. Figures from the chart data of Statista study ${s.studyId}${fresh.length ? ` plus ${fresh.length} newer public sources` : ''}. Reviewed before publishing.`;
  return [
    '---', `urlSlug: ${slug}`, `lang: ${lang}`, `counterpart: ${slug}`, `title: ${q(st.title)}`, `description: ${q(st.description)}`,
    `pillar: ${['build', 'gear', 'signal', 'move'].includes(st.pillar) ? st.pillar : 'signal'}`, 'type: market-data', 'format: report',
    `conversion: ${['pods', 'sqwod-os', 'products', 'sqwod-ai', 'verified', 'list-growth'].includes(st.conversion) ? st.conversion : 'sqwod-os'}`,
    `publishedAt: ${today}`, `updatedAt: ${today}`, `asOf: ${q(today)}`, 'author: "Sqwod Intelligence"',
    'draft: true   # FLAGSHIP DRAFT — goes live only via intelligence-flagship.mjs --apply after email approval',
    'gated: true', 'takeaways:', ...(st.takeaways || []).map((t) => `  - ${q(t)}`), 'figures:', ...figures, ...series, ...chartYaml(s, st, lang), ...benchmarkYaml(st.benchmark),
    'playbook:', ...(st.playbook || []).map((p) => `  - { move: ${q(p.move)}, why: ${q(p.why)} }`), 'sources:', ...sources,
    'changelog:', `  - { date: ${q(today)}, note: ${q(note)} }`, 'hero:', '  kind: bars', `  stat: ${q(st.hero?.stat || '')}`, `  statLabel: ${q(st.hero?.statLabel || '')}`,
    `tags: ${q((st.tags || []).slice(0, 5))}`, '---', '', bodyMd, '',
    lang === 'de' ? `*Ein lebender Sqwod-Intelligence-Report. Alle Statista-Zahlen stammen aus den Chartdaten der Studie „${s.study}“ (${s.studyId}) und nennen die Originalquelle; neuere Zahlen sind einzeln verlinkt. Wir aktualisieren, sobald neue Daten vorliegen; siehe Update-Log.*`
      : `*A living Sqwod Intelligence report. Every Statista figure comes from the chart data of the "${s.study}" study (${s.studyId}) and cites the original source; newer figures are linked individually. We refresh as new data lands; see the update log.*`, '',
  ].join('\n');
}

// ---------- 5. approval email ----------
function signedLink(id, action, ttlDays = 30) {
  const exp = Math.floor(Date.parse(today) / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function email(item) {
  if (process.env.REVIEW_DIGEST === '1') { console.log('→ goes into the morning review email instead of its own email'); return; }
  const raw = (f) => `https://github.com/${REPO}/blob/main/automation/intel-drafts/${f}`;
  const btn = (href, label, danger) => `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;margin:4px 6px 4px 0;${danger ? 'border:1px solid #999;color:#333' : 'background:#111;color:#fff'}">${label}</a>`;
  const warn = item.warnings.length ? `<p style="color:#b45309"><b>Check these before approving:</b></p><ul>${item.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p style="color:#15803d">No stray numbers found. Every figure traces to the chart bank or a linked source.</p>';
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#111">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Intelligence · flagship draft</p>
<h2 style="margin:4px 0 10px">${esc(item.title)}</h2>
<p style="color:#444">${esc(item.description)}</p>
<p><b>Source:</b> Statista study ${esc(item.studyId)} (${esc(item.study)})${item.freshCount ? ` + ${item.freshCount} newer linked sources` : ''}<br>
<b>EN:</b> ${item.wordsEn} words · <b>DE:</b> ${item.wordsDe} words · <b>${item.chartCount} charts</b>${item.hasBenchmark ? ' · benchmark widget' : ''}</p>
<p><b>Key takeaways</b></p><ul>${item.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
${warn}
<p>Read the drafts: <a href="${raw(item.slug + '.en.md')}">English</a> · <a href="${raw(item.slug + '.de.md')}">Deutsch</a></p>
<p style="margin-top:18px">${btn(item.approve, 'Approve & publish')}${btn(item.reject, 'Reject (archive)', true)}</p>
<p style="font-size:12px;color:#777">Approve = both languages go live on the next apply run (within 4 hours), dated that day. Reject = moved to intel-drafts/_rejected, the study stays available for a future month. Links valid 30 days.</p></div>`;
  if (!RESEND || !REVIEWER) { console.log(`[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'}\n  approve: ${item.approve}\n  reject:  ${item.reject}`); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: REVIEWER, subject: `📊 Flagship draft to approve: ${item.title}`, html }) });
  console.log(r.ok ? `✓ approval email sent to ${REVIEWER}` : `! email failed (${r.status}): ${(await r.text()).slice(0, 160)}`);
}

// ---------- 6. apply approved / archive rejected ----------
function apply() {
  if (!existsSync(QUEUE)) { console.log('No queue.'); return; }
  const log = readLog(); let n = 0;
  for (const f of readdirSync(QUEUE).filter((f) => f.startsWith('flagship-') && f.endsWith('.json'))) {
    const path = join(QUEUE, f); const p = JSON.parse(readFileSync(path, 'utf8'));
    const en = join(DRAFTS, `${p.slug}.en.md`), de = join(DRAFTS, `${p.slug}.de.md`);
    if (p.status === 'approved') {
      if (!existsSync(en) || !existsSync(de)) { console.log(`! ${p.slug}: draft files missing, cannot publish`); continue; }
      for (const [src, lang] of [[en, 'en'], [de, 'de']]) {
        let t = readFileSync(src, 'utf8');
        t = t.replace(/^draft: true.*\n/m, '').replace(/^publishedAt: .*$/m, `publishedAt: ${today}`).replace(/^updatedAt: .*$/m, `updatedAt: ${today}`).replace(/^asOf: .*$/m, `asOf: ${q(today)}`)
          .replace(/^(changelog:\n  - \{ date: )"[^"]*"/m, `$1${q(today)}`);
        writeFileSync(join(ARTICLES, `${p.slug}.${lang}.md`), t);
        mkdirSync(join(DRAFTS, '_published'), { recursive: true }); renameSync(src, join(DRAFTS, '_published', basename(src)));
      }
      log.used[p.studyId] = today; p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2)); n++;
      console.log(`✓ published ${p.slug} (EN + DE)`);
    } else if (p.status === 'rejected' && existsSync(en)) {
      mkdirSync(join(DRAFTS, '_rejected'), { recursive: true });
      for (const src of [en, de]) if (existsSync(src)) renameSync(src, join(DRAFTS, '_rejected', basename(src)));
      p.status = 'archived'; writeFileSync(path, JSON.stringify(p, null, 2)); n++;
      console.log(`· archived rejected draft ${p.slug}`);
    }
  }
  writeFileSync(LOG, JSON.stringify(log, null, 2));
  console.log(n ? `${n} flagship item(s) processed` : 'Nothing approved or rejected.');
}

// ---------- main ----------
function selftest() {
  // Emit a mock EN+DE draft from REAL chart data (no model) so the frontmatter can be build-tested.
  const { top } = pick();
  const ts = top.charts.map((c, idx) => ({ c, idx })).filter((x) => x.c.kind === 'timeseries').slice(0, 8);
  const cat = top.charts.map((c, idx) => ({ c, idx })).find((x) => x.c.kind === 'categorical' && x.c.series[0].values.filter((v) => v != null).length >= 4);
  const bench = cat ? (() => { const v = cat.c.series[0].values.filter((n) => n != null).sort((a, b) => a - b); const med = v[Math.floor(v.length / 2)]; return { label: cat.c.title.slice(0, 40), unit: '', prompt: 'Your number', betterIsHigh: true, min: 0, max: Math.ceil(v[v.length - 1] * 1.1), median: med, medianLabel: 'median', bands: [{ to: v[0], label: 'low' }, { to: med, label: 'mid' }, { to: v[v.length - 1], label: 'high' }], source: cat.c.source, chart: cat.idx }; })() : null;
  const st = (lang) => ({ title: `${lang.toUpperCase()} selftest: ${top.study}`, description: 'Selftest description. A living Sqwod Intelligence report.', pillar: 'signal', conversion: 'sqwod-os',
    takeaways: ['t1', 't2'], figures: ts.slice(0, 3).map((x) => ({ label: x.c.title.slice(0, 30), value: String(x.c.series[0].values.at(-1)), note: String(x.c.categories.at(-1)), source: x.c.source, chart: x.idx })),
    charts: ts.map((x) => ({ idx: x.idx, label: x.c.title.slice(0, 50), unit: x.c.unit, note: '' })), benchmark: bench, playbook: [{ move: 'm', why: 'w' }], outline: [], hero: { stat: '1', statLabel: 'x' }, tags: ['selftest'] });
  const dir = join(DRAFTS, '_selftest'); mkdirSync(dir, { recursive: true });
  for (const lang of ['en', 'de']) writeFileSync(join(dir, `zz-selftest.${lang}.md`), frontmatter('zz-selftest', lang, top, st(lang), [{ label: 'f', value: '12.3%', period: '2026', source: 'Src', url: 'https://example.com/x' }], '## A\n\nBody.'));
  console.log(`selftest → automation/intel-drafts/_selftest/zz-selftest.{en,de}.md (${ts.length} charts${bench ? ', benchmark' : ''})`);
}

async function run() {
  if (args.apply) return apply();
  if (args.selftest) return selftest();
  const { top, scored } = pick();
  if (!top || top.score < -50) { console.log('· no eligible study (all recently used or off-audience)'); return; }
  console.log(`Pick: study ${top.studyId} "${top.study}" — score ${top.score.toFixed(1)} · ${top.ts} time-series + ${top.cat} categorical · data to ${top.maxYear} · covered-overlap ${top.covered} · news ${top.newsHit}`);
  console.log('Runners-up: ' + scored.slice(1, 5).map((s) => `${s.studyId} (${s.score.toFixed(0)})`).join(', '));
  if (args.dry || !apiKey) { console.log(apiKey ? '· dry run' : '· no ANTHROPIC_API_KEY — stopping after the pick'); return; }

  console.log('→ searching newer public sources…');
  const fresh = await freshSources(top);
  console.log(`  ${fresh.length} fresh figure(s) with URLs`);

  console.log('→ EN structure…'); const stEn = await structure(top, fresh, 'en', null);
  if (!stEn?.title || !Array.isArray(stEn.charts) || stEn.charts.length < 6) throw new Error('EN structure failed or too few charts');
  stEn.charts = stEn.charts.filter((c, i, a) => top.charts[c.idx] && a.findIndex((x) => x.idx === c.idx) === i).slice(0, 10);
  console.log(`  "${stEn.title}" · ${stEn.charts.length} charts · benchmark ${stEn.benchmark ? 'yes' : 'no'}`);
  console.log('→ EN body…'); const bodyEn = await body(top, fresh, 'en', stEn);
  if (words(bodyEn) < 2400) throw new Error(`EN body too short (${words(bodyEn)} words)`);

  console.log('→ DE structure…'); const stDe = await structure(top, fresh, 'de', stEn);
  if (!stDe?.title) throw new Error('DE structure failed');
  stDe.charts = stEn.charts.map((c, i) => ({ ...c, label: stDe.charts?.[i]?.label || c.label, unit: stDe.charts?.[i]?.unit || c.unit, note: stDe.charts?.[i]?.note || '' }));
  stDe.benchmark = stEn.benchmark ? { ...stEn.benchmark, ...(stDe.benchmark || {}), median: stEn.benchmark.median, bands: stEn.benchmark.bands.map((b, i) => ({ to: b.to, label: stDe.benchmark?.bands?.[i]?.label || b.label })) } : null;
  stDe.pillar = stEn.pillar; stDe.conversion = stEn.conversion;
  console.log('→ DE body…'); let bodyDe = await body(top, fresh, 'de', stDe);
  for (let k = 0; k < 2 && !isGerman(bodyDe, bodyEn); k++) { console.log('  ! DE body failed the German check, retrying'); bodyDe = await body(top, fresh, 'de', stDe); }
  if (!isGerman(bodyDe, bodyEn)) throw new Error('DE body is not German — aborting (no English fallback by design)');
  if (words(bodyDe) < 2200) throw new Error(`DE body too short (${words(bodyDe)} words)`);

  const allowed = allowedNumbers(top, fresh, stEn);
  const strays = [...new Set([...strayNumbers(bodyEn, allowed), ...strayNumbers(bodyDe, allowed)])].slice(0, 20);
  const warnings = strays.length ? [`${strays.length} number(s) in the text are not in the dataset or linked sources (could be derived in a way I could not match): ${strays.join(', ')}`] : [];
  if (!fresh.length) warnings.push('No newer public sources were found; the report rests on Statista only.');
  if (strays.length > 12) warnings.unshift('MANY unmatched numbers: read the body carefully before approving.');

  const slug = slugify(stEn.title);
  if (existsSync(join(ARTICLES, `${slug}.en.md`)) || existsSync(join(DRAFTS, `${slug}.en.md`))) throw new Error(`slug ${slug} already exists`);
  mkdirSync(DRAFTS, { recursive: true }); mkdirSync(QUEUE, { recursive: true });
  writeFileSync(join(DRAFTS, `${slug}.en.md`), frontmatter(slug, 'en', top, stEn, fresh, bodyEn));
  writeFileSync(join(DRAFTS, `${slug}.de.md`), frontmatter(slug, 'de', top, stDe, fresh, bodyDe));

  const id = `flagship-${slug}`;
  const item = { kind: 'flagship', id, slug, title: stEn.title, titleDe: stDe.title, description: stEn.description, studyId: top.studyId, study: top.study, status: 'pending', createdAt: today,
    wordsEn: words(bodyEn), wordsDe: words(bodyDe), chartCount: stEn.charts.length, hasBenchmark: !!stDe.benchmark, freshCount: fresh.length, takeaways: stEn.takeaways || [], warnings,
    approve: signedLink(id, 'approve'), reject: signedLink(id, 'reject'), label: stEn.title, report: stEn.title };
  writeFileSync(join(QUEUE, `${id}.json`), JSON.stringify(item, null, 2));
  console.log(`\n✓ DRAFT → automation/intel-drafts/${slug}.{en,de}.md  (EN ${item.wordsEn} w · DE ${item.wordsDe} w · ${item.chartCount} charts)`);
  await email(item);
  if (process.env.GITHUB_STEP_SUMMARY) try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## 📊 Flagship drafted: ${stEn.title}\nStudy ${top.studyId} · EN ${item.wordsEn} words · DE ${item.wordsDe} words · ${item.chartCount} charts · ${fresh.length} fresh sources\n${warnings.map((w) => `- ⚠️ ${w}`).join('\n')}\n`, { flag: 'a' }); } catch {}
}
run().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
