#!/usr/bin/env node
/**
 * Sqwod Jobs alert: the Friday email to people who signed up on /jobs/ (contact property
 * jobs_alert = "true", set by infrastructure/subscribe/worker.js). Sent Fridays 08:00 Berlin
 * by .github/workflows/jobs.yml, one Resend broadcast per language, same way send.mjs sends
 * the Daily: to a segment. The Worker adds jobs-alert sign-ups to RESEND_SEGMENT_JOBS_EN /
 * RESEND_SEGMENT_JOBS_DE by their locale.
 *
 *   node automation/jobs-alert.mjs              # send (needs RESEND_API_KEY + segment ids)
 *   node automation/jobs-alert.mjs --dry        # build both emails, save previews, send nothing
 *   node automation/jobs-alert.mjs --date=2026-11-06
 *
 * Fewer than 3 new roles this week: nothing is sent, the run only logs it. Previews are
 * always written to automation/jobs/preview-en.html and preview-de.html.
 *
 * Sent under the Resend topic "Sqwod Jobs" (RESEND_TOPIC_JOBS), so the unsubscribe link only
 * ends the jobs alert and never a Daily subscription.
 *
 * Env: RESEND_API_KEY, RESEND_TOPIC_JOBS, RESEND_FROM (default "Sqwod Jobs <daily@sqwod.life>"),
 *      RESEND_SEGMENT_JOBS_EN, RESEND_SEGMENT_JOBS_DE
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadJobs, newThisWeek, hasPay, payLabel, payBasis, cityLabel } from './jobs-week.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Sqwod Jobs <daily@sqwod.life>';
const TOPIC = process.env.RESEND_TOPIC_JOBS || 'bf47c9ac-146f-4767-8fb3-ab43dba06bad';
const SEG = { en: process.env.RESEND_SEGMENT_JOBS_EN, de: process.env.RESEND_SEGMENT_JOBS_DE };
const SITE = 'https://sqwod.life';
const date = args.date || new Date().toISOString().slice(0, 10);
const now = Date.parse(date + 'T23:59:59Z');
const MIN_NEW = 3;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const F = '-apple-system,Segoe UI,Helvetica,Arial,sans-serif';

const TX = {
  en: { subject: (n) => `${n} new fitness jobs in Germany this week`, head: 'New fitness jobs in Germany', at: 'at', payOn: (x, n) => `Pay listed on ${x} of ${n}.`,
    noPay: 'Pay not listed', all: 'See every open role', why: 'You get this because you signed up for the Sqwod Jobs alert on sqwod.life.', unsub: 'Unsubscribe', apply: 'Apply' },
  de: { subject: (n) => `${n} neue Fitness-Jobs in Deutschland diese Woche`, head: 'Neue Fitness-Jobs in Deutschland', at: 'bei', payOn: (x, n) => `Gehalt angegeben bei ${x} von ${n}.`,
    noPay: 'Gehalt nicht angegeben', all: 'Alle offenen Stellen ansehen', why: 'Du bekommst diese Mail, weil du dich auf sqwod.life für den Sqwod-Jobs-Alert eingetragen hast.', unsub: 'Abmelden', apply: 'Bewerben' },
};

function email(lang, fresh) {
  const t = TX[lang];
  const top = fresh.slice(0, 10);
  const withPay = fresh.filter(hasPay).length;
  const page = `${SITE}/${lang}/jobs/?utm_source=sqwod-jobs&utm_medium=email&utm_campaign=jobs-${date}`;
  const rows = top.map((j, i) => {
    const pay = payLabel(j, lang) ? [payLabel(j, lang), payBasis(j, lang)].filter(Boolean).join(' ') : null;
    return `<tr><td style="padding:14px 0;${i ? 'border-top:1px solid #E2DED6;' : ''}">
      <div style="font:700 16px/1.3 ${F};color:#1B1917;">${esc(j.title)}</div>
      <div style="font:400 13.5px/1.5 ${F};color:#5C5850;margin-top:3px;">${esc([j.employer ? `${t.at} ${j.employer}` : '', cityLabel(j, lang)].filter(Boolean).join(', '))}</div>
      <div style="margin-top:6px;font:700 15px/1.3 ${F};color:${pay ? '#2F5A3A' : '#6B665E'};">${esc(pay || t.noPay)}
        &nbsp;·&nbsp; <a href="${esc(j.url)}" style="color:#1B1917;font-weight:600;">${t.apply} &rarr;</a></div>
    </td></tr>`;
  }).join('');
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.subject(fresh.length))}</title></head>
<body style="margin:0;background:#F3F0EA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F0EA;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border:1px solid #E2DED6;border-radius:16px;">
<tr><td style="padding:26px 26px 6px;">
  <div style="font:700 11px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:#4F7A5A;">Sqwod Jobs</div>
  <div style="font:800 24px/1.2 ${F};color:#1B1917;margin-top:10px;">${esc(t.head)}</div>
  <div style="font:400 15px/1.5 ${F};color:#5C5850;margin-top:8px;">${esc(t.subject(fresh.length))}. ${esc(t.payOn(withPay, fresh.length))}</div>
</td></tr>
<tr><td style="padding:6px 26px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding:18px 26px 26px;">
  <a href="${esc(page)}" style="display:inline-block;background:#1B1917;color:#F4F0EA;font:700 14px/1 ${F};text-decoration:none;padding:14px 20px;border-radius:12px;">${esc(t.all)} &rarr;</a>
</td></tr>
</table>
<p style="max-width:580px;font:400 12px/1.5 ${F};color:#6B665E;margin:14px auto 0;">${esc(t.why)} <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#5C5850;">${t.unsub}</a></p>
</td></tr></table></body></html>`;
  return { subject: t.subject(fresh.length), html };
}

const store = loadJobs();
const fresh = newThisWeek(store.jobs || [], now);
console.log(`jobs alert ${date}: ${fresh.length} new roles this week, ${fresh.filter(hasPay).length} with pay`);
mkdirSync(join(__dirname, 'jobs'), { recursive: true });
const mails = {};
for (const lang of ['en', 'de']) {
  mails[lang] = email(lang, fresh);
  writeFileSync(join(__dirname, 'jobs', `preview-${lang}.html`), mails[lang].html);
}
console.log('previews: automation/jobs/preview-en.html, automation/jobs/preview-de.html');

if (fresh.length < MIN_NEW) {
  console.log(`fewer than ${MIN_NEW} new roles: nothing sent this week`);
} else if (args.dry || !KEY) {
  console.log(`${args.dry ? 'dry run' : 'no RESEND_API_KEY'}: would send "${mails.en.subject}" (EN) and "${mails.de.subject}" (DE)`);
} else {
  for (const lang of ['en', 'de']) {
    if (!SEG[lang]) { console.log(`· ${lang.toUpperCase()}: no RESEND_SEGMENT_JOBS_${lang.toUpperCase()} configured, skipping`); continue; }
    const r = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ segment_id: SEG[lang], from: FROM, subject: mails[lang].subject, html: mails[lang].html, name: `Sqwod Jobs ${date} (${lang.toUpperCase()})`, topic_id: TOPIC, send: true }),
    });
    console.log(r.ok ? `✓ ${lang.toUpperCase()} jobs alert sent` : `! ${lang.toUpperCase()} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}
