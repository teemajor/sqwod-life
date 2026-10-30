#!/usr/bin/env node
/**
 * The morning review email (30 Oct 2026). ONE email with everything that waits for Tee,
 * replacing the separate article, deal, figure, flagship and Search Console emails.
 *
 *   node automation/digest.mjs                    # build + send (weekdays ~07:30 Berlin)
 *   node automation/digest.mjs --preview=x.html   # also save the HTML
 *   node automation/digest.mjs --dry              # print, send nothing
 *
 * What goes in (each item with a trust line: ✓ clean or ⚠ with the reasons):
 *   today's Daily (held, or sent with notes) · Evidence playbooks · press releases ·
 *   lane articles · the monthly flagship · report figure updates · new deals ·
 *   anything Claude is revising from a Note · on Mondays: search, story ideas, social.
 * Every item: Publish · Edit · Note · Skip (signed one-tap links, valid 7 days; anything
 * undecided comes back the next morning with fresh links).
 * Env: RESEND_API_KEY, RESEND_FROM, INTEL_REVIEWER_EMAIL, INTEL_SIGNING_SECRET, INTEL_WORKER_URL
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, queueItems, pressItems, signedLink, noteLink, editLink, viewLink, esc, readJson, berlin, fmField, bodyOf, sourcesOf } from './review-lib.mjs';
import { phraseProblems } from './quality.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const B = berlin();
const today = args.date || B.date;
const isMonday = args.monday || new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
const RESEND = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM || 'Sqwod Review <intel@sqwod.life>';
const TO = process.env.INTEL_REVIEWER_EMAIL || '';
const daysSince = (d) => Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`)) / 864e5));
const unent = (s) => String(s ?? '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'");
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '');

// ---------- one card per item ----------
const KIND = { daily: 'Sqwod Daily', evidence: 'Evidence playbook', press: 'Press release', article: 'Article', flagship: 'Monthly report', figure: 'Report figure', deal: 'Deal Tracker' };

function draftChecks(raw) {
  const w = [];
  const n = sourcesOf(raw).length;
  if (n < 2) w.push(`Only ${n} source.`);
  const refs = [...raw.matchAll(/#source-(\d+)/g)].map((m) => Number(m[1]));
  if (refs.some((r) => r > n)) w.push('A footnote points past the source list.');
  if (/—/.test(raw)) w.push('Em dash in the text.');
  w.push(...phraseProblems(bodyOf(raw)).slice(0, 2));
  return w;
}

function cardFor(p) {
  const base = { id: p.id, kind: p.kind, flags: [], info: [], age: daysSince(p.createdAt || p.submittedAt || today) };
  const actions = (o = {}) => ({ publish: signedLink(p.id, o.approve || 'approve'), skip: signedLink(p.id, 'reject'), note: noteLink(p.id), ...o });
  if (p.revisionError) base.flags.push(`Your last note could not be applied: ${p.revisionError}.`);
  if (p.lastChange && p.revisedAt) base.info.push(`Revised from your note: ${p.lastChange}${p.unresolved ? ` Not done: ${p.unresolved}` : ''}`);

  if (p.kind === 'daily') {
    const path = `site/src/content/daily/${p.date}.en.md`;
    const held = p.held && p.status === 'pending';
    return { ...base, title: p.title, sub: held ? 'Held. Goes out at 10:00 unless you decide.' : `Sent this morning. Edit or Note fixes the website and podcast copy, not emails already sent.`,
      flags: [...base.flags, ...(held ? p.flags || [] : [])], info: [...base.info, ...(p.info || [])],
      links: { preview: `https://sqwod.life/email/${p.date}-en.html`, edit: editLink(path), ...(held ? actions({ publishLabel: 'Send now' }) : { note: noteLink(p.id) }) }, urgent: held, fyi: !held };
  }
  if (['article', 'evidence', 'flagship'].includes(p.kind)) {
    const dir = { article: 'automation/article-drafts', evidence: 'automation/evidence-drafts', flagship: 'automation/intel-drafts' }[p.kind];
    const path = `${dir}/${p.slug}.en.md`; const raw = read(path);
    const flags = [...base.flags, ...(p.warnings || []), ...(raw ? draftChecks(raw) : [`Draft file not found (${path}).`])];
    if (p.kind === 'evidence') flags.unshift('Health claims under your name: spot-check the graded verdicts against the sources.');
    if (p.kind === 'flagship') flags.unshift('Numbers report: check every figure against its chart or source before publishing.');
    const desc = raw ? fmField(raw, 'description') : p.description || '';
    return { ...base, title: p.title || fmField(raw, 'title'), sub: desc, flags: [...new Set(flags)],
      meta: raw ? `${sourcesOf(raw).length} sources · DE: ${fmField(read(`${dir}/${p.slug}.de.md`), 'title') || p.titleDe || 'missing'}` : '',
      links: { preview: viewLink(path), edit: editLink(path), ...actions() } };
  }
  if (p.kind === 'deal') {
    const d = (readJson(join(ROOT, 'site', 'src', 'data', 'deals.json'), { deals: [] }).deals || []).find((x) => x.id === p.dealId) || {};
    return { ...base, title: `${d.entity || p.title} · ${d.kind || ''} · ${d.amount || 'amount undisclosed'}`, sub: d.note || '',
      flags: [...base.flags, ...(p.flags || [])], meta: `${d.country || d.region || ''} · first reported ${d.date || p.createdAt}`,
      links: { preview: d.url, edit: editLink('automation/deals-overrides.json'), ...actions() } };
  }
  if (p.kind === 'press') {
    const r = p.recommendation || {};
    const flags = [...base.flags, ...(r.decision && r.decision !== 'approve' ? [`AI screen says ${r.decision}: ${r.reasons || ''}`] : [])];
    if (p.tier === 'premium' && !p.paid) flags.push('Premium tier, not paid yet: it publishes only after payment.');
    if (!r.decision) flags.push('Not screened yet.');
    return { ...base, title: p.headline, sub: `${p.company} · ${p.dek || ''}`, flags, meta: `${p.tier || 'standard'} · ${p.publishLang || p.lang} · AI score ${r.score ?? '?'}`,
      info: [...base.info, r.reasons && r.decision === 'approve' ? `AI screen: ${r.reasons}` : ''].filter(Boolean),
      links: { preview: p.link || p.companyUrl, edit: editLink(`automation/press-queue/${p.id.replace(/^press-/, '')}.json`), ...actions() } };
  }
  // report figure proposal (kind "changed" / "review-due")
  const replace = p.foundSource && p.currentSource && p.foundSource !== p.currentSource;
  const flags = [...base.flags];
  if (!p.confidence || p.confidence === 'n/a') flags.push('The source could not be checked automatically.');
  else if (p.confidence !== 'high') flags.push(`Web check is ${p.confidence} confidence.`);
  if (replace) flags.push(`Source would change from ${p.currentSource} to ${p.foundSource}.`);
  if (p.kind === 'review-due') flags.push('Due for review: no new value found automatically.');
  if (p.periodUnconfirmed) flags.push('The year of the new figure is not confirmed.');
  return { ...base, kind: 'figure', title: `${p.label}: ${p.oldValue} → ${p.newValue || '(no new value)'}`, sub: p.snippet ? `“${p.snippet}”` : p.recommendation || '',
    meta: `${p.report} · ${p.foundSource || p.currentSource || ''}`, flags,
    links: { preview: p.foundUrl || p.currentSourceUrl, edit: editLink(`site/src/content/articles/${p.report}.en.md`), ...actions({ approve: replace ? 'replace' : 'approve' }), ...(p.newValue ? {} : { publish: '', skipLabel: 'Keep as is' }) } };
}

// ---------- collect ----------
const q = queueItems();
const cards = [];
const daily = q.find((p) => p.kind === 'daily' && p.date === today);
if (daily && ['pending', 'sent', 'revise'].includes(daily.status)) cards.push(cardFor(daily));
for (const p of q) {
  if (p.kind === 'daily') continue;
  const isFigure = ['changed', 'review-due'].includes(p.kind);
  if (p.status === 'pending' && (isFigure || ['article', 'evidence', 'flagship', 'deal'].includes(p.kind))) cards.push(cardFor(isFigure ? p : p));
}
for (const p of pressItems()) if (['screened', 'submitted'].includes(p.status) && !p.id.startsWith('press-sample-')) cards.push(cardFor(p));
const revising = [...q, ...pressItems()].filter((p) => p.status === 'revise');
const handFix = [...q, ...pressItems()].filter((p) => ['flagged', 'needs-changes'].includes(p.status) && daysSince(p.decidedAt || p.revisedAt || (p.notes || []).slice(-1)[0]?.at || p.createdAt) <= 30);
const autoApplied = q.filter((p) => p.autoApplied && p.status === 'auto-applied' && daysSince(p.appliedAt || p.createdAt) <= 7);

const order = { daily: 0, evidence: 1, press: 2, flagship: 3, article: 4, figure: 5, deal: 6 };
const needs = cards.filter((c) => !c.fyi && (c.flags.length || c.urgent)).sort((a, b) => (order[a.kind] - order[b.kind]) || (b.age - a.age));
const clean = cards.filter((c) => !c.fyi && !c.flags.length && !c.urgent).sort((a, b) => order[a.kind] - order[b.kind]);
const fyi = cards.filter((c) => c.fyi);

// ---------- Monday: the weekly section ----------
function monday() {
  const out = [];
  const g = readJson(join(ROOT, 'automation', 'gsc', 'latest.json'), null);
  if (g) {
    const t = g.totals || {};
    out.push(`<p style="margin:0 0 6px"><b>Search (28 days to ${esc(String(g.window?.end || g.generatedAt || '').slice(0, 10))}):</b> ${t.clicks ?? 0} clicks · ${t.impressions ?? 0} impressions · ${t.queries ?? 0} queries.</p>`);
    const s = (g.striking || []).slice(0, 5);
    if (s.length) out.push(`<p style="margin:0 0 6px">One page away from page one: ${s.map((r) => `<i>${esc(r.query)}</i> (pos ${Math.round(r.position)})`).join(', ')}.</p>`);
    const qs = (g.questions || []).slice(0, 3);
    if (qs.length) out.push(`<p style="margin:0 0 6px">Questions people asked: ${qs.map((r) => `<i>${esc(r.query)}</i>`).join(', ')}.</p>`);
  }
  const lf = existsSync(join(ROOT, 'automation', 'leads')) ? readdirSync(join(ROOT, 'automation', 'leads')).filter((f) => f.endsWith('.json')).sort().pop() : null;
  const leads = lf ? (readJson(join(ROOT, 'automation', 'leads', lf), {}).leads || []).slice(0, 5) : [];
  if (leads.length) out.push(`<p style="margin:8px 0 4px"><b>Story ideas this week</b> (from industry feeds, ${esc(lf.slice(0, 10))}):</p><ul style="margin:0 0 6px;padding-left:18px">${leads.map((l) => `<li><a href="${esc(l.link)}" style="color:#111">${esc(unent(l.title))}</a> <span style="color:#777">· ${esc(l.source)}</span></li>`).join('')}</ul>`);
  out.push('<p style="margin:8px 0 0;color:#555">Social: this week\'s 4 posts are in the "sqwod.life weekly social" task chat.</p>');
  return out.join('');
}

// ---------- Friday: one line on Sqwod Jobs (a list, nothing to approve) ----------
function fridayJobs() {
  const log = readJson(join(ROOT, 'automation', 'jobs', 'last-run.json'), null);
  // a run older than 2 days means Thursday's run did not happen: say so instead of repeating last week
  if (!log?.summary || Date.now() - Date.parse(log.startedAt) > 2 * 86400000) return '<p style="margin:22px 0 0;font-size:14px;line-height:1.5"><b>Jobs:</b> no run this week. Check Actions → Jobs.</p>';
  const s = log.summary;
  const url = 'https://github.com/teemajor/sqwod-life/blob/main/automation/jobs/last-run.json';
  return `<p style="margin:22px 0 0;font-size:14px;line-height:1.5"><b>Jobs:</b> ${s.newThisWeek ?? 0} new roles found, ${s.newWithPay ?? 0} with pay, ${s.hostsFailed ?? 0} hosts failed. <a href="${url}" style="color:#111">Run log</a></p>`;
}
const isFriday = new Date(`${today}T12:00:00Z`).getUTCDay() === 5;

// ---------- render ----------
const btn = (href, label, style = 'solid') => href ? `<a href="${esc(href)}" style="display:inline-block;padding:9px 14px;border-radius:999px;font:700 13px/1 -apple-system,Segoe UI,Arial,sans-serif;text-decoration:none;margin:6px 6px 0 0;${style === 'solid' ? 'background:#111;color:#fff' : style === 'warn' ? 'border:1px solid #b45309;color:#b45309' : 'border:1px solid #bbb;color:#333'}">${label}</a>` : '';
function card(c) {
  const L = c.links || {};
  const trust = c.flags.length
    ? `<div style="margin:8px 0 2px;padding:8px 10px;border-left:3px solid #b45309;background:#fff7ed;font-size:13px;line-height:1.45;color:#7c2d12"><b>⚠ Check before publishing</b><br>${c.flags.map((x) => `· ${esc(x)}`).join('<br>')}</div>`
    : (c.fyi ? '' : '<div style="margin:6px 0 2px;font-size:12px;color:#15803d">✓ Passed every automatic check</div>');
  const info = c.info?.length ? `<div style="margin:6px 0 0;font-size:12px;color:#555">${c.info.map((x) => `· ${esc(x)}`).join('<br>')}</div>` : '';
  const age = c.age >= 2 ? ` · waiting ${c.age} days` : '';
  return `<div style="border-top:1px solid #e5e5e5;padding:14px 0">
<div style="font:700 10px/1 -apple-system,Arial;letter-spacing:.14em;text-transform:uppercase;color:#888">${esc(KIND[c.kind] || c.kind)}${age}</div>
<div style="font:700 16px/1.3 -apple-system,Segoe UI,Arial,sans-serif;margin:5px 0 3px;color:#111">${esc(c.title)}</div>
${c.sub ? `<div style="font-size:14px;line-height:1.45;color:#444">${esc(String(c.sub).slice(0, 320))}</div>` : ''}
${c.meta ? `<div style="font-size:12px;color:#888;margin-top:3px">${esc(c.meta)}</div>` : ''}
${trust}${info}
<div>${btn(L.publish, L.publishLabel || 'Publish')}${btn(L.preview, 'Preview', 'ghost')}${btn(L.edit, 'Edit', 'ghost')}${btn(L.note, 'Note', 'warn')}${btn(L.skip, L.skipLabel || 'Skip', 'ghost')}</div></div>`;
}
const section = (title, list, note = '') => list.length ? `<h3 style="font:800 13px/1 -apple-system,Arial;letter-spacing:.1em;text-transform:uppercase;margin:26px 0 4px">${title} · ${list.length}</h3>${note ? `<p style="margin:0 0 4px;font-size:12px;color:#777">${note}</p>` : ''}${list.map(card).join('')}` : '';

const total = needs.length + clean.length;
const heldDaily = cards.find((c) => c.kind === 'daily' && c.urgent);
const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;background:#fff;padding:8px 4px">
<p style="font:700 11px/1 -apple-system,Arial;letter-spacing:.16em;text-transform:uppercase;color:#888;margin:0">Sqwod review · ${esc(new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
<h2 style="margin:6px 0 4px;font-size:22px">${total ? `${total} to decide${needs.length ? `, ${needs.length} need a closer look` : ''}` : 'Nothing waiting for you'}</h2>
<p style="margin:0;color:#555;font-size:13px;line-height:1.5"><b>Publish</b> puts it live (or sends the Daily). <b>Note</b> tells Claude what to change; the revised version comes back here. <b>Edit</b> opens the file on GitHub. <b>Skip</b> drops it. Undecided items come back tomorrow.</p>
${section('Needs a closer look', needs)}
${section('Ready to publish', clean, 'Passed every automatic check. A quick skim is enough.')}
${section('Already out', fyi)}
${revising.length ? `<h3 style="font:800 13px/1 -apple-system,Arial;letter-spacing:.1em;text-transform:uppercase;margin:26px 0 4px">Being revised · ${revising.length}</h3><p style="font-size:13px;color:#555;margin:0">${revising.map((p) => `${esc(p.title || p.headline || p.id)}: “${esc((p.notes || []).slice(-1)[0]?.text || '')}”`).join('<br>')}</p>` : ''}
${handFix.length ? `<h3 style="font:800 13px/1 -apple-system,Arial;letter-spacing:.1em;text-transform:uppercase;margin:26px 0 4px">Waiting on a hand fix · ${handFix.length}</h3><p style="font-size:13px;color:#555;margin:0">${handFix.map((p) => `${esc(p.title || p.label || p.headline || p.id)}${(p.notes || []).length ? `: “${esc(p.notes.slice(-1)[0].text)}”` : ''}`).join('<br>')}</p>` : ''}
${autoApplied.length ? `<h3 style="font:800 13px/1 -apple-system,Arial;letter-spacing:.1em;text-transform:uppercase;margin:26px 0 4px">Updated automatically this week · ${autoApplied.length}</h3>${autoApplied.map((p) => `<p style="font-size:13px;margin:4px 0">${esc(p.label)}: ${esc(p.oldValue)} → <b>${esc(p.newValue)}</b> (${esc(p.foundSource || p.currentSource || '')}) ${btn(signedLink(p.id, 'revert'), `Revert`, 'ghost')}</p>`).join('')}` : ''}
${isFriday ? fridayJobs() : ''}
${isMonday ? `<h3 style="font:800 13px/1 -apple-system,Arial;letter-spacing:.1em;text-transform:uppercase;margin:28px 0 8px">This week</h3><div style="font-size:14px;line-height:1.5">${monday()}</div>` : ''}
<p style="margin:28px 0 0;font-size:11px;color:#999">Links are valid for 7 days. Sent by automation/digest.mjs.</p></div>`;

const subject = `${heldDaily ? '⏸ Daily held · ' : ''}Review · ${total ? `${total} item${total === 1 ? '' : 's'}${needs.length ? ` (${needs.length} to check)` : ''}` : 'nothing waiting'} · ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;

if (args.preview) { writeFileSync(String(args.preview === true ? 'review-preview.html' : args.preview), html); console.log(`preview: ${args.preview}`); }
console.log(`${subject}\n  needs a look: ${needs.map((c) => c.title.slice(0, 50)).join(' | ') || '-'}\n  ready: ${clean.length} · fyi: ${fyi.length} · revising: ${revising.length} · auto-updated: ${autoApplied.length}`);
const worthSending = total || fyi.some((c) => c.info.length) || revising.length || isMonday;
if (args.dry || !worthSending) { if (!worthSending) console.log('Nothing to review and not Monday: no email.'); }
else if (!RESEND || !TO) console.log(`[dry-run] no RESEND_API_KEY / INTEL_REVIEWER_EMAIL, email not sent`);
else {
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: TO, subject, html }) });
  console.log(r.ok ? `✓ review email sent to ${TO}` : `! email failed: ${r.status} ${await r.text()}`);
}
