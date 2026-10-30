/**
 * Shared bits for the review loop (30 Oct 2026): signed one-tap links, the queue folder,
 * GitHub edit links, the review-digest switch. Used by digest.mjs, revise.mjs,
 * daily-trust.mjs, daily-release.mjs and the per-engine queue writers.
 *
 * One queue: automation/intel-queue/<id>.json. Every item has {id, kind, status, title,
 * createdAt}. Kinds: article · evidence · flagship · deal · daily · press (press items live
 * in automation/press-queue/, id "press-<file>") · figure proposals (kind "changed" /
 * "review-due", written by intelligence-refresh.mjs).
 * Statuses the Worker can set: approved · rejected · flagged · revise (with notes[]).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const QUEUE = join(__dirname, 'intel-queue');
export const PRESS_QUEUE = join(__dirname, 'press-queue');
export const SECRET = process.env.INTEL_SIGNING_SECRET || 'dev-secret-change-me';
export const WORKER = (process.env.INTEL_WORKER_URL || 'https://pr.sqwod.life').replace(/\/$/, '');
export const REPO = process.env.GITHUB_REPOSITORY || 'teemajor/sqwod-life';

/** True when the single daily review email replaces the engines' own emails. */
export const digestMode = () => process.env.REVIEW_DIGEST === '1';

export function signedLink(id, action, { days = 7, now = Date.now() } = {}) {
  const exp = Math.floor(now / 1000) + days * 86400;
  const sig = createHmac('sha256', SECRET).update(`${id}.${action}.${exp}`).digest('hex');
  return `${WORKER}/intel?id=${encodeURIComponent(id)}&action=${action}&exp=${exp}&sig=${sig}`;
}
/** The Note form (GET shows a text box, POST saves it). Same signature scheme, action "note". */
export const noteLink = (id, opts) => signedLink(id, 'note', opts).replace('/intel?', '/note?');

/** GitHub's web editor for a repo file (works on a phone when signed in to GitHub). */
export const editLink = (path) => `https://github.com/${REPO}/edit/main/${path.split('/').map(encodeURIComponent).join('/')}`;
export const viewLink = (path) => `https://github.com/${REPO}/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
export const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

/** Every queue item, with its file path. */
export function queueItems() {
  if (!existsSync(QUEUE)) return [];
  return readdirSync(QUEUE).filter((f) => f.endsWith('.json')).map((f) => {
    const path = join(QUEUE, f); const p = readJson(path, null);
    return p ? { ...p, id: p.id || f.replace(/\.json$/, ''), _path: path } : null;
  }).filter(Boolean);
}
/** Press submissions, mapped into the same shape (id "press-<file>"). */
export function pressItems() {
  if (!existsSync(PRESS_QUEUE)) return [];
  return readdirSync(PRESS_QUEUE).filter((f) => f.endsWith('.json')).map((f) => {
    const path = join(PRESS_QUEUE, f); const p = readJson(path, null);
    return p ? { ...p, kind: 'press', id: `press-${f.replace(/\.json$/, '')}`, title: p.headline, _path: path } : null;
  }).filter(Boolean);
}

/** Frontmatter helpers for the markdown drafts. */
export const fmOf = (raw) => (raw.split(/^---\s*$/m)[1] || '');
export const fmField = (raw, k) => { const m = fmOf(raw).match(new RegExp(`^${k}:\\s*(.+)$`, 'm')); if (!m) return ''; const v = m[1].trim(); try { return v.startsWith('"') ? JSON.parse(v) : v; } catch { return v.replace(/^"|"$/g, ''); } };
export const bodyOf = (raw) => raw.split(/^---\s*$/m).slice(2).join('---').trim();
export const sourcesOf = (raw) => [...fmOf(raw).matchAll(/label:\s*"([^"]*)"[\s\S]*?url:\s*"([^"]+)"/g)].map((m) => ({ label: m[1], url: m[2] }));

/** Berlin wall-clock parts for "now" (or a given Date). */
export function berlin(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}

/** Minimal Claude call (same pattern as deals.mjs). Returns '' on failure. */
export async function claude(prompt, { maxTokens = 8000, tools = null, model = process.env.SQWOD_MODEL || 'claude-sonnet-4-6' } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
      if (tools) body.tools = tools;
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    } catch (e) { console.error(`  · model retry ${attempt}/3: ${e.message}`); if (attempt < 3) await new Promise((x) => setTimeout(x, attempt * 3000)); }
  }
  return '';
}
export const parseJson = (t) => { try { return JSON.parse(String(t).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };
