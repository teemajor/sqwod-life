#!/usr/bin/env node
/**
 * sqwod.life — Intelligence living-report refresher (human-in-the-loop).
 *
 * A machine may DETECT a stale/changed figure, but only a human may PUBLISH a
 * new number. No silent edits to a factual report.
 *
 *   --scan   (default)  for every figure DUE by its cadence: WEB-SEARCH for the
 *                       current authoritative value (not just re-read one URL),
 *                       and if it changed (or can't be auto-verified) draft a
 *                       PROPOSAL in automation/intel-queue/ and email you a set of
 *                       one-tap actions. Bumps lastChecked.
 *   --apply             execute every proposal a human acted on (the Worker flips
 *                       the status on tap). Action set:
 *                         approved        → Update value (same source) in EN+DE
 *                         replace-approved→ Replace value AND source/url in EN+DE
 *                         remove-approved → Remove the figure (explicit 2-tap only)
 *                         rejected        → Keep / dismiss (figure untouched)
 *                         flagged         → Review later (figure untouched)
 *                       Each writes a changelog entry + bumps updatedAt; the
 *                       registry is kept in sync.
 *
 * Dry-run safe: without ANTHROPIC_API_KEY extraction degrades to a "review-due"
 * nudge (never invents a number); without RESEND_API_KEY it logs the email +
 * signed links instead of sending. Nothing is published until --apply runs on a
 * human-acted proposal. A figure is NEVER removed except by the explicit, two-tap
 * Remove action — Keep / Review / Dismiss always leave the figure exactly as-is.
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

// ---- source verification via web search (best-effort; null → human review) -
// Actively SEARCHES for the current authoritative value rather than re-reading
// one fixed URL — so a source that published a newer year/edition is caught.
const SEARCH_TOOL = process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209'; // basic: web_search_20250305
const norm = (s) => String(s).replace(/[\s~≈]/g, '').toLowerCase();
const firstWord = (s) => String(s || '').toLowerCase().split(/[\s—,(]/)[0];

async function extract(fig) {
  if (!apiKey) return { kind: 'review-due', snippet: '(no extractor key — please verify manually)', confidence: 'n/a' };
  const prompt = `You verify ONE published statistic for a fitness-industry intelligence report. Use web search to find its CURRENT value from a named, authoritative source.

Metric: "${fig.label}"
Currently published value: "${fig.value}"
Currently cited source: ${fig.sourceLabel || '(none)'} ${fig.sourceUrl ? `(${fig.sourceUrl})` : ''}

Search for the most recent figure stated by a NAMED authority (the original research firm, trade body, company, or government body — never a blog that re-quotes them). Prefer the source we already cite if it has refreshed its number; otherwise use the most credible newer source you find. The value must be a single source's actual published number — never a blend, average, or your own estimate.

Respond with ONLY minified JSON, no prose, no code fence:
{"found":true|false,"value":"current value in the SAME units/format as our published value, or empty","sourceLabel":"named source e.g. 'GMInsights' or 'IDC'","sourceUrl":"exact URL the number is stated on","year":"year/edition the figure refers to, or empty","snippet":"<=160-char quote/sentence from the source stating it","sameSource":true|false}
If you cannot find the metric clearly stated by a named source, set found=false. Never guess a number.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1200,
        tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 140)}`);
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { kind: 'review-due', snippet: '(search returned no parseable result — please verify)', confidence: 'low' };
    const o = JSON.parse(m[0]);
    if (!o.found || !o.value) return { kind: 'review-due', snippet: '(no authoritative figure found by search — please verify)', confidence: 'low' };
    let foundDomain = ''; try { foundDomain = new URL(o.sourceUrl).hostname.replace(/^www\./, ''); } catch {}
    const base = { value: String(o.value), snippet: o.snippet || '', foundSource: o.sourceLabel || '', foundUrl: o.sourceUrl || '', foundDomain, year: o.year || '' };
    if (norm(o.value) === norm(fig.value)) return { kind: 'unchanged', ...base };
    // Same source updated its number → "update". A different authority states it → "replace".
    const sameSource = o.sameSource === true
      || (o.sourceLabel && fig.sourceLabel && firstWord(o.sourceLabel) === firstWord(fig.sourceLabel));
    return { kind: 'changed', changeType: sameSource ? 'update' : 'replace', confidence: 'high', ...base };
  } catch (e) {
    return { kind: 'review-due', snippet: `(search/extractor error: ${e.message})`, confidence: 'n/a' };
  }
}

// ---- email (Resend transactional; log-only without a key) ----------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const row = (l, v) => `<div style="font:400 13px/1.6 -apple-system,Arial;color:#b8b8c0;margin:2px 0"><span style="color:#85858e">${l}:</span> ${v}</div>`;
const btnPrimary = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#FAFAFA;color:#0e0e10;text-decoration:none;font:800 14px/1 -apple-system,Arial;padding:12px 18px;border-radius:9px;margin:0 8px 8px 0">${label}</a>`;
const btnGhost = (href, label) => `<a href="${esc(href)}" style="display:inline-block;border:1px solid #2a2a30;color:#b8b8c0;text-decoration:none;font:700 13px/1 -apple-system,Arial;padding:11px 14px;border-radius:9px;margin:0 6px 8px 0">${label}</a>`;
const btnDanger = (href, label) => `<a href="${esc(href)}" style="display:inline-block;border:1px solid #4a2530;color:#e0a0ac;text-decoration:none;font:700 13px/1 -apple-system,Arial;padding:11px 14px;border-radius:9px;margin:0 6px 8px 0">${label}</a>`;
function emailHtml(proposals) {
  const cards = proposals.map((p) => {
    const changed = p.kind === 'changed' && p.newValue;
    const replace = changed && p.changeType === 'replace';
    const tag = !changed ? 'Needs a manual look' : replace ? 'A newer source has this number' : 'A number changed — review';
    const foundLine = `Found ${esc(p.foundSource || p.checkedDomain)}${p.foundYear ? ` (${esc(p.foundYear)})` : ''}`;
    const cur = `${row('On sqwod.life now', `<b style="color:#FAFAFA">${esc(p.oldValue)}</b>`)}${row('Your cited source', esc(p.currentSource || '—'))}`;
    // Action buttons every card carries: Review (flag), Remove (2-tap), Keep (dismiss).
    const secondary = `${btnGhost(p.review, 'Review later')}${btnDanger(p.remove, 'Remove figure')}${btnGhost(p.reject, `Keep ${esc(p.oldValue)}`)}`;
    const body = changed
      ? `${cur}
         ${row(foundLine, `<b style="color:#fbbf24">${esc(p.newValue)}</b>`)}
         <div style="font:400 12.5px/1.55 -apple-system,Arial;color:#85858e;margin:8px 0;padding:8px 12px;border-left:2px solid #2a2a30">"${esc(p.snippet)}"</div>
         ${row('Reliability', esc(p.reliability))}
         ${row('Suggestion', `<span style="color:#ededf0">${esc(p.recommendation)}</span>`)}
         <div style="margin-top:16px">
           ${replace
             ? btnPrimary(p.replace, `Replace with ${esc(p.newValue)} · ${esc(p.foundSource)}`)
             : btnPrimary(p.approve, `Update to ${esc(p.newValue)}`)}
           ${btnGhost(p.checkedUrl, 'Open source &#8599;')}
         </div>
         <div style="margin-top:2px">${secondary}</div>`
      : `${cur}
         <div style="font:400 13px/1.55 -apple-system,Arial;color:#b8b8c0;margin:10px 0 2px">Search couldn't confirm a figure automatically (${esc(p.snippet)}).</div>
         <div style="font:400 13px/1.55 -apple-system,Arial;color:#b8b8c0;margin:2px 0">Your <b style="color:#FAFAFA">${esc(p.oldValue)}</b> stays unless you act — open the source and decide.</div>
         <div style="margin-top:16px">
           ${btnPrimary(p.checkedUrl, 'Open source &#8599;')}
         </div>
         <div style="margin-top:2px">${secondary}</div>`;
    return `<table width="100%" style="border:1px solid #2a2a30;border-radius:12px;background:#161619;margin:0 0 16px"><tr><td style="padding:18px 20px">
      <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.12em;text-transform:uppercase;color:${changed ? '#fbbf24' : '#85858e'}">${esc(p.report)} · ${tag}</div>
      <div style="font:700 17px/1.4 -apple-system,Arial;color:#FAFAFA;margin:8px 0 10px">${esc(p.label)}</div>
      ${body}
    </td></tr></table>`;
  }).join('');
  return `<div style="background:#0e0e10;padding:28px 0"><div style="max-width:580px;margin:0 auto;padding:0 20px">
    <div style="font:800 22px/1 -apple-system,Arial;color:#FAFAFA;letter-spacing:-.02em;margin-bottom:4px">SQWOD<span style="color:#85858e">.life</span></div>
    <div style="font:700 11px/1 -apple-system,Arial;letter-spacing:.16em;text-transform:uppercase;color:#85858e;margin-bottom:18px">Intelligence · figures to review</div>
    <div style="font:400 14px/1.55 -apple-system,Arial;color:#b8b8c0;margin-bottom:20px">Each figure was re-checked against a live web search. Your options per figure:
      <br><b style="color:#FAFAFA">Update</b> — change the number (same source). <b style="color:#FAFAFA">Replace</b> — change the number <i>and</i> swap to the source that now states it. <b style="color:#FAFAFA">Review later</b> — flag it for a manual look, nothing changes. <b style="color:#e0a0ac">Remove</b> — delete the figure (asks you to confirm). <b style="color:#FAFAFA">Keep</b> — leave it exactly as-is. Every change writes a changelog entry + fresh date.</div>
    ${cards}
    <div style="font:400 11px/1.5 -apple-system,Arial;color:#52525a;margin-top:8px">Buttons are single-use, signed, and expire in 14 days. Nothing publishes until you tap an action — and a figure is only ever removed by the explicit two-tap Remove.</div>
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
// Set (or insert) a "key: \"value\"" field on a single figure line.
function setField(line, key, val) {
  const re = new RegExp(`(${key}:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  const v = String(val).replace(/"/g, '\\"');
  if (re.test(line)) return line.replace(re, `$1"${v}"`);
  return line.replace(/\s*\}\s*$/, `, ${key}: "${v}" }`); // insert before closing brace
}
// Walk ONLY the frontmatter `figures:` block (not `sources:`, which also has
// `label:`). fn(line, idx) returns the rewritten line, or null to drop it.
function editFiguresBlock(src, fn) {
  const out = [];
  let inBlock = false, idx = -1;
  for (const line of src.split('\n')) {
    if (/^figures:\s*$/.test(line)) { inBlock = true; out.push(line); continue; }
    if (inBlock) {
      if (/^\s*-\s*\{\s*label:/.test(line)) { idx += 1; const r = fn(line, idx); if (r !== null) out.push(r); continue; }
      if (/^\S/.test(line)) inBlock = false; // a top-level key ends the block
    }
    out.push(line);
  }
  return out.join('\n');
}
function prependChangelog(src, noteText) {
  return src.replace(/^changelog:\s*$/m, `changelog:\n  - { date: "${today}", note: "${noteText.replace(/"/g, '\\"')}" }`);
}
// Write a set of figure fields ({value,source,url,…}) onto figure `index`, EN+DE.
function applyFigure(slug, index, fields, note) {
  for (const lang of LANGS) {
    const path = join(ARTICLES, `${slug}.${lang}.md`);
    if (!existsSync(path)) continue;
    let src = readFileSync(path, 'utf8');
    const f = { ...fields };
    if (lang === 'de' && f.value) f.value = deValue(f.value); // localize the number only; source labels/urls are shared
    src = editFiguresBlock(src, (line, i) => {
      if (i !== index) return line;
      let out = line;
      for (const [k, v] of Object.entries(f)) out = setField(out, k, v);
      return out;
    });
    src = prependChangelog(src, lang === 'de' ? note.de : note.en);
    src = src.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${today}`);
    writeFileSync(path, src);
  }
}
// Remove figure `index` entirely, EN+DE. Used ONLY by the explicit two-tap Remove.
function removeFigure(slug, index, note) {
  for (const lang of LANGS) {
    const path = join(ARTICLES, `${slug}.${lang}.md`);
    if (!existsSync(path)) continue;
    let src = readFileSync(path, 'utf8');
    src = editFiguresBlock(src, (line, i) => (i === index ? null : line));
    src = prependChangelog(src, lang === 'de' ? note.de : note.en);
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
      if (!args.force && age < fig.cadenceDays) { console.log(`· ${slug}/${fig.label}: ${age}d old (< ${fig.cadenceDays}) — not due`); continue; }
      const c = await extract(fig);
      fig.lastChecked = today;
      if (c.kind === 'unchanged') { console.log(`· ${slug}/${fig.label}: unchanged (${c.value}) — bumped lastChecked`); continue; }
      const id = `intel-${slug}-${fig.index}-${today}`;
      let domain = fig.sourceUrl; try { domain = new URL(fig.sourceUrl).hostname.replace(/^www\./, ''); } catch {}
      const changed = c.kind === 'changed';
      const replace = changed && c.changeType === 'replace';
      const foundWhere = c.foundSource || c.foundDomain || domain;
      const reliability = !changed
        ? 'Search could not confirm a figure — verify by hand.'
        : 'Web-search read of a single named source — sanity-check the snippet before publishing.';
      const recommendation = !changed
        ? `Open ${domain} (or search yourself) and decide; your current figure stays until you act.`
        : replace
          ? `${foundWhere} now states this — different from your cited ${fig.sourceLabel || 'source'}. Replace swaps both the number and the citation.`
          : `${foundWhere} updated its number. Confirm the snippet, then Update.`;
      const prop = {
        id, report: slug, index: fig.index, label: fig.label,
        oldValue: fig.value, newValue: changed ? c.value : null,
        changeType: changed ? c.changeType : null,
        currentSource: fig.sourceLabel || '', currentSourceUrl: fig.sourceUrl,
        checkedUrl: c.foundUrl || fig.sourceUrl, checkedDomain: c.foundDomain || domain,
        foundSource: c.foundSource || '', foundUrl: c.foundUrl || '', foundDomain: c.foundDomain || '', foundYear: c.year || '',
        sourceUrl: fig.sourceUrl, snippet: c.snippet, confidence: c.confidence, kind: c.kind,
        reliability, recommendation,
        status: 'pending', createdAt: today,
      };
      writeFileSync(join(QUEUE, `${id}.json`), JSON.stringify(prop, null, 2));
      proposals.push({
        ...prop,
        approve: signedLink(id, 'approve'), replace: signedLink(id, 'replace'),
        review: signedLink(id, 'review'), remove: signedLink(id, 'remove'),
        reject: signedLink(id, 'reject'),
      });
      console.log(`✎ proposal ${id}: ${fig.value} → ${prop.newValue ?? '(review)'} [${c.kind}${replace ? '/replace' : ''}]`);
    }
  }
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  if (proposals.length) await sendEmail(proposals);
  else console.log('No figures due / changed. Nothing to propose.');
}

// ---- APPLY (only human-acted proposals) ----------------------------------
const readReg = () => JSON.parse(readFileSync(REGISTRY, 'utf8'));
const writeReg = (reg) => writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
function apply() {
  if (!existsSync(QUEUE)) { console.log('No queue.'); return; }
  const files = readdirSync(QUEUE).filter((f) => f.endsWith('.json'));
  let applied = 0;
  for (const f of files) {
    const path = join(QUEUE, f);
    const p = JSON.parse(readFileSync(path, 'utf8'));

    // Update — value changes, source stays
    if (p.status === 'approved' && p.newValue) {
      const note = {
        en: `Refreshed "${p.label}" ${p.oldValue} → ${p.newValue} from ${p.foundSource || p.currentSource || 'source'} (approved).`,
        de: `"${p.label}" aktualisiert: ${deValue(p.oldValue)} → ${deValue(p.newValue)} laut ${p.foundSource || p.currentSource || 'Quelle'} (freigegeben).`,
      };
      applyFigure(p.report, p.index, { value: p.newValue }, note);
      const reg = readReg();
      const fig = reg.reports[p.report]?.figures.find((x) => x.index === p.index);
      if (fig) { fig.value = p.newValue; writeReg(reg); }
      p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2));
      applied++; console.log(`✓ updated ${p.id}: ${p.oldValue} → ${p.newValue}`);

    // Replace — value AND citation change to the source that now states it
    } else if (p.status === 'replace-approved' && p.newValue) {
      const fields = { value: p.newValue };
      if (p.foundSource) fields.source = p.foundSource;
      if (p.foundUrl) fields.url = p.foundUrl;
      const src = p.foundSource || 'new source';
      const note = {
        en: `Replaced "${p.label}": ${p.oldValue} (${p.currentSource || 'prior source'}) → ${p.newValue} (${src}); citation updated (approved).`,
        de: `"${p.label}" ersetzt: ${deValue(p.oldValue)} (${p.currentSource || 'vorherige Quelle'}) → ${deValue(p.newValue)} (${src}); Quelle aktualisiert (freigegeben).`,
      };
      applyFigure(p.report, p.index, fields, note);
      const reg = readReg();
      const fig = reg.reports[p.report]?.figures.find((x) => x.index === p.index);
      if (fig) { fig.value = p.newValue; if (p.foundSource) fig.sourceLabel = p.foundSource; if (p.foundUrl) fig.sourceUrl = p.foundUrl; writeReg(reg); }
      p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2));
      applied++; console.log(`✓ replaced ${p.id}: ${p.oldValue} → ${p.newValue} (${src})`);

    // Remove — explicit two-tap only; deletes the figure and re-indexes the registry
    } else if (p.status === 'remove-approved') {
      const note = {
        en: `Removed "${p.label}" (was ${p.oldValue}, ${p.currentSource || 'unsourced'}) — confirmed by hand.`,
        de: `"${p.label}" entfernt (war ${deValue(p.oldValue)}, ${p.currentSource || 'ohne Quelle'}) — manuell bestätigt.`,
      };
      removeFigure(p.report, p.index, note);
      const reg = readReg();
      const rep = reg.reports[p.report];
      if (rep) {
        rep.figures = rep.figures.filter((x) => x.index !== p.index).map((x) => (x.index > p.index ? { ...x, index: x.index - 1 } : x));
        writeReg(reg);
      }
      p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2));
      applied++; console.log(`✓ removed ${p.id}: ${p.label}`);

    // Keep / dismiss — figure untouched
    } else if (p.status === 'rejected') {
      p.status = 'discarded'; writeFileSync(path, JSON.stringify(p, null, 2));
      console.log(`· kept (dismissed) ${p.id}`);

    // Review later — flagged for manual look; figure untouched, kept on record
    } else if (p.status === 'flagged') {
      console.log(`· flagged for manual review ${p.id} (no change)`);
    }
  }
  console.log(applied ? `Applied ${applied} change(s).` : 'No acted proposals to apply.');
}

const mode = args.apply ? 'apply' : 'scan';
console.log(`Intelligence refresh · ${today} · mode=${mode}${apiKey ? '' : ' · no extractor key (review-due)'}${RESEND ? '' : ' · email log-only'}`);
if (mode === 'apply') apply(); else await scan();
