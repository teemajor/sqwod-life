#!/usr/bin/env node
/**
 * One-tap review for lane articles (27 Oct 2026). Nothing from articles.mjs reaches the site
 * until Tee taps "Approve & publish" in the email. Approved pieces carry his byline.
 *
 *   node automation/article-review.mjs --queue    # after articles.mjs: hold new drafts, email Tee
 *   node automation/article-review.mjs --apply    # publish approved / archive rejected (intel-apply.yml)
 *
 * Flow: articles.mjs writes site/src/content/articles/<slug>.{en,de}.md -> --queue moves the
 * pair to automation/article-drafts/ and writes automation/intel-queue/article-<slug>.json
 * (status "pending") -> the email's signed links let the pr-intake Worker flip that status ->
 * the 4-hourly apply job moves approved drafts back, dated that day, author "Tee Major".
 *
 * Env: RESEND_API_KEY, RESEND_FROM, INTEL_REVIEWER_EMAIL, INTEL_SIGNING_SECRET, INTEL_WORKER_URL
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { phraseProblems } from './quality.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES = join(ROOT, 'site', 'src', 'content', 'articles');
const DRAFTS = join(__dirname, 'article-drafts');
// Evidence playbooks (30 Oct 2026) wait in their own drafts folder; the weekly evidence task writes them there
// with a queue item evidence-<slug>.json, and --apply publishes them the same way as articles.
const DRAFTS_BY_KIND = { article: DRAFTS, evidence: join(__dirname, 'evidence-drafts') };
const QUEUE = join(__dirname, 'intel-queue');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = args.date || new Date().toISOString().slice(0, 10);
const RESEND = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM || 'Sqwod Intelligence <intel@sqwod.life>';
const REVIEWER = process.env.INTEL_REVIEWER_EMAIL || '';
const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');
const EDITOR = 'Tee Major';

const fm = (raw) => (raw.split(/^---\s*$/m)[1] || '');
const field = (raw, k) => { const m = fm(raw).match(new RegExp(`^${k}:\\s*(.+)$`, 'm')); if (!m) return ''; const v = m[1].trim(); try { return v.startsWith('"') ? JSON.parse(v) : v; } catch { return v; } };
const body = (raw) => raw.split(/^---\s*$/m).slice(2).join('---').trim();
const sources = (raw) => [...fm(raw).matchAll(/label:\s*"([^"]*)"[\s\S]*?url:\s*"([^"]+)"/g)].map((m) => ({ label: m[1], url: m[2] }));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function signedLink(id, action, ttlDays = 30) {
  const exp = Math.floor(Date.parse(today) / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}

/** New lane-article pairs this run wrote: untracked files in the articles folder. */
function newPairs() {
  let out = '';
  try { out = execSync('git ls-files --others --exclude-standard site/src/content/articles', { cwd: ROOT, encoding: 'utf8' }); } catch { return []; }
  const slugs = new Set(out.split('\n').map((p) => p.trim().split('/').pop()).filter((f) => /\.(en|de)\.md$/.test(f)).map((f) => f.replace(/\.(en|de)\.md$/, '')));
  return [...slugs].filter((s) => existsSync(join(ARTICLES, `${s}.en.md`)) && field(readFileSync(join(ARTICLES, `${s}.en.md`), 'utf8'), 'format') === 'analysis');
}

/** Plain checks Tee sees on the card: is every source about the lead story? */
function checks(raw) {
  const title = field(raw, 'title'); const src = sources(raw); const warn = [];
  const names = (title.match(/[A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+)*/g) || []).map((n) => n.toLowerCase()).filter((n) => n.length > 2);
  const off = src.filter((s) => !names.some((n) => `${s.label} ${s.url}`.toLowerCase().includes(n.split(' ')[0])));
  if (src.length < 2) warn.push(`Only ${src.length} source.`);
  if (off.length && off.length >= Math.ceil(src.length / 2)) warn.push(`${off.length} of ${src.length} sources do not mention the company in the title. Check they belong.`);
  warn.push(...phraseProblems(body(raw)).slice(0, 3));
  return warn;
}

async function email(item, en, de) {
  if (process.env.REVIEW_DIGEST === '1') { console.log(`→ ${item.title}: goes into the morning review email`); return; }
  const btn = (href, label, quiet) => `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;margin:4px 6px 4px 0;${quiet ? 'border:1px solid #999;color:#333' : 'background:#111;color:#fff'}">${label}</a>`;
  const warn = checks(en);
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#111">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod article · waiting for your approval</p>
<h2 style="margin:4px 0 6px">${esc(field(en, 'title'))}</h2>
<p style="color:#444;margin:0 0 4px">${esc(field(en, 'description'))}</p>
<p style="color:#777;font-size:13px;margin:0 0 12px">DE: ${esc(field(de, 'title'))}</p>
${warn.length ? `<p style="color:#b45309;margin:0"><b>Check before approving:</b></p><ul style="color:#b45309">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p style="color:#15803d">Every source mentions the company in the title.</p>'}
<p>${btn(signedLink(item.id, 'approve'), 'Approve & publish')}${btn(signedLink(item.id, 'reject'), 'Reject', true)}</p>
<p style="font-size:12px;color:#777">Approve = EN + DE go live with your byline within 4 hours. Reject = archived, never published. Links valid 30 days.</p>
<hr style="border:0;border-top:1px solid #ddd;margin:16px 0">
<div style="white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(body(en))}</div>
<p style="font-size:13px"><b>Sources</b><br>${sources(en).map((s) => `<a href="${esc(s.url)}">${esc(s.label)}</a>`).join('<br>')}</p></div>`;
  if (!RESEND || !REVIEWER) { console.log(`[dry-run] would email ${REVIEWER || '(no INTEL_REVIEWER_EMAIL)'}: ${item.title}\n  ${warn.join(' | ')}`); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: REVIEWER, subject: `📝 Approve article: ${item.title}`, html }) });
  console.log(r.ok ? `Emailed review card: ${item.title}` : `! email failed: ${r.status} ${await r.text()}`);
}

async function queue() {
  mkdirSync(DRAFTS, { recursive: true }); mkdirSync(QUEUE, { recursive: true });
  const pairs = newPairs();
  if (!pairs.length) { console.log('No new articles to review.'); return; }
  for (const slug of pairs) {
    const en = readFileSync(join(ARTICLES, `${slug}.en.md`), 'utf8');
    const deP = join(ARTICLES, `${slug}.de.md`); const de = existsSync(deP) ? readFileSync(deP, 'utf8') : '';
    for (const l of ['en', 'de']) { const p = join(ARTICLES, `${slug}.${l}.md`); if (existsSync(p)) renameSync(p, join(DRAFTS, `${slug}.${l}.md`)); }
    const item = { id: `article-${slug}`, kind: 'article', status: 'pending', title: field(en, 'title'), slug, createdAt: today };
    writeFileSync(join(QUEUE, `${item.id}.json`), JSON.stringify(item, null, 2) + '\n');
    console.log(`· held for review: ${slug}`);
    await email(item, en, de);
  }
}

function apply() {
  if (!existsSync(QUEUE)) { console.log('No queue.'); return; }
  let n = 0;
  for (const f of readdirSync(QUEUE).filter((f) => /^(article|evidence)-/.test(f) && f.endsWith('.json'))) {
    const path = join(QUEUE, f); const p = JSON.parse(readFileSync(path, 'utf8'));
    const DRAFTS = DRAFTS_BY_KIND[p.kind] || DRAFTS_BY_KIND.article;
    const files = ['en', 'de'].map((l) => join(DRAFTS, `${p.slug}.${l}.md`)).filter(existsSync);
    if (p.status === 'approved' && files.length) {
      for (const src of files) {
        const t = readFileSync(src, 'utf8').replace(/^publishedAt: .*$/m, `publishedAt: ${today}`).replace(/^updatedAt: .*$/m, `updatedAt: ${today}`)
          .replace(/^asOf: .*$/m, `asOf: ${JSON.stringify(today)}`).replace(/^author: .*$/m, `author: ${JSON.stringify(EDITOR)}`);
        writeFileSync(join(ARTICLES, src.split('/').pop()), t);
        mkdirSync(join(DRAFTS, '_published'), { recursive: true }); renameSync(src, join(DRAFTS, '_published', src.split('/').pop()));
      }
      p.status = 'applied'; p.appliedAt = today; writeFileSync(path, JSON.stringify(p, null, 2) + '\n'); n++;
      console.log(`✓ published ${p.slug} (EN + DE, byline ${EDITOR})`);
    } else if (p.status === 'rejected' && files.length) {
      mkdirSync(join(DRAFTS, '_rejected'), { recursive: true });
      for (const src of files) renameSync(src, join(DRAFTS, '_rejected', src.split('/').pop()));
      p.status = 'archived'; writeFileSync(path, JSON.stringify(p, null, 2) + '\n'); n++;
      console.log(`· archived ${p.slug}`);
    }
  }
  console.log(n ? `${n} article(s) processed` : 'No article approved or rejected.');
}

if (args.check) { for (const f of String(args.check).split(',')) console.log(f, checks(readFileSync(f, 'utf8'))); }
else if (args.apply) apply(); else await queue();
