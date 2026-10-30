#!/usr/bin/env node
/**
 * Applies Tee's Notes from the review email (30 Oct 2026).
 *
 *   node automation/revise.mjs [--dry]
 *
 * The Worker's Note form saves {at, text} to the item's notes[] and sets status "revise".
 * This script finds those items and:
 *   article · evidence · flagship · daily  → Claude rewrites the EN + DE files following the
 *       note (same facts, same sources, no new numbers unless the note gives them), the
 *       result is checked (frontmatter intact, slug unchanged, footnotes in range, not
 *       truncated), and the item goes back to "pending" so it returns in the next review
 *       email with "Revised: <what changed>". A held Daily goes straight to "approved"
 *       (a Note on a held Daily means "fix it, then send"); an already-sent Daily only gets
 *       its website copy fixed.
 *   deal   → a web check against the note; corrected fields go into deals-overrides.json,
 *       the deal stays pending for Publish.
 *   figure proposals · press → the note is kept and the item is flagged for a hand fix.
 * If a rewrite fails its checks, nothing changes and the email says why.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, queueItems, pressItems, writeJson, readJson, claude, parseJson, fmField, fmOf, sourcesOf } from './review-lib.mjs';
import { trust } from './daily-trust.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const now = () => new Date().toISOString();

const filesFor = (p) => {
  const dir = { article: 'automation/article-drafts', evidence: 'automation/evidence-drafts', flagship: 'automation/intel-drafts' }[p.kind];
  if (dir) return ['en', 'de'].map((l) => `${dir}/${p.slug}.${l}.md`);
  if (p.kind === 'daily') return ['en', 'de'].map((l) => `site/src/content/daily/${p.date}.${l}.md`);
  return [];
};

/** Checks a rewritten file against the original. Returns '' when fine, else the reason. */
export function checkRewrite(orig, next) {
  if (!/^---\n[\s\S]+?\n---/.test(next)) return 'the frontmatter block is missing';
  const keys = (raw) => [...fmOf(raw).matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]).sort().join(',');
  if (keys(orig) !== keys(next)) return 'the frontmatter fields changed';
  const bad = fmOf(next).split('\n').find((l) => l.trim() && !/^([A-Za-z_][\w-]*:|\s+|-\s)/.test(l));
  if (bad) return `a frontmatter line is not valid YAML ("${bad.slice(0, 40)}")`;
  for (const k of ['urlSlug', 'lang', 'counterpart', 'date']) if (fmField(orig, k) && fmField(orig, k) !== fmField(next, k)) return `"${k}" changed`;
  if (next.length < orig.length * 0.6) return 'the rewrite is much shorter than the original (likely cut off)';
  const n = sourcesOf(next).length;
  const refs = [...next.matchAll(/#source-(\d+)/g)].map((m) => Number(m[1]));
  if (refs.some((r) => r > n)) return `a footnote points past the ${n} sources`;
  if (/—/.test(next) && !/—/.test(orig)) return 'it added em dashes';
  return '';
}

async function rewrite(p, notes) {
  const paths = filesFor(p).filter((f) => existsSync(join(ROOT, f)));
  if (paths.length < 2) return { error: 'the draft files are missing' };
  const [en, de] = paths.map((f) => readFileSync(join(ROOT, f), 'utf8'));
  const prompt = `You are the editor of sqwod.life (fitness industry intelligence for gym owners, coaches and founders). Tee, the publisher, left a note on this ${p.kind === 'daily' ? 'Daily issue' : 'draft'}. Apply it to BOTH the English and the German file.

TEE'S NOTE:
${notes.map((n) => `- ${n.text}`).join('\n')}

RULES
- Change only what the note asks for, plus anything needed to keep EN and DE saying the same thing.
- Keep the frontmatter: same keys, same order, same urlSlug/lang/counterpart/date. Keep the YAML valid (JSON-quoted strings stay JSON-quoted).
- Never invent a fact or a number. Use only what is already in the file and its sources, or what the note itself states. If the note asks for something you cannot back, leave it out and say so under UNRESOLVED.
- Keep every footnote (#source-N) pointing at the right source. Remove a source only if the note asks.
- No em dashes. German in the "du" voice, natural, not translated word for word.
- Return the COMPLETE files, not a diff.

FORMAT (exactly these markers, nothing before or after):
=====EN=====
<full English file>
=====DE=====
<full German file>
=====CHANGED=====
<one or two plain sentences: what you changed>
=====UNRESOLVED=====
<what you could not do, or "nothing">

ENGLISH FILE:
${en}

GERMAN FILE:
${de}`;
  const outText = await claude(prompt, { maxTokens: p.kind === 'flagship' ? 32000 : 16000 });
  const part = (k) => (outText.split(`=====${k}=====`)[1] || '').split(/=====[A-Z]+=====/)[0].trim();
  const nextEn = part('EN') + '\n', nextDe = part('DE') + '\n';
  const why = checkRewrite(en, nextEn) || checkRewrite(de, nextDe);
  if (!outText) return { error: 'the model did not answer (check ANTHROPIC_API_KEY)' };
  if (why) return { error: `the rewrite failed a check: ${why}` };
  if (!args.dry) { writeFileSync(join(ROOT, paths[0]), nextEn); writeFileSync(join(ROOT, paths[1]), nextDe); }
  return { changed: part('CHANGED'), unresolved: /^nothing\.?$/i.test(part('UNRESOLVED')) ? '' : part('UNRESOLVED') };
}

async function reviseDeal(p, notes) {
  const deals = readJson(join(ROOT, 'site', 'src', 'data', 'deals.json'), { deals: [] }).deals;
  const d = deals.find((x) => x.id === p.dealId);
  if (!d) return { error: 'deal not found in deals.json' };
  const prompt = `Tee checked this entry for the Sqwod Deal Tracker and left a note. Search the web, then answer ONLY with minified JSON of the fields to correct (omit fields that are right): {"entity":"Buyer / Target or company","kind":"raise|acquisition|valuation|ipo|shutdown","amount":"as the company's own announcement states it, or empty","note":"max 18 words, plain English, no em dashes","noteDe":"same in German","url":"https://... a page you opened","changed":"one sentence: what you corrected","unresolved":"what you could not confirm, or empty"}
DEAL: ${JSON.stringify({ entity: d.entity, kind: d.kind, amount: d.amount, note: d.note, url: d.url, date: d.date })}
TEE'S NOTE: ${notes.map((n) => n.text).join(' / ')}`;
  const j = parseJson(await claude(prompt, { maxTokens: 3000, tools: [{ type: process.env.SQWOD_SEARCH_TOOL || 'web_search_20260209', name: 'web_search', max_uses: 6 }] }));
  if (!j) return { error: 'the web check returned nothing usable' };
  const { changed = '', unresolved = '', ...fields } = j;
  const clean = Object.fromEntries(Object.entries(fields).filter(([k, v]) => ['entity', 'kind', 'amount', 'note', 'noteDe', 'url'].includes(k) && typeof v === 'string'));
  if (!args.dry && Object.keys(clean).length) {
    const path = join(ROOT, 'automation', 'deals-overrides.json');
    const o = readJson(path, { deals: {} });
    o.deals[d.id] = { ...(o.deals[d.id] || {}), ...clean };
    delete o.deals[d.id].status;   // still Tee's call: Publish or Skip in the next email
    writeFileSync(path, JSON.stringify(o, null, 2) + '\n');
  }
  return { changed: changed || `Updated ${Object.keys(clean).join(', ') || 'nothing'}.`, unresolved };
}

let n = 0;
for (const it of [...queueItems(), ...pressItems()].filter((q) => q.status === 'revise')) {
  const { _path, ...p } = it;
  const notes = (p.notes || []).filter((x) => !x.appliedAt);
  if (!notes.length) { writeJson(_path, { ...p, status: 'pending' }); continue; }
  console.log(`✎ ${p.id}: ${notes.map((x) => x.text).join(' / ').slice(0, 120)}`);
  let r;
  if (['article', 'evidence', 'flagship', 'daily'].includes(p.kind)) r = await rewrite(p, notes);
  else if (p.kind === 'deal') r = await reviseDeal(p, notes);
  else r = { manual: true };

  const stamp = now();
  const nextNotes = (p.notes || []).map((x) => (x.appliedAt ? x : { ...x, appliedAt: stamp }));
  let status = 'pending';
  if (r.manual) status = p.kind === 'press' ? 'needs-changes' : 'flagged';
  else if (!r.error && p.kind === 'daily' && p.held) {
    // A held Daily goes out after a Note only if the rewritten issue passes the trust check again.
    const t = args.dry ? { hold: [] } : trust(p.date);
    status = t.hold.length ? 'pending' : 'approved';
    if (t.hold.length) { p.flags = t.hold; r.unresolved = [r.unresolved, 'Still flagged after the rewrite, so it was not sent.'].filter(Boolean).join(' '); }
  }
  else if (!r.error && p.kind === 'daily') status = 'sent';
  else if (r.error && p.kind === 'daily') status = p.held ? 'pending' : 'sent';
  const next = { ...p, status, notes: nextNotes, revisions: (p.revisions || 0) + (r.error || r.manual ? 0 : 1) };
  if (r.error) next.revisionError = r.error; else delete next.revisionError;
  if (r.changed) { next.revisedAt = stamp; next.lastChange = r.changed; next.unresolved = r.unresolved || ''; }
  if (r.manual) next.lastChange = 'Your note is saved. This kind of item needs a hand fix.';
  if (p.kind === 'press') { next.id = p.id.replace(/^press-/, ''); delete next.kind; delete next.title; }   // keep the press file's own shape
  if (!args.dry) writeJson(_path, next);
  console.log(r.error ? `  ✗ ${r.error}` : `  ✓ ${r.changed || r.manual && 'noted'}`);
  n++;
}
console.log(n ? `${n} note(s) processed` : 'No notes to apply.');
