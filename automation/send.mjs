#!/usr/bin/env node
/**
 * Sqwod Daily send — delivers the rendered email via the Resend Broadcasts API
 * (https://resend.com/docs/api-reference/broadcasts/create-broadcast).
 *
 * We send our OWN inline-styled HTML as the broadcast `html`. One call creates
 * AND sends (send:true). Resend handles unsubscribe via the
 * {{{RESEND_UNSUBSCRIBE_URL}}} token, which our template already carries.
 *
 *   node automation/send.mjs --date=2026-06-22 [--lang=en] [--dry]
 *
 * Env (GitHub Actions secrets):
 *   RESEND_API_KEY        required to send (no key → safe no-op)
 *   RESEND_AUDIENCE_EN    audience/segment ID for the English list
 *   RESEND_AUDIENCE_DE    audience/segment ID for the German list
 *   RESEND_FROM           verified sender, e.g. "Sqwod Daily <daily@sqwod.life>"
 *   RESEND_REPLY_TO       optional, default hello@sqwod.life
 *   RESEND_PRIMARY_LANG   when only one audience is set, which lang to send; default en
 *   SITE_URL              default https://sqwod.life
 *
 * Bilingual safety: each language sends ONLY to its own audience, so nobody is
 * double-emailed in two languages. A language with no audience configured is
 * skipped (you can't broadcast without a list).
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILY = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const EMAIL = join(__dirname, '..', 'site', 'public', 'email');
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const DRY = !!args.dry;

const KEY = process.env.RESEND_API_KEY || '';
const AUD = { en: process.env.RESEND_AUDIENCE_EN || '', de: process.env.RESEND_AUDIENCE_DE || '' };
const FROM = process.env.RESEND_FROM || 'Sqwod Daily <daily@sqwod.life>';
const REPLY = process.env.RESEND_REPLY_TO || 'hello@sqwod.life';
const PRIMARY = process.env.RESEND_PRIMARY_LANG || 'en';

const CI = !!(process.env.GITHUB_ACTIONS || process.env.CI);
const ghError = (m) => { if (CI) console.log(`::error title=Sqwod send::${m}`); console.error(`✗ ${m}`); };
const summary = (line) => { try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n'); } catch {} };

// tiny frontmatter peek: pull intro + the connectDots lead title (best subject hook)
const jstr = (ln) => { const m = ln.match(/"(?:[^"\\]|\\.)*"/); return m ? JSON.parse(m[0]) : ''; };
function meta(file) {
  const fm = (readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const out = { intro: '', lead: '', summary: '', firstItem: '' };
  let inDots = false, inItems = false;
  for (const ln of fm.split('\n')) {
    if (/^summary:/.test(ln)) { out.summary = jstr(ln); continue; }
    if (/^intro:/.test(ln)) { out.intro = jstr(ln); continue; }
    if (/^connectDots:/.test(ln)) { inDots = true; inItems = false; continue; }
    if (/^items:/.test(ln)) { inItems = true; inDots = false; continue; }
    if (inDots) {
      const m = ln.match(/^\s+title:\s*(.+)$/); if (m) { out.lead = jstr(ln); inDots = false; continue; }
      if (!/^\s/.test(ln)) inDots = false;
    }
    if (inItems && !out.firstItem) {
      const m = ln.match(/^\s+-?\s*headline:\s*(.+)$/); if (m) { out.firstItem = jstr(ln); inItems = false; }
      else if (!/^\s/.test(ln)) inItems = false;
    }
  }
  return out;
}
const niceDate = (d, lang) => new Date(d + 'T06:00:00Z').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

// Make any leftover beehiiv tokens Resend-safe (belt-and-braces; template is updated too).
function resendify(html, lang) {
  return html
    .replace(/\{\{\s*unsubscribe\s*\}\}/g, '{{{RESEND_UNSUBSCRIBE_URL}}}')
    .replace(/\{\{\s*rp_refer_url\s*\}\}/g, `${SITE}/${lang}/subscribe`)
    .replace(/\{\{\s*rp_personalized_text\s*\}\}/g, '');
}

async function sendLang(lang) {
  const issue = join(DAILY, `${date}.${lang}.md`);
  const snippet = join(EMAIL, `${date}-${lang}.snippet.html`);
  if (!existsSync(issue) || !existsSync(snippet)) { console.log(`· ${lang.toUpperCase()}: no issue/snippet for ${date} — skipping`); return false; }
  if (!AUD[lang]) { console.log(`· ${lang.toUpperCase()}: no RESEND_AUDIENCE_${lang.toUpperCase()} configured — skipping`); return false; }

  const m = meta(issue);
  const html = resendify(readFileSync(snippet, 'utf8'), lang);
  // Subject = the day's HOOK (no date — the inbox already shows it; the brand is in
  // the "Sqwod Daily" from-name). Prefer the episode title/thread; fall back to the
  // top story; never ship a bland "Sqwod Daily — <date>".
  const hook = (m.summary || m.lead || m.firstItem || 'Sqwod Daily').trim();
  const subject = hook.length > 88 ? hook.slice(0, 86).replace(/\s+\S*$/, '') + '…' : hook;
  const payload = {
    segment_id: AUD[lang],
    from: FROM,
    reply_to: REPLY,
    subject,
    html,
    name: `Sqwod Daily ${date} (${lang.toUpperCase()})`,
    send: true,
  };

  if (DRY || !KEY) {
    console.log(`· ${lang.toUpperCase()} DRY/no-key: would broadcast "${subject}" (${(html.length / 1024).toFixed(0)} KB) → audience ${AUD[lang]}`);
    return true;
  }

  const r = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { ghError(`Resend send failed (${lang}, ${r.status}): ${(await r.text()).slice(0, 240)}`); return false; }
  const j = await r.json().catch(() => ({}));
  console.log(`✓ sent ${lang.toUpperCase()}: "${subject}"  (broadcast ${j?.id || 'created'})`);
  summary(`- ✉️ Sent ${lang.toUpperCase()} — "${subject}"`);
  return true;
}

async function run() {
  if (!KEY) ghError('Resend not configured (need RESEND_API_KEY). Email send skipped — site/podcast still shipped.');

  let langs;
  if (args.lang) langs = [args.lang];
  else { langs = ['en', 'de'].filter((l) => AUD[l]); if (!langs.length) langs = [PRIMARY]; }

  let sent = 0;
  for (const lang of langs) { if (await sendLang(lang)) sent++; }
  console.log(`\nSend: ${date} · ${sent}/${langs.length} language(s) ${DRY || !KEY ? '(dry/no-key)' : 'dispatched'}`);
}
run();
