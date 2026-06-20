#!/usr/bin/env node
/**
 * Sqwod Daily email — the newsletter IS the product: a self-contained read that
 * teaches, gives one action, entertains, and connects the dots. The ONLY
 * click-out is the sponsor. Audio is offered as a secondary option, never the
 * point. Signature movement glyphs (GIFs) + imagery carry the brand.
 *
 *   node automation/newsletter.mjs                 # today, EN + DE
 *   node automation/newsletter.mjs --date=2026-06-19 --lang=en
 *
 * Output: site/public/email/<date>-<lang>.html (also the hosted "view in browser").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILY = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const OUT = join(__dirname, '..', 'site', 'public', 'email');
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// --- frontmatter reader (no deps) ---
const jstr = (line) => { const m = line.match(/"(?:[^"\\]|\\.)*"/); return m ? JSON.parse(m[0]) : ''; };
function parseIssue(file) {
  const text = readFileSync(file, 'utf8');
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const out = { intro: '', summary: '', date: '', urlSlug: '', items: [], sponsor: null, connectDots: null, doThis: '', meanwhile: '' };
  let cur = null, block = null;
  for (const ln of fm.split('\n')) {
    if (/^sponsor:/.test(ln)) { block = 'sponsor'; out.sponsor = {}; continue; }
    if (/^connectDots:/.test(ln)) { block = 'connectDots'; out.connectDots = {}; continue; }
    if (block && /^\s+\w+:/.test(ln)) {
      const k = ln.trim().split(':')[0];
      out[block][k] = jstr(ln);
      continue;
    }
    block = null;
    if (/^intro:/.test(ln)) out.intro = jstr(ln);
    else if (/^summary:/.test(ln)) out.summary = jstr(ln);
    else if (/^date:/.test(ln)) out.date = jstr(ln);
    else if (/^urlSlug:/.test(ln)) out.urlSlug = jstr(ln);
    else if (/^doThis:/.test(ln)) out.doThis = jstr(ln);
    else if (/^meanwhile:/.test(ln)) out.meanwhile = jstr(ln);
    else if (/^\s*-\s*headline:/.test(ln)) { cur = { headline: jstr(ln), dek: '' }; out.items.push(cur); }
    else if (/^\s*dek:/.test(ln) && cur) cur.dek = jstr(ln);
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = {
  en: { dots: 'Connect the dots', rundown: 'The rundown', doThis: 'Do this today', meanwhile: 'Meanwhile in fitness', sponsored: 'Sponsored', presented: 'Presented by', learn: 'Learn more', listen: 'Prefer to listen? Play the 5-min audio', subH: 'Forwarded this? Get it yourself', subP: 'Five minutes, every weekday. Free.', subBtn: 'Subscribe free', refer: 'Know an operator who’d like this? Forward it.', unsub: 'Unsubscribe', disc: 'Sponsored content is clearly labeled. Sqwod editorial is independent of sponsors.' },
  de: { dots: 'Punkte verbinden', rundown: 'Der Rundown', doThis: 'Mach das heute', meanwhile: 'Nebenbei in der Fitnesswelt', sponsored: 'Anzeige', presented: 'Präsentiert von', learn: 'Mehr erfahren', listen: 'Lieber hören? Spiel die 5-Min-Audio', subH: 'Weitergeleitet bekommen? Hol es dir selbst', subP: 'Fünf Minuten, jeden Werktag. Kostenlos.', subBtn: 'Kostenlos abonnieren', refer: 'Kennst du eine:n Operator, der das mag? Leite es weiter.', unsub: 'Abmelden', disc: 'Werbung ist klar gekennzeichnet. Die Sqwod-Redaktion ist von Sponsoren unabhängig.' },
};

// brand palette (light email for deliverability)
const INK = '#0e0e10', G1 = '#2c2c31', G2 = '#5b5b61', G4 = '#9a9aa1', LINE = '#e4e4e7', CHALK = '#ffffff', PANEL = '#f6f6f7';
const FONT = '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const asset = (f) => `${SITE}/email-assets/${f}`;

function render(iss, lang) {
  const tx = T[lang];
  const date = iss.date || iss.urlSlug;
  const niceDate = new Date(date + 'T06:00:00Z').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const epUrl = `${SITE}/${lang}/daily/${date}`;
  const sectionLabel = (txt, gif) => `
        <tr><td style="padding:30px 0 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td><img src="${asset(gif)}" width="26" height="26" alt="" style="display:block;border-radius:5px;"></td>
            <td style="padding-left:10px;font:800 12px/1 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:${G4};">${txt}</td>
          </tr></table>
        </td></tr>`;

  // CONNECT THE DOTS — the teaching lead
  const dots = iss.connectDots && iss.connectDots.title ? `
        ${sectionLabel(tx.dots, 'line-trend.gif')}
        <tr><td style="padding:6px 0 4px;">
          <div style="font:800 24px/1.25 ${FONT};letter-spacing:-.02em;color:${INK};margin-bottom:10px;">${esc(iss.connectDots.title)}</div>
          <div style="font:400 16px/1.7 ${FONT};color:${G1};">${esc(iss.connectDots.body).replace(/\n+/g, '</div><div style="font:400 16px/1.7 ' + FONT + ';color:' + G1 + ';margin-top:12px;">')}</div>
        </td></tr>` : '';

  // THE RUNDOWN — self-contained items, no click-outs
  const items = iss.items.map((it, i) => `
        <tr><td style="padding:18px 0;border-top:1px solid ${LINE};">
          <div style="font:700 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${G4};">${String(i + 1).padStart(2, '0')}</div>
          <div style="font:800 19px/1.3 ${FONT};color:${INK};margin:7px 0 6px;letter-spacing:-.01em;">${esc(it.headline)}</div>
          <div style="font:400 15px/1.65 ${FONT};color:${G2};">${esc(it.dek)}</div>
        </td></tr>`).join('');

  // DO THIS — actionable
  const doThis = iss.doThis ? `
        ${sectionLabel(tx.doThis, 'pulse-ring.gif')}
        <tr><td style="padding:6px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:14px;">
            <tr><td style="padding:20px 22px;font:600 16px/1.6 ${FONT};color:${CHALK};">${esc(iss.doThis)}</td></tr>
          </table>
        </td></tr>` : '';

  // SPONSOR — the single click-out
  const sp = iss.sponsor && iss.sponsor.name ? `
        <tr><td style="padding:26px 0 2px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${LINE};border-radius:12px;background:${PANEL};">
            <tr><td style="padding:18px 20px;">
              <div style="font:800 10px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${G4};">${tx.sponsored} · ${tx.presented} ${esc(iss.sponsor.name)}</div>
              ${iss.sponsor.blurb ? `<div style="font:500 15.5px/1.55 ${FONT};color:${INK};margin:9px 0 ${iss.sponsor.url ? '13px' : '0'};">${esc(iss.sponsor.blurb)}</div>` : ''}
              ${iss.sponsor.url ? `<a href="${esc(iss.sponsor.url)}" style="display:inline-block;font:700 13px ${FONT};color:${CHALK};background:${INK};text-decoration:none;padding:10px 18px;border-radius:999px;">${esc(iss.sponsor.cta || tx.learn)} &rarr;</a>` : ''}
            </td></tr>
          </table>
        </td></tr>` : '';

  // MEANWHILE — entertainment
  const meanwhile = iss.meanwhile ? `
        ${sectionLabel(tx.meanwhile, 'pulse-ring.gif')}
        <tr><td style="padding:6px 0 4px;font:400 15.5px/1.7 ${FONT};color:${G1};">${esc(iss.meanwhile)}</td></tr>` : '';

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod Daily — ${esc(niceDate)}</title></head>
<body style="margin:0;padding:0;background:#eeeef0;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(iss.connectDots?.title || iss.intro || iss.summary)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeef0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CHALK};border-radius:18px;overflow:hidden;">
        <!-- masthead + hero glyph -->
        <tr><td style="background:${INK};padding:22px 28px 0;">
          <div style="font:900 22px/1 ${FONT};letter-spacing:.02em;color:${CHALK};">SQWOD <span style="font-weight:600;color:${G4};">DAILY</span></div>
          <div style="font:600 12px/1 ${FONT};color:${G4};margin:6px 0 16px;">${esc(niceDate)}</div>
        </td></tr>
        <tr><td style="background:${INK};padding:0;"><img src="${asset('hero-bars.gif')}" width="600" alt="Sqwod Daily" style="display:block;width:100%;height:auto;"></td></tr>
        <!-- intro -->
        <tr><td style="padding:24px 28px 0;">
          <div style="font:500 16px/1.6 ${FONT};color:${G1};">${esc(iss.intro || iss.summary)}</div>
        </td></tr>
        <!-- connect the dots -->
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dots}</table></td></tr>
        <!-- rundown -->
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionLabel(tx.rundown, 'hero-bars.gif')}${items}</table></td></tr>
        <!-- do this -->
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${doThis}</table></td></tr>
        <!-- sponsor (the only click-out) -->
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sp}</table></td></tr>
        <!-- meanwhile -->
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${meanwhile}</table></td></tr>
        <!-- audio, secondary -->
        <tr><td style="padding:24px 28px 0;">
          <a href="${epUrl}" style="font:700 13px ${FONT};color:${G2};text-decoration:none;">&#9654;&nbsp; ${tx.listen} &rarr;</a>
        </td></tr>
        <!-- subscribe -->
        <tr><td style="padding:22px 28px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:14px;">
            <tr><td align="center" style="padding:22px 20px;">
              <div style="font:800 19px/1.2 ${FONT};color:${INK};margin-bottom:6px;">${tx.subH}</div>
              <div style="font:400 14px/1.5 ${FONT};color:${G2};margin-bottom:16px;">${tx.subP}</div>
              <a href="${SITE}/${lang}/subscribe" style="display:inline-block;font:800 14px ${FONT};color:${CHALK};background:${INK};text-decoration:none;padding:12px 22px;border-radius:999px;">${tx.subBtn}</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:14px 28px 30px;">
          <div style="font:400 12px/1.6 ${FONT};color:${G4};">${tx.refer}</div>
          <div style="font:400 11px/1.6 ${FONT};color:${G4};margin-top:10px;">${tx.disc}</div>
          <div style="font:400 11px/1.6 ${FONT};color:${G4};margin-top:8px;">Sqwod · Berlin · <a href="{{unsubscribe}}" style="color:${G4};">${tx.unsub}</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function run() {
  mkdirSync(OUT, { recursive: true });
  const langs = args.lang ? [args.lang] : ['en', 'de'];
  const date = args.date || new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const lang of langs) {
    const file = join(DAILY, `${date}.${lang}.md`);
    if (!existsSync(file)) { console.log(`· no issue for ${date} (${lang}) — skipping`); continue; }
    writeFileSync(join(OUT, `${date}-${lang}.html`), render(parseIssue(file), lang));
    console.log(`✓ email (${lang}) → site/public/email/${date}-${lang}.html`);
    n++;
  }
  if (!n) console.log('No issues rendered.');
}
run();
