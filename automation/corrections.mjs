#!/usr/bin/env node
/**
 * sqwod.life — Corrections & Clarifications desk.
 *
 * Files a public correction the way a newsroom does: writes a bilingual entry to
 * the `corrections` content collection (rendered at /[lang]/corrections), and
 * emails the desk a branded "Correction filed" notice. It does NOT edit the
 * article — the human (or the Intelligence refresh) makes the fix; this records
 * and publishes the retraction.
 *
 * Manual filing:
 *   node automation/corrections.mjs --file \
 *     --report recovery-economy --kind clarification \
 *     --was "..." --now "..." --reason "..." \
 *     --source "Spherical Insights" --sourceUrl "https://..." \
 *     [--was-de "..." --now-de "..." --reason-de "..."] [--date 2026-06-28] [--no-email]
 *
 * Programmatic (used by intelligence-refresh.mjs when it corrects an error):
 *   import { fileCorrection } from './corrections.mjs';
 *   await fileCorrection({ report, kind, en:{was,now,reason}, de:{...}, source, sourceUrl, date });
 *
 * Env: RESEND_API_KEY, RESEND_FROM, INTEL_REVIEWER_EMAIL, SITE_BASE (default https://sqwod.life)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTICLES = join(__dirname, '..', 'site', 'src', 'content', 'articles');
const LEDGER = join(__dirname, '..', 'site', 'src', 'content', 'corrections');
const SITE = (process.env.SITE_BASE || 'https://sqwod.life').replace(/\/$/, '');
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';

const yamlEsc = (s) => String(s ?? '').replace(/"/g, '\\"');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Resolve a report's per-language title + on-site URL from its article frontmatter.
function reportMeta(slug, lang) {
  const path = join(ARTICLES, `${slug}.${lang}.md`);
  let title = slug, format = 'analysis';
  if (existsSync(path)) {
    const fm = readFileSync(path, 'utf8').split('---')[1] || '';
    title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] || slug).replace(/"/g, '');
    format = fm.match(/^format:\s*(\S+)/m)?.[1] || 'analysis';
  }
  const base = format === 'report' ? 'intelligence' : 'analysis';
  return { title, url: `/${lang}/${base}/${slug}` };
}

/**
 * Write the bilingual ledger entry + send the desk email.
 * opts: { report, kind, en:{was,now,reason}, de:{was,now,reason}, source, sourceUrl, date, email=true }
 * de falls back to en when omitted.
 */
export async function fileCorrection(opts) {
  const { report, kind = 'correction', source = '', sourceUrl = '', date = new Date().toISOString().slice(0, 10) } = opts;
  const en = opts.en || {};
  const de = { was: opts.de?.was ?? en.was, now: opts.de?.now ?? en.now, reason: opts.de?.reason ?? en.reason };
  if (!report || !en.was || !en.now || !en.reason) throw new Error('fileCorrection needs report + en.{was,now,reason}');

  const hash = createHash('sha256').update(`${report}.${en.was}.${en.now}`).digest('hex').slice(0, 6);
  const id = `${date}-${report}-${hash}`;
  mkdirSync(LEDGER, { recursive: true });

  for (const lang of ['en', 'de']) {
    const meta = reportMeta(report, lang);
    const f = lang === 'de' ? de : en;
    const body = `---
lang: ${lang}
date: ${date}
report: ${report}
reportTitle: "${yamlEsc(meta.title)}"
reportUrl: ${meta.url}
kind: ${kind}
was: "${yamlEsc(f.was)}"
now: "${yamlEsc(f.now)}"
reason: "${yamlEsc(f.reason)}"${source ? `\nsource: "${yamlEsc(source)}"` : ''}${sourceUrl ? `\nsourceUrl: "${yamlEsc(sourceUrl)}"` : ''}
---
`;
    writeFileSync(join(LEDGER, `${id}.${lang}.md`), body);
  }
  console.log(`✎ filed ${kind} ${id} (${report})`);

  if (opts.email !== false) await emailNotice({ id, report, kind, source, date, ...en });
  return id;
}

async function emailNotice({ id, report, kind, was, now, reason, source, date }) {
  const meta = reportMeta(report, 'en');
  const label = kind === 'clarification' ? 'Clarification' : 'Correction';
  const html = `<div style="background:#0e0e10;padding:28px 0"><div style="max-width:560px;margin:0 auto;padding:0 20px">
    <div style="font:800 22px/1 -apple-system,Arial;color:#FAFAFA;letter-spacing:-.02em;margin-bottom:4px">SQWOD<span style="color:#85858e">.life</span></div>
    <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.16em;text-transform:uppercase;color:#85858e;margin-bottom:18px">Corrections desk</div>
    <table width="100%" style="border:1px solid #2a2a30;border-radius:12px;background:#161619"><tr><td style="padding:18px 20px">
      <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.12em;text-transform:uppercase;color:#fbbf24">${label} filed · ${esc(date)}</div>
      <div style="font:700 17px/1.4 -apple-system,Arial;color:#FAFAFA;margin:8px 0 12px">${esc(meta.title)}</div>
      <div style="font:400 13px/1.6 -apple-system,Arial;color:#b8b8c0;margin:2px 0"><span style="color:#85858e">We said:</span> <span style="text-decoration:line-through;color:#85858e">${esc(was)}</span></div>
      <div style="font:400 13px/1.6 -apple-system,Arial;color:#ededf0;margin:2px 0"><span style="color:#85858e">Now:</span> <b>${esc(now)}</b></div>
      <div style="font:400 13px/1.6 -apple-system,Arial;color:#b8b8c0;margin:2px 0"><span style="color:#85858e">Why:</span> ${esc(reason)}</div>
      ${source ? `<div style="font:400 13px/1.6 -apple-system,Arial;color:#b8b8c0;margin:2px 0"><span style="color:#85858e">Source:</span> ${esc(source)}</div>` : ''}
      <div style="margin-top:16px"><a href="${SITE}/en/corrections" style="display:inline-block;background:#FAFAFA;color:#0e0e10;text-decoration:none;font:800 14px/1 -apple-system,Arial;padding:12px 18px;border-radius:9px">View the public ledger ↗</a></div>
    </td></tr></table>
    <div style="font:400 11px/1.5 -apple-system,Arial;color:#52525a;margin-top:10px">Logged publicly at sqwod.life/corrections · entry ${esc(id)}</div>
  </div></div>`;
  if (!RESEND || !REVIEWER) { console.log(`[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'}: ${label} filed — ${meta.title}`); return; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: REVIEWER, subject: `Sqwod — ${label.toLowerCase()} filed: ${meta.title}`, html }),
  });
  console.log(r.ok ? `✓ emailed ${label.toLowerCase()} notice to ${REVIEWER}` : `! email failed (${r.status})`);
}

// ---- CLI ----
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
// support "--flag value" style too
const argv = process.argv.slice(2);
function val(name) {
  if (args[name] && args[name] !== true) return args[name];
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (args[name] === true ? true : undefined);
}

if (val('file')) {
  await fileCorrection({
    report: val('report'),
    kind: val('kind') || 'correction',
    source: val('source') || '',
    sourceUrl: val('sourceUrl') || '',
    date: typeof val('date') === 'string' ? val('date') : undefined,
    email: !val('no-email'),
    en: { was: val('was'), now: val('now'), reason: val('reason') },
    de: { was: val('was-de'), now: val('now-de'), reason: val('reason-de') },
  });
} else if (process.argv[1] && process.argv[1].endsWith('corrections.mjs')) {
  console.log('Usage: node automation/corrections.mjs --file --report <slug> --was "..." --now "..." --reason "..." [--kind correction|clarification] [--source "..."] [--sourceUrl "..."] [--*-de "..."] [--no-email]');
}
