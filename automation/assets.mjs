#!/usr/bin/env node
/**
 * sqwod.life — Sqwod Verified product-image puller (Amazon PA-API 5.0).
 *
 * Pulls approved product photos from the Amazon Product Advertising API and
 * writes them into each review's `asset.images` (EN + DE in parity, same CDN
 * image URLs). Mirrors automation/verified.mjs: registry-driven, live pull only
 * when API keys are present, writes only on change (no date churn), and never
 * touches editorial fields (sqwodScore, assessment, prose, verdict).
 *
 * Registry: automation/product-assets.json  (slug -> { asin })
 * Target:   site/src/content/reviews/<slug>.<lang>.md  ->  asset: { type: images, images: [...], credit }
 *
 * Modes:
 *   node automation/assets.mjs                 # dry-run: report ASIN coverage, no network, no writes
 *   node automation/assets.mjs --selftest      # verify the AWS SigV4 signer against AWS's published vector
 *   node automation/assets.mjs --mock          # write placeholder image URLs (preview the render, no API)
 *   AMAZON_ACCESS_KEY=… AMAZON_SECRET_KEY=… AMAZON_PARTNER_TAG=… node automation/assets.mjs   # live pull + write
 *
 * Env for a live pull:
 *   AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG (your Associates tag),
 *   optional AMAZON_MARKETPLACE (default from registry, e.g. www.amazon.com).
 * Note: new Amazon Associates accounts only get PA-API access after ~3 qualifying
 * sales in 180 days — until then this runs dry/mock and the pages show the fallback.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(__dirname, 'product-assets.json');
const REVIEWS_DIR = join(__dirname, '..', 'site', 'src', 'content', 'reviews');
const LANGS = ['en', 'de'];
const CREDIT = { en: 'Product images via Amazon', de: 'Produktbilder via Amazon' };

const args = new Set(process.argv.slice(2).map((a) => a.replace(/^--/, '')));

// Marketplace -> PA-API host + region.
const HOSTS = {
  'www.amazon.com': { host: 'webservices.amazon.com', region: 'us-east-1' },
  'www.amazon.co.uk': { host: 'webservices.amazon.co.uk', region: 'eu-west-1' },
  'www.amazon.de': { host: 'webservices.amazon.de', region: 'eu-west-1' },
};

// ---- AWS Signature V4 (dependency-free) ---------------------------------
const sha256hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s, 'utf8').digest();
function signingKey(secret, date, region, service) {
  const kDate = hmac('AWS4' + secret, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

// Self-test against AWS's documented signing-key example (docs: "Examples of
// how to derive a signing key"). If this matches, the crypto core is correct.
function selftest() {
  const key = signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam');
  const got = Buffer.from(key).toString('hex');
  const want = 'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d';
  console.log(`SigV4 signing-key vector: ${got === want ? 'PASS ✓' : 'FAIL ✗'}`);
  if (got !== want) { console.error(`  got  ${got}\n  want ${want}`); process.exit(1); }
}

// ---- PA-API GetItems ----------------------------------------------------
async function getItems(asins, cfg) {
  const service = 'ProductAdvertisingAPI';
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
  const path = '/paapi5/getitems';
  const payload = JSON.stringify({
    ItemIds: asins,
    ItemIdType: 'ASIN',
    PartnerTag: cfg.partnerTag,
    PartnerType: 'Associates',
    Marketplace: cfg.marketplace,
    Resources: ['Images.Primary.Large', 'Images.Variants.Large', 'ItemInfo.Title'],
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8);
  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: cfg.host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };
  // Sign a stable subset (must include host + x-amz-*).
  const signedHeaders = 'content-encoding;host;x-amz-date;x-amz-target';
  const canonicalHeaders =
    `content-encoding:${headers['content-encoding']}\n` +
    `host:${headers.host}\n` +
    `x-amz-date:${headers['x-amz-date']}\n` +
    `x-amz-target:${headers['x-amz-target']}\n`;
  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, sha256hex(payload)].join('\n');
  const scope = `${date}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const sig = Buffer.from(hmac(signingKey(cfg.secretKey, date, cfg.region, service), stringToSign)).toString('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const res = await fetch(`https://${cfg.host}${path}`, {
    method: 'POST',
    headers: { ...headers, Authorization: auth },
    body: payload,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PA-API ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const out = {};
  for (const it of data?.ItemsResult?.Items ?? []) {
    const imgs = [];
    const primary = it?.Images?.Primary?.Large?.URL;
    if (primary) imgs.push(primary);
    for (const v of it?.Images?.Variants ?? []) if (v?.Large?.URL) imgs.push(v.Large.URL);
    out[it.ASIN] = [...new Set(imgs)];
  }
  return out;
}

// ---- frontmatter writer -------------------------------------------------
// Replace or insert the `asset:` block with an images list. Idempotent.
function writeImages(slug, lang, images) {
  const path = join(REVIEWS_DIR, `${slug}.${lang}.md`);
  let src;
  try { src = readFileSync(path, 'utf8'); }
  catch { console.warn(`  - ${slug}.${lang}.md not found, skipping`); return false; }

  const fmMatch = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) { console.warn(`  - ${slug}.${lang}.md has no frontmatter, skipping`); return false; }
  const fm = fmMatch[1];
  const rest = src.slice(fmMatch[0].length);

  const block =
    'asset:\n' +
    '  type: images\n' +
    '  images:\n' +
    images.map((u) => `    - "${u}"`).join('\n') + '\n' +
    `  credit: "${CREDIT[lang]}"`;

  const assetBlockRe = /^asset:.*(?:\n[ \t]+.*)*/m;
  const newFm = assetBlockRe.test(fm) ? fm.replace(assetBlockRe, block) : `${fm}\n${block}`;
  if (newFm === fm) return false; // nothing changed
  writeFileSync(path, `---\n${newFm}\n---\n${rest}`);
  return true;
}

// ---- run ----------------------------------------------------------------
if (args.has('selftest')) { selftest(); process.exit(0); }

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const marketplace = process.env.AMAZON_MARKETPLACE || registry.marketplace || 'www.amazon.com';
const maxImages = registry.maxImages || 5;
const hostCfg = HOSTS[marketplace] || HOSTS['www.amazon.com'];
const accessKey = process.env.AMAZON_ACCESS_KEY;
const secretKey = process.env.AMAZON_SECRET_KEY;
const partnerTag = process.env.AMAZON_PARTNER_TAG;
const live = !!(accessKey && secretKey && partnerTag) && !args.has('mock');
const mock = args.has('mock');

const entries = Object.entries(registry.products);
const hasManual = (p) => Array.isArray(p.images) && p.images.length > 0;
const manual = entries.filter(([, p]) => hasManual(p));
const withAsin = entries.filter(([, p]) => p.asin && !hasManual(p));
const idle = entries.filter(([, p]) => !p.asin && !hasManual(p)).map(([s]) => s);

console.log(`Sqwod Verified images \u00b7 ${marketplace} \u00b7 ${mock ? 'MOCK' : live ? 'LIVE PA-API' : 'manual/dry-run'}`);
console.log(`  ${manual.length} manual (SiteStripe) \u00b7 ${withAsin.length} via ASIN \u00b7 ${idle.length} on fallback`);
if (idle.length) console.log(`  no image source: ${idle.join(', ')}`);

// 1. Manual images (from the registry / SiteStripe) always apply — no API needed.
let imagesBySlug = {};
for (const [slug, p] of manual) imagesBySlug[slug] = p.images.slice(0, maxImages);

// 2. Fill the rest from Amazon.
if (mock) {
  for (const [slug, p] of entries) {
    if (imagesBySlug[slug]) continue;
    const base = p.asin || slug.toUpperCase().replace(/[^A-Z0-9]/g, '');
    imagesBySlug[slug] = [1, 2, 3].map((n) => `https://m.media-amazon.com/images/I/MOCK-${base}-${n}._SL500_.jpg`);
  }
} else if (live && withAsin.length) {
  const cfg = { ...hostCfg, marketplace, accessKey, secretKey, partnerTag };
  const asins = withAsin.map(([, p]) => p.asin);
  let byAsin = {};
  try { byAsin = await getItems(asins.slice(0, 10), cfg); }
  catch (e) { console.error(`PA-API request failed: ${e.message}`); process.exit(1); }
  for (const [slug, p] of withAsin) {
    const imgs = (byAsin[p.asin] || []).slice(0, maxImages);
    if (imgs.length) imagesBySlug[slug] = imgs;
    else console.warn(`  ! no images returned for ${slug} (${p.asin})`);
  }
}

if (!Object.keys(imagesBySlug).length) {
  console.log('\nNothing to write. Paste SiteStripe image URLs into product-assets.json `images`, or set AMAZON_* keys for the ASIN pull. Use --mock to preview the layout.');
  process.exit(0);
}

let changed = 0;
for (const [slug, imgs] of Object.entries(imagesBySlug)) {
  for (const lang of LANGS) {
    if (writeImages(slug, lang, imgs)) { changed++; console.log(`  \u2713 ${slug}.${lang}: ${imgs.length} image(s)`); }
  }
}
console.log(changed ? `\nUpdated ${changed} file(s).` : '\nNo changes \u2014 everything already current.');
