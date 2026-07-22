#!/usr/bin/env node
// Internal link-integrity check over the built site (dist/).
//
// Walks every generated .html file and asserts that every link pointing at our
// own site resolves to a real file in dist/. Catches the whole class of "links to
// a route that was never built" bugs before they can deploy.
//
// It checks three shapes of same-origin link, because a broken URL doesn't always
// surface as a plain href:
//   1. root-relative href/src     — <a href="/en/daily/2026-07-20">
//   2. absolute same-origin URLs  — canonical, og:url, hreflang, JSON-LD,
//                                    data-url, /go Offer.url
//   3. percent-encoded same-origin — the internal URL wrapped inside an external
//      URLs inside other links       share link, e.g. twitter.com/intent/tweet?
//                                    url=https%3A%2F%2Fsqwod.life%2F…
// (2)+(3) are what make it catch the share-button class of bug: the share target
// lives only inside external social URLs and data-* attributes, never as a bare
// href. Captured paths use a strict URL-path charset so a same-origin URL sitting
// inside a data: download blob doesn't swallow the rest of the document.
//
// Exit 1 (with a report) if anything is broken; 0 if every same-origin link resolves.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://sqwod.life';
const ENC_ORIGIN = encodeURIComponent(SITE_ORIGIN); // https%3A%2F%2Fsqwod.life
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// Resolve a root-relative URL path to a file on disk, mirroring how a static host
// serves it: /a/b -> dist/a/b, dist/a/b.html, or dist/a/b/index.html.
function resolves(urlPath) {
  let clean;
  try { clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]); }
  catch { clean = urlPath.split('#')[0].split('?')[0]; }
  if (clean === '' || clean === '/') return existsSync(join(DIST, 'index.html'));
  const base = join(DIST, clean.replace(/^\/+/, ''));
  return existsSync(base) || existsSync(`${base}.html`) || existsSync(join(base, 'index.html'));
}

// Strict URL-path charsets so a match stops at the first non-path char (a quote,
// comma, newline, %22, %2C… inside an embedding JSON/query stops the capture).
const ABS = new RegExp(`${esc(SITE_ORIGIN)}([A-Za-z0-9\\-._~/%]*)`, 'gi');
const ENC = new RegExp(`${esc(ENC_ORIGIN)}((?:%2[Ff]|[A-Za-z0-9\\-._~])*)`, 'g');
const REL = /(?:href|src)\s*=\s*"(\/[^"]*)"/gi;

function pathsIn(html) {
  const paths = new Set();
  for (const m of html.matchAll(REL)) if (!m[1].startsWith('//')) paths.add(m[1]);
  for (const m of html.matchAll(ABS)) paths.add(m[1] || '/');
  for (const m of html.matchAll(ENC)) {
    let dec; try { dec = decodeURIComponent(m[1] || '/'); } catch { dec = m[1] || '/'; }
    paths.add(dec || '/');
  }
  return paths;
}

const files = await htmlFiles(DIST);
const broken = [];
for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const p of pathsIn(html)) {
    if (!resolves(p)) broken.push({ file: file.slice(DIST.length + 1), target: p });
  }
}

if (broken.length) {
  const byTarget = new Map();
  for (const b of broken) {
    const e = byTarget.get(b.target) || { count: 0, sample: b.file };
    e.count++; byTarget.set(b.target, e);
  }
  console.error(`✗ ${byTarget.size} distinct broken same-origin link(s), ${broken.length} occurrence(s):\n`);
  for (const [target, e] of byTarget) console.error(`  ${target}  (×${e.count}, e.g. dist/${e.sample})`);
  console.error(`\nChecked ${files.length} pages.`);
  process.exit(1);
}
console.log(`✓ All same-origin links resolve across ${files.length} pages.`);
