#!/usr/bin/env node
// Em-dash ratchet over the built site (dist/).
//
// House style: no em dashes in copy. The site is clean (reviews, templates and titles Oct 2026,
// articles, press and corrections after that), so the baseline file is empty and every page must
// have none. The baseline stays as an escape hatch: if a page ever has to keep a dash, list it in
// scripts/em-dash-baseline.json and its count is the most it may have. It is a ratchet:
//   - a page may never have MORE em dashes than the baseline allows (default 0)
//   - `npm run check:dashes -- --update` only ever lowers the baseline
// Counted: visible text, the <title>, and the meta/og descriptions (what Google shows).
// Not counted: scripts, styles, a lone "—" used as a "no data" placeholder in a table,
// dist/email/ (archived copies of newsletters that were already sent) and /press/ (company-written releases).
//
//   npm run check:dashes            check (exit 1 with a report if any page got worse)
//   npm run check:dashes -- --update  after removing dashes: lower the baseline to match.
//                                     It only ever lowers counts; it never lets a page add any.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const BASELINE = fileURLToPath(new URL('./em-dash-baseline.json', import.meta.url));
// email/: archived newsletters already sent. */press/: releases written and submitted by companies, not Sqwod copy.
const SKIP = ['email/', 'en/press/', 'de/press/'];
const init = process.argv.includes('--init');   // one-off: record today's counts as the starting baseline
const update = init || process.argv.includes('--update');

if (!existsSync(DIST)) {
  console.error(`✗ dist/ not found at ${DIST}. Run "npm run build" first.`);
  process.exit(1);
}

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&mdash;|&#8212;|&#x2014;/gi, '—');

// Returns the text pieces a reader (or a search result) sees that contain an em dash.
function dashedText(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const meta = [...body.matchAll(/<meta\s+(?:name="description"|property="og:description"|property="og:title")\s+content="([^"]*)"/gi)].map((m) => m[1]);
  const nodes = body.split(/<[^>]+>/).concat(meta).map((t) => decode(t).trim());
  return nodes.filter((t) => t.includes('—') && t !== '—');
}
const count = (pieces) => pieces.reduce((n, t) => n + (t.match(/—/g) || []).length, 0);

const baseline = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')).pages : {};
const worse = [];
const next = {};
let pages = 0, lowered = 0;
for (const file of await htmlFiles(DIST)) {
  const page = relative(DIST, file);
  if (SKIP.some((s) => page.startsWith(s))) continue;
  pages++;
  const pieces = dashedText(await readFile(file, 'utf8'));
  const n = count(pieces);
  const allowed = init ? n : (baseline[page] ?? 0);
  if (n > allowed) worse.push({ page, n, allowed, sample: pieces[0] });
  if (n > 0) next[page] = Math.min(n, allowed);
  if (n < allowed) lowered++;
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(next).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(BASELINE, JSON.stringify({ note: 'Em dashes still allowed per built page. Lower only: run "npm run check:dashes -- --update" after a clean-up.', pages: sorted }, null, 1) + '\n');
  console.log(`Baseline written: ${Object.keys(sorted).length} pages still have em dashes (${lowered} lowered).`);
}

if (worse.length) {
  console.error(`✗ ${worse.length} page(s) have more em dashes than allowed (house style: none in new copy):\n`);
  for (const w of worse.slice(0, 40)) console.error(`  ${w.page}  ${w.n} (allowed ${w.allowed})\n    "${w.sample.slice(0, 140)}"`);
  if (worse.length > 40) console.error(`  … and ${worse.length - 40} more`);
  console.error('\nReplace each " — " with a colon, comma, full stop or brackets.');
  process.exit(1);
}
console.log(`✓ No page gained em dashes across ${pages} pages.${lowered && !update ? ` ${lowered} page(s) improved: run "npm run check:dashes -- --update" to lock that in.` : ''}`);
