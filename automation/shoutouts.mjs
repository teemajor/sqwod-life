#!/usr/bin/env node
/**
 * Sqwod "You made the news" clips: after each Daily, find the companies the episode
 * names, cut the 20-45 second passage about each one straight out of the episode
 * audio, draft a short note + a LinkedIn post, and email Tee one Send / Skip card
 * per company. A Send tap (pr-intake Worker, /intel route) flips the queue file to
 * "approved"; the next --send run emails the clip to the company.
 *
 *   node automation/shoutouts.mjs --date=2026-10-28            # extract + clip + queue (dry-run without keys)
 *   node automation/shoutouts.mjs --date=2026-10-28 --email    # same, then email Tee the review cards
 *   node automation/shoutouts.mjs --send                       # send every approved, unsent shout-out
 *   node automation/shoutouts.mjs --prune                      # delete clips older than CLIP_KEEP_DAYS
 *
 * Inputs:  site/src/content/daily/<date>.{en,de}.md   (the issue: items + audioScript)
 *          site/public/audio/<date>-<lang>.mp3        (the episode)
 *          automation/audio-marks/<date>-<lang>.json  (paragraph timings, written by audio.mjs)
 * Outputs: site/public/clips/<date>/<slug>-<lang>.mp3 (public, linkable from the note)
 *          automation/intel-queue/shoutout-<date>-<slug>.json (status: pending → approved → sent)
 *
 * Env: ANTHROPIC_API_KEY (company extraction + contact lookup with web search; without it
 *      the script still cuts clips for companies it can spot by the item's `source` field),
 *      RESEND_API_KEY + INTEL_REVIEWER_EMAIL + INTEL_SIGNING_SECRET + INTEL_WORKER_URL (--email),
 *      SHOUTOUT_FROM (sender for the outreach note, e.g. "Tee Major, Sqwod Daily <podcast@sqwod.life>"),
 *      SHOUTOUT_REPLY_TO (defaults to tee@teemajor.com), SITE_URL.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DAILY = join(ROOT, 'site', 'src', 'content', 'daily');
const AUDIO = join(ROOT, 'site', 'public', 'audio');
const CLIPS = join(ROOT, 'site', 'public', 'clips');
const MARKS = join(__dirname, 'audio-marks');
const QUEUE = join(__dirname, 'intel-queue');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = new Date().toISOString().slice(0, 10);
const date = typeof args.date === 'string' ? args.date : today;
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');
const apiKey = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const SEARCH_TOOL = process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209';
const RESEND = process.env.RESEND_API_KEY || '';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';
const REVIEW_FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');
const OUT_FROM = process.env.SHOUTOUT_FROM || 'Tee Major, Sqwod Daily <podcast@sqwod.life>';
const OUT_REPLY = process.env.SHOUTOUT_REPLY_TO || 'tee@teemajor.com';
const MAX_COMPANIES = Number(args.max || 3);
const CLIP_MAX_S = 45, CLIP_PAD_S = 0.25, CLIP_KEEP_DAYS = Number(process.env.CLIP_KEEP_DAYS || 90);

// ---------- frontmatter (machine-written by cascade.mjs: one key per line, JSON-quoted strings) ----------
const fmLines = (text) => { const m = text.match(/^---\n([\s\S]*?)\n---/); return m ? m[1].split('\n') : []; };
const val = (s) => { s = s.trim(); if (s.startsWith('"')) { try { return JSON.parse(s); } catch { return s.slice(1, -1); } } return s; };
const scalar = (lines, key) => { const l = lines.find((x) => x.startsWith(key + ':')); return l ? val(l.slice(key.length + 1)) : ''; };
function list(lines, key) {
  const i = lines.findIndex((x) => x === key + ':');
  if (i < 0) return [];
  const out = []; let cur = null;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (/^\S/.test(l)) break;
    let m = l.match(/^  - (\w+): (.*)$/);
    if (m) { cur = { [m[1]]: val(m[2]) }; out.push(cur); continue; }
    m = l.match(/^    (\w+): (.*)$/);
    if (m && cur) cur[m[1]] = val(m[2]);
  }
  return out;
}
function readIssue(lang) {
  const f = join(DAILY, `${date}.${lang}.md`);
  if (!existsSync(f)) return null;
  const lines = fmLines(readFileSync(f, 'utf8'));
  return { lang, status: scalar(lines, 'status'), summary: scalar(lines, 'summary'), script: scalar(lines, 'audioScript'), items: list(lines, 'items') };
}
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'company';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

// ---------- 1. which companies does today's episode name? ----------
async function claude(prompt, { maxTokens = 2500, tools = null } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
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

// Without a key: the subject of each item is usually its `source` only when the source IS
// the company (press release). Otherwise we can't tell a company from a publisher, so
// we fall back to the first capitalised phrase of the headline. Good enough for a dry run.
function guessCompanies(iss) {
  return iss.items.slice(0, MAX_COMPANIES).map((it, i) => {
    const m = String(it.headline || '').match(/^((?:[A-Z][\w&'.-]*\s?){1,3})/);
    return { name: (m ? m[1] : it.source || '').trim().replace(/\s(launches|raises|opens|posts|reports|moves|expands|acquires|signs)$/i, ''), item: i, lang: iss.lang, domain: '', to: '', linkedin: '', contactSource: '', why: it.headline };
  }).filter((c) => c.name.length > 2);
}

async function extractCompanies(en, de) {
  if (!apiKey) { console.log('No ANTHROPIC_API_KEY: guessing companies from headlines (dry-run quality).'); return guessCompanies(en); }
  const stories = en.items.map((it, i) => `${i}. ${it.headline} | ${it.dek} | source: ${it.source} ${it.readMore || ''}`).join('\n');
  const prompt = `You run outreach for Sqwod Daily, a weekday podcast about the business of fitness and wellness. Today's episode covers these stories (index. headline | summary | source):
${stories}

Pick up to ${MAX_COMPANIES} COMPANIES or ORGANISATIONS that are the subject of a story and would plausibly like to hear "you were on Sqwod Daily today" (operators, brands, device makers, associations, studios). Skip publishers/news outlets, governments, charities as recipients of money, and individuals. Prefer stories where the company is clearly named.

For each one, search the web for (a) the company's main website domain, (b) a press/PR/media or general contact EMAIL ADDRESS published on its own site or in its press releases (press@, pr@, media@, hello@, info@ ... on the company's own domain only; never a journalist's or a personal address), and (c) its LinkedIn company page URL. If you cannot find an email on the company's own domain, leave "to" empty. Never invent an address.

Decide the note language: "de" for companies based in Germany, Austria or Switzerland, else "en".

Answer ONLY with minified JSON:
{"companies":[{"name":"clean company name as the episode says it","item":<story index>,"domain":"example.com","to":"press@example.com or empty","contactSource":"URL where the email was found, or empty","linkedin":"https://www.linkedin.com/company/... or empty","lang":"en|de","why":"8 words on what the story says about them"}]}`;
  const j = parseJson(await claude(prompt, { maxTokens: 2500, tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 12 }] }));
  const out = (j?.companies || []).filter((c) => c && c.name && Number.isInteger(c.item) && en.items[c.item]).slice(0, MAX_COMPANIES);
  for (const c of out) {
    c.lang = c.lang === 'de' && de ? 'de' : 'en';
    c.to = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.to || '') && (!c.domain || (c.to.split('@')[1] || '').endsWith(c.domain.replace(/^www\./, ''))) ? c.to.toLowerCase() : '';
    c.linkedin = /^https:\/\/(www\.)?linkedin\.com\//.test(c.linkedin || '') ? c.linkedin : '';
  }
  return out;
}

// ---------- 2. cut the passage about the company out of the episode ----------
function findSpan(marks, script, name) {
  const needles = [name, name.split(/\s+/)[0]].map((n) => n.toLowerCase()).filter((n) => n.length > 2);
  const hit = (t) => needles.some((n) => t.toLowerCase().includes(n));
  if (marks?.paras?.length) {
    const idx = marks.paras.map((p, i) => (hit(p.text) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    // contiguous run from the first hit; stop when the clip would pass CLIP_MAX_S
    let a = idx[0], b = idx[0];
    while (b + 1 < marks.paras.length && idx.includes(b + 1) && marks.paras[b + 1].end - marks.paras[a].start <= CLIP_MAX_S) b++;
    const start = Math.max(0, marks.paras[a].start - CLIP_PAD_S);
    const end = Math.min(marks.paras[b].end + CLIP_PAD_S, start + CLIP_MAX_S);
    return { start, end, approx: false, text: marks.paras.slice(a, b + 1).map((p) => p.text).join(' ') };
  }
  // No marks (episode made before timestamps shipped): estimate by word position, ±3s.
  if (!script) return null;
  const paras = script.split(/\n+/).filter(Boolean);
  const words = paras.map((p) => p.split(/\s+/).length), total = words.reduce((a, b) => a + b, 0);
  const i = paras.findIndex(hit);
  if (i < 0) return null;
  return { start: null, end: null, approx: true, para: i, before: words.slice(0, i).reduce((a, b) => a + b, 0), len: words[i], total, text: paras[i] };
}
function mp3Duration(file) {
  try { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })); } catch { return 0; }
}
function cutClip(lang, span, outFile) {
  const src = join(AUDIO, `${date}-${lang}.mp3`);
  if (!existsSync(src)) return null;
  let { start, end } = span;
  if (span.approx) {
    const dur = mp3Duration(src) || 300;
    start = Math.max(0, (span.before / span.total) * dur - 3);
    end = Math.min(dur, ((span.before + span.len) / span.total) * dur + 3);
    if (end - start > CLIP_MAX_S) end = start + CLIP_MAX_S;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', src, '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', outFile]);
  } catch (e) { console.error(`  ! ffmpeg failed: ${e.message.slice(0, 160)}`); return null; }
  return { start: +start.toFixed(2), end: +end.toFixed(2), seconds: +(end - start).toFixed(1) };
}

// ---------- 3. the note (short, honest, no ask beyond a share) ----------
function draftNote(c, iss, clipUrl, episodeUrl) {
  const story = iss.items[c.item] || {};
  if (c.lang === 'de') {
    return {
      subject: `${c.name} war heute im Sqwod Daily`,
      text: `Hallo ${c.name}-Team,

ihr wart heute Thema im Sqwod Daily, unserem werktäglichen Podcast zum Business von Fitness und Wellness: ${story.headline}.

Hier ist der Ausschnitt über euch (${clipUrl.endsWith('.mp3') ? 'MP3, unter einer Minute' : 'Audio'}):
${clipUrl}

Die ganze Folge mit Quellenangabe:
${episodeUrl}

Teilt ihn gern, wo ihr wollt, Credit an Sqwod Daily reicht. Wenn ihr Fragen zur Berichterstattung habt oder eine Korrektur, antwortet einfach auf diese Mail.

Beste Grüße
Tee Major
Sqwod Daily, sqwod.life`,
      linkedin: `${c.name} war heute im Sqwod Daily.\n\n${story.headline}.\n\n${(story.dek || '').split('. ')[0]}.\n\nFolge und Quelle: ${episodeUrl}\n\n#Fitnessbranche #Sqwod #${slug(c.name).replace(/-/g, '')}`,
    };
  }
  return {
    subject: `${c.name} was on Sqwod Daily today`,
    text: `Hi ${c.name} team,

You were on Sqwod Daily today, our weekday podcast on the business of fitness and wellness: ${story.headline}.

Here is the clip about you (${clipUrl.endsWith('.mp3') ? 'MP3, under a minute' : 'audio'}):
${clipUrl}

The full episode, with the source we cited:
${episodeUrl}

Share it wherever you like, a credit to Sqwod Daily is all we ask. If anything in the piece needs a correction, just reply to this email.

Best,
Tee Major
Sqwod Daily, sqwod.life`,
    linkedin: `${c.name} was on Sqwod Daily today.\n\n${story.headline}.\n\n${(story.dek || '').split('. ')[0]}.\n\nEpisode and source: ${episodeUrl}\n\n#FitnessIndustry #Sqwod #${slug(c.name).replace(/-/g, '')}`,
  };
}

// ---------- 4. review email to Tee (Send / Skip, one tap) ----------
function signedLink(id, action, ttlDays = 14) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}
async function emailReview(queued) {
  if (!queued.length) { console.log('Nothing to review.'); return; }
  const btn = (href, label, quiet) => `<a href="${href}" style="display:inline-block;padding:9px 16px;border-radius:999px;font-weight:700;text-decoration:none;margin:4px 6px 0 0;${quiet ? 'border:1px solid #999;color:#333' : 'background:#111;color:#fff'}">${label}</a>`;
  const cards = queued.map((q) => `<div style="border-top:1px solid #ddd;padding:16px 0">
<b style="font-size:17px">${esc(q.company)}</b> <span style="color:#777">· ${esc(q.lang.toUpperCase())} · clip ${esc(q.clip.seconds)}s${q.clip.approx ? ' (approx. cut, no timestamps for this episode)' : ''}</span><br>
<span style="color:#555">${esc(q.why)}</span><br>
<a href="${esc(q.clipUrl)}" style="color:#111">▶ Play the clip</a> · <a href="${esc(q.episodeUrl)}" style="color:#111">Episode</a>${q.linkedin ? ` · <a href="${esc(q.linkedin)}" style="color:#111">Their LinkedIn</a>` : ''}<br>
<div style="margin:10px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#777">Note to ${q.to ? `<b style="color:#111">${esc(q.to)}</b> <span style="color:#999">(found at ${esc(q.contactSource || 'their site')})</span>` : '<b style="color:#b45309">no address found on their domain</b>'}</div>
<pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial;background:#f6f6f6;padding:12px;border-radius:8px;margin:0">${esc(q.subject)}\n\n${esc(q.text)}</pre>
<div style="margin:10px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#777">LinkedIn post (copy, add the clip as video or audiogram)</div>
<pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial;background:#f6f6f6;padding:12px;border-radius:8px;margin:0">${esc(q.linkedinPost)}</pre>
${q.to ? btn(signedLink(q.id, 'approve'), 'Send it') : btn(`mailto:?subject=${encodeURIComponent(q.subject)}&body=${encodeURIComponent(q.text)}`, 'Send it yourself (mailto)')}${btn(signedLink(q.id, 'reject'), 'Skip', true)}</div>`).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:680px;color:#111">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Daily · you made the news · ${esc(date)}</p>
<h2 style="margin:4px 0 6px">${queued.length} compan${queued.length > 1 ? 'ies' : 'y'} to tell</h2>
<p style="color:#444;margin:0 0 6px">"Send it" emails the note below from <b>${esc(OUT_FROM)}</b> within the hour (replies come to ${esc(OUT_REPLY)}). Skip does nothing. Links valid 14 days.</p>${cards}</div>`;
  if (!RESEND || !REVIEWER) { console.log(`[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'} ${queued.length} card(s)`); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: REVIEW_FROM, to: REVIEWER, subject: `🎙 ${queued.length} "you made the news" clip${queued.length > 1 ? 's' : ''} ready to send`, html }) });
  console.log(r.ok ? `Emailed ${queued.length} card(s) to review.` : `! email failed: ${r.status} ${await r.text()}`);
}

// ---------- 5. send approved ----------
async function sendApproved() {
  const files = existsSync(QUEUE) ? readdirSync(QUEUE).filter((f) => f.startsWith('shoutout-') && f.endsWith('.json')) : [];
  let sent = 0;
  for (const f of files) {
    const p = join(QUEUE, f), q = readJson(p, null);
    if (!q || q.status !== 'approved' || q.sentAt) continue;
    if (!q.to) { q.status = 'skipped'; q.note = 'approved but no recipient address'; writeFileSync(p, JSON.stringify(q, null, 2) + '\n'); continue; }
    if (!RESEND) { console.log(`[dry-run] would send "${q.subject}" to ${q.to}`); continue; }
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: OUT_FROM, to: q.to, reply_to: OUT_REPLY, subject: q.subject, text: q.text }) });
    if (r.ok) { q.status = 'sent'; q.sentAt = new Date().toISOString(); sent++; console.log(`✓ sent to ${q.to} (${q.company})`); }
    else { q.sendError = `${r.status} ${(await r.text()).slice(0, 160)}`; console.error(`! send failed for ${q.company}: ${q.sendError}`); }
    writeFileSync(p, JSON.stringify(q, null, 2) + '\n');
  }
  console.log(`${sent} shout-out(s) sent.`);
}

// ---------- 6. prune old clips (keeps the repo from growing forever) ----------
function prune() {
  if (!existsSync(CLIPS)) return;
  const cutoff = Date.now() - CLIP_KEEP_DAYS * 86400e3;
  let n = 0;
  for (const d of readdirSync(CLIPS)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (Date.parse(d) < cutoff) { rmSync(join(CLIPS, d), { recursive: true, force: true }); n++; }
  }
  console.log(`pruned ${n} clip folder(s) older than ${CLIP_KEEP_DAYS} days.`);
}

// ---------- main ----------
async function run() {
  if (args.send) return sendApproved();
  if (args.prune) return prune();
  const en = readIssue('en'), de = readIssue('de');
  if (!en) { console.log(`no issue for ${date}`); return; }
  if (en.status && en.status !== 'published') { console.log(`issue ${date} is ${en.status}; not published, skipping`); return; }
  const marks = { en: readJson(join(MARKS, `${date}-en.json`), null), de: readJson(join(MARKS, `${date}-de.json`), null) };
  const companies = await extractCompanies(en, de);
  if (!companies.length) { console.log('no companies found in today\'s episode'); return; }
  mkdirSync(QUEUE, { recursive: true });
  const queued = [];
  for (const c of companies) {
    const id = `shoutout-${date}-${slug(c.name)}`;
    const qf = join(QUEUE, `${id}.json`);
    if (existsSync(qf)) { console.log(`· ${c.name}: already queued`); continue; }
    const iss = c.lang === 'de' && de ? de : en;
    let lang = iss.lang;
    let span = findSpan(marks[lang], iss.script, c.name);
    if (!span && lang === 'de') { lang = 'en'; span = findSpan(marks.en, en.script, c.name); }
    if (!span) { console.log(`· ${c.name}: not found in the spoken script, skipping`); continue; }
    const clipFile = join(CLIPS, date, `${slug(c.name)}-${lang}.mp3`);
    const clip = cutClip(lang, span, clipFile);
    if (!clip) { console.log(`· ${c.name}: no episode audio to cut (audio/${date}-${lang}.mp3 missing)`); continue; }
    clip.approx = span.approx;
    const clipUrl = `${SITE}/clips/${date}/${slug(c.name)}-${lang}.mp3`;
    const episodeUrl = `${SITE}/${c.lang === 'de' && de ? 'de' : 'en'}/daily/${date}?utm_source=shoutout&utm_medium=email&utm_campaign=you-made-the-news`;
    const note = draftNote(c, c.lang === 'de' && de ? de : en, clipUrl, episodeUrl);
    const q = { id, kind: 'shoutout', status: 'pending', title: `${c.name}: you made the news (${date})`, company: c.name, domain: c.domain || '', to: c.to || '', contactSource: c.contactSource || '', linkedin: c.linkedin || '', lang: c.lang, why: c.why || '', clipUrl, clipFile: `site/public/clips/${date}/${slug(c.name)}-${lang}.mp3`, clip, episodeUrl, subject: note.subject, text: note.text, linkedinPost: note.linkedin, createdAt: today };
    writeFileSync(qf, JSON.stringify(q, null, 2) + '\n');
    queued.push(q);
    console.log(`✓ ${c.name}: ${clip.seconds}s clip (${lang}${clip.approx ? ', approx' : ''}) → ${q.clipFile}${c.to ? ` · to ${c.to}` : ' · no address found'}`);
  }
  if (args.email) await emailReview(queued);
}
run().catch((e) => { console.error(e); process.exit(1); });
