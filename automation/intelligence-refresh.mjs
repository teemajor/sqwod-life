#!/usr/bin/env node
/**
 * sqwod.life — Intelligence living-report refresher (human-in-the-loop).
 *
 * A machine may DETECT a stale/changed figure, but only a human may PUBLISH a
 * new number. No silent edits to a factual report.
 *
 *   --scan   (default)  for every figure DUE by its cadence: fetch the source,
 *                       extract a candidate value, and if it changed (or can't
 *                       be auto-verified) draft a PROPOSAL in automation/intel-queue/
 *                       and email you Approve/Reject buttons. Bumps lastChecked.
 *   --apply             apply every proposal a human marked "approved" (the Worker
 *                       flips the status on tap): update the figure in EN + DE,
 *                       append a changelog entry, bump updatedAt. Discards "rejected".
 *
 * Dry-run safe: without ANTHROPIC_API_KEY extraction degrades to a "review-due"
 * nudge (never invents a number); without RESEND_API_KEY it logs the email +
 * signed links instead of sending. Nothing is published until --apply runs on an
 * approved proposal.
 *
 * Env:
 *   ANTHROPIC_API_KEY     enable source extraction (else: review-due nudges)
 *   RESEND_API_KEY        send the approval email (Resend /emails). else log-only
 *   RESEND_FROM           verified sender, e.g. "Sqwod Intelligence <intel@sqwod.life>"
 *   INTEL_REVIEWER_EMAIL  where proposals are sent (you)
 *   INTEL_SIGNING_SECRET  HMAC secret shared with the Worker (signs the buttons)
 *   INTEL_WORKER_URL      Worker base, e.g. https://pr.sqwod.life
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(__dirname, 'intel-sources.json');
const QUEUE = join(__dirname, 'intel-queue');
const ARTICLES = join(__dirname, '..', 'site', 'src', 'content', 'articles');
const LANGS = ['en', 'de'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = args.date || new Date().toISOString().slice(0, 10);
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';
const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');

const daysBetween = (a, b) => Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);

// ---- signed Approve/Reject links (HMAC; the Worker verifies) -------------
function signedLink(id, action, ttlDays = 14) {
  const exp = Math.floor(Date.parse(today) / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}

// ---- source extraction (best-effort; null → human review) ----------------
async function extract(fig) {
  if (!apiKey) return { kind: 'review-due', snippet: '(no extractor key — please verify manually)', confidence: 'n/a' };
  let page = '';
  try {
    const r = await fetch(fig.sourceUrl, { headers: { 'user-agent': 'Mozilla/5.0 SqwodIntelligenceBot' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    page = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
  } catch (e) {
    return { kind: 'review-due', snippet: `(couldn't fetch source: ${e.message})`, confidence: 'n/a' };
  }
  const prompt = `From the page text below, find the CURRENT value of the metric "${fig.label}". Our last recorded value was "${fig.value}". Respond ONLY minified JSON: {"found":true|false,"value":"the value as it would be written, same units/format as our recorded value, or empty","snippet":"the <=160-char sentence from the page that supports it"}. If the metric isn't clearly stated, found=false. Never guess.\n\nPAGE:\n${page}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const data = await r.json();
    const o = JSON.parse((data.content?.[0]?.text || '{}').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if (!o.found || !o.value) return { kind: 'review-due', snippet: '(value not found on page — please verify)', confidence: 'low' };
    const norm = (s) => String(s).replace(/[\s~]/g, '').toLowerCase();
    if (norm(o.value) === norm(fig.value)) return { kind: 'unchanged', value: o.value, snippet: o.snippet };
    return { kind: 'changed', value: o.value, snippet: o.snippet, confidence: 'high' };
  } catch (e) {
    return { kind: 'review-due', snippet: `(extractor error: ${e.message})`, confidence: 'n/a' };
  }
}

// ---- email (Resend transactional; log-only without a key) ----------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function emailHtml(proposals) {
  const cards = proposals.map((p) => `
    <table width="100%" style="border:1px solid #2a2a30;border-radius:12px;background:#161619;margin:0 0 16px"><tr><td style="padding:18px 20px">
      <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.12em;text-transform:uppercase;color:#85858e">${esc(p.report)} · ${esc(p.kind === 'changed' ? 'figure changed' : 'review due')}</div>
      <div style="font:700 17px/1.4 -apple-system,Arial;color:#FAFAFA;margin:8px 0 4px">${esc(p.label)}</div>
      <div style="font:600 22px/1.3 ui-monospace,Menlo,monospace;color:#FAFAFA;margin:6px 0">${esc(p.oldValue)} ${p.newValue ? `&rarr; <span style="color:#4ade80">${esc(p.newValue)}</span>` : '<span style="color:#85858e">&rarr; (please verify)</span>'}</div>
      <div style="font:400 13px/1.5 -apple-system,Arial;color:#b8b8c0;margin:8px 0 4px">${esc(p.snippet)}</div>
      <a href="${esc(p.sourceUrl)}" style="font:600 12px/1 -apple-system,Arial;color:#85858e">source &#8599;</a>
      <div style="margin-top:16px">
        <a href="${esc(p.approve)}" style="display:inline-block;background:#FAFAFA;color:#0e0e10;text-decoration:none;font:800 14px/1 -apple-system,Arial;padding:12px 20px;border-radius:9px;margin-right:8px">&#10003; Approve</a>
        <a href="${esc(p.reject)}" style="display:inline-block;border:1px solid #2a2a30;color:#b8b8c0;text-decoration:none;font:700 14px/1 -apple-system,Arial;padding:12px 20px;border-radius:9px">&#10007; Reject</a>
      </div>
    </td></tr></table>`).join('');
  return `<div style="background:#0e0e10;padding:28px 0"><div style="max-width:560px;margin:0 auto;padding:0 20px">
    <div style="font:800 22px/1 -apple-system,Arial;color:#FAFAFA;letter-spacing:-.02em;margin-bottom:4px">SQWOD<span style="color:#85858e">.life</span></div>
    <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.16em;text-transform:uppercase;color:#85858e;margin-bottom:20px">Intelligence · refresh proposals</div>
    <div style="font:400 14px/1.5 -apple-system,Arial;color:#b8b8c0;margin-bottom:20px">${proposals.length} figure(s) due. Approve to update the report (changelog + date auto-logged); reject to discard. Nothing changes until you tap.</div>
    ${cards}
    <div style="font:400 11px/1.5 -apple-system,Arial;color:#52525a;margin-top:8px">Buttons are single-use, signed, and expire in 14 days.</div>
  </div></div>`;
}
async function sendEmail(proposals) {
  const html = emailHtml(proposals);
  if (!RESEND || !REVIEWER) {
    console.log(`\n[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'} — ${proposals.length} proposal(s). Approve links:`);
    proposals.forEach((p) => console.log(`  · ${p.label}: ${p.approve}`));
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: REVIEWER, subject: `Sqwod Intelligence — ${proposals.length} figure(s) to review`, html }),
  });
  console.log(r.ok ? `✓ emailed ${proposals.length} proposal(s) to ${REVIEWER}` : `! email failed (${r.status}): ${(await r.text()).slice(0, 160)}`);
}

// ---- frontmatter apply (EN + DE in parity) -------------------------------
const deValue = (v) => v.replace(/(\d),(\d{3})/g, '$1.$2').replace(/(\d)\.(\d)/g, '$1,$2'); // 67.1% → 67,1%
function applyToReport(slug, index, newValue, note) {
  for (const lang of LANGS) {
    const path = join(ARTICLES, `${slug}.${lang}.md`);
    if (!existsSync(path)) continue;
    let src = readFileSync(path, 'utf8');
    const val = lang === 'de' ? deValue(newValue) : newValue;
    // replace the value on the index-th figure line
    let n = -1;
    src = src.replace(/^(\s*-\s*\{\s*label:.*?value:\s*)"(?:[^"\\]|\\.)*"(.*\}\s*)$/gm, (m, pre, post) => {
      n += 1; return n === index ? `${pre}"${val}"${post}` : m;
    });
    // newest-first changelog entry
    const noteLang = lang === 'de' ? note.de : note.en;
    src = src.replace(/^changelog:\s*$/m, `changelog:\n  - { date: "${today}", note: "${noteLang.replace(/"/g, '\\"')}" }`);
    src = src.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${today}`);
    writeFileSync(path, src);
  }
}

// ---- SCAN ----------------------------------------------------------------
async function scan() {
  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  mkdirSync(QUEUE, { recursive: true });
  const proposals = [];
  for (const [slug, rep] of Object.entries(reg.reports)) {
    for (const fig of rep.figures) {
      const age = daysBetween(today, fig.lastChecked);
      if (age < fig.cadenceDays) { console.log(`· ${slug}/${fig.label}: ${age}d old (< ${fig.cadenceDays}) — not due`); continue; }
      const c = await extract(fig);
      fig.lastChecked = today;
      if (c.kind === 'unchanged') { console.log(`· ${slug}/${fig.label}: unchanged (${c.value}) — bumped lastChecked`); continue; }
      const id = `intel-${slug}-${fig.index}-${today}`;
      const prop = {
        id, report: slug, index: fig.index, label: fig.label,
        oldValue: fig.value, newValue: c.kind === 'changed' ? c.value : null,
        sourceUrl: fig.sourceUrl, snippet: c.snippet, confidence: c.confidence, kind: c.kind,
        status: 'pending', createdAt: today,
      };
      writeFileSync(join(QUEUE, `${id}.json`), JSON.stringify(prop, null, 2));
      proposals.push({ ...prop, approve: signedLink(id, 'approve'), reject: signedLink(id, 'reject') });
      console.log(`✎ proposal ${id}: ${fig.value} → ${prop.newValue ?? '(review)'} [${c.kind}]`);
    }
  }
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  if (proposals.length) await sendEmail(proposals);
  else console.log('No figures due / changed. Nothing to propose.');
}

// ---- APPLY (only human-approved proposals) -------------------------------
function apply() {
  if (!existsSync(QUEUE)) { console.log('No queue.'); return; }
  const files = readdirSync(QUEUE).filter((f) => f.endsWith('.json'));
  let applied = 0;
  for (const f of files) {
    const path = join(QUEUE, f);
    const p = JSON.parse(readFileSync(path, 'utf8'));
    if (p.status === 'approved' && p.newValue) {
      const note = {
        en: `Refreshed "${p.label}" ${p.oldValue} → ${p.newValue} from source (approved).`,
        de: `"${p.label}" aktualisiert: ${deValue(p.oldValue)} → ${deValue(p.newValue)} laut Quelle (freigegeben).`,
      };
      applyToReport(p.report, p.index, p.newValue, note);
      // keep the registry value in sync so the next scan compares against the new number
      const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
      const fig = reg.reports[p.report]?.figures.find((x) => x.index === p.index);
      if (fig) { fig.value = p.newValue; writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n'); }
      p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2));
      applied++; console.log(`✓ applied ${p.id}: ${p.oldValue} → ${p.newValue}`);
    } else if (p.status === 'rejected') {
      p.status = 'discarded'; writeFileSync(path, JSON.stringify(p, null, 2));
      console.log(`· discarded ${p.id}`);
    }
  }
  console.log(applied ? `Applied ${applied} approved change(s).` : 'No approved proposals to apply.');
}

const mode = args.apply ? 'apply' : 'scan';
console.log(`Intelligence refresh · ${today} · mode=${mode}${apiKey ? '' : ' · no extractor key (review-due)'}${RESEND ? '' : ' · email log-only'}`);
if (mode === 'apply') apply(); else await scan();
