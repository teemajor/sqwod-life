#!/usr/bin/env node
/**
 * Rich-results validator for the built site.
 *
 * Scans site/dist for every application/ld+json block and checks each one
 * against Google's documented requirements for the types we emit
 * (Product + AggregateRating + Review, and NewsArticle). Reports ERRORS
 * (block won't be eligible for the rich result) and WARNINGS (recommended
 * fields Google likes). Exit code 1 if any ERROR — so CI can gate on it.
 *
 *   node automation/validate-richresults.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'site', 'dist');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.html')) out.push(p);
  }
  return out;
}

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const errors = [];
const warnings = [];
let blocks = 0;

const need = (cond, where, msg) => { if (!cond) errors.push(`${where}: ${msg}`); };
const want = (cond, where, msg) => { if (!cond) warnings.push(`${where}: ${msg}`); };

function checkProduct(o, where) {
  need(o.name, where, 'Product.name missing');
  const ar = o.aggregateRating, rv = o.review;
  need(ar || rv, where, 'Product needs aggregateRating or review for a review snippet');
  if (ar) {
    need(ar.ratingValue != null, where, 'aggregateRating.ratingValue missing');
    need(ar.reviewCount != null || ar.ratingCount != null, where, 'aggregateRating needs reviewCount or ratingCount');
    need(ar.bestRating != null, where, 'aggregateRating.bestRating required when scale != 5');
  }
  if (rv) {
    need(rv.reviewRating?.ratingValue != null, where, 'review.reviewRating.ratingValue missing');
    need(rv.author, where, 'review.author missing');
  }
  want(o.offers, where, 'Product.offers recommended (price rich result)');
  if (o.offers) {
    need(o.offers.price != null, where, 'offers.price missing');
    need(o.offers.priceCurrency, where, 'offers.priceCurrency missing');
  }
}

function checkNewsArticle(o, where) {
  need(o.headline, where, 'headline missing');
  need(typeof o.headline !== 'string' || o.headline.length <= 110, where, `headline > 110 chars (${o.headline?.length})`);
  need(o.datePublished, where, 'datePublished missing');
  want(o.dateModified, where, 'dateModified recommended');
  want(o.image, where, 'image recommended (Article rich result wants one)');
  need(o.author, where, 'author missing');
  want(o.publisher, where, 'publisher recommended');
}

for (const f of walk(DIST)) {
  const html = readFileSync(f, 'utf8');
  const where = f.replace(DIST, '');
  let m;
  while ((m = LD.exec(html))) {
    blocks++;
    let o;
    try { o = JSON.parse(m[1]); }
    catch (e) { errors.push(`${where}: invalid JSON-LD (${e.message})`); continue; }
    const type = o['@type'];
    if (type === 'Product') checkProduct(o, where);
    else if (type === 'NewsArticle' || type === 'Article') checkNewsArticle(o, where);
  }
}

console.log(`Scanned ${walk(DIST).length} pages · ${blocks} JSON-LD blocks`);
if (warnings.length) { console.log(`\n⚠ ${warnings.length} warning(s):`); warnings.forEach((w) => console.log('  ·', w)); }
if (errors.length) { console.log(`\n✖ ${errors.length} error(s):`); errors.forEach((e) => console.log('  ·', e)); process.exit(1); }
console.log('\n✓ All JSON-LD blocks pass Google\'s required fields for their type.');
