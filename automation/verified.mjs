#!/usr/bin/env node
/**
 * sqwod.life — Sqwod Verified crowd-signal refresher.
 *
 * Keeps the Trustpilot chip on every Sqwod Verified review current, so the
 * crowd signal (and the "as of" date that search engines read for freshness)
 * reflects the most recent public reviews. Runs daily from
 * .github/workflows/verified.yml.
 *
 * What it does, per review (EN + DE, kept in parity):
 *   - upserts a Trustpilot chip into `crowd.sources` from the registry
 *     (automation/sources/verified-sources.json):
 *       · chip already present → refresh its TrustScore + link
 *       · chip missing         → insert it, count the new platform, and add
 *         its review volume to the crowd total (done once; idempotent after)
 *   - bumps `updatedAt` to today **only when a value actually changed**
 *     (no fake-freshness date churn on quiet days)
 *
 * It NEVER touches editorial fields (sqwodScore, the Sqwod assessment, prose).
 * The Trustpilot number is shown raw and transparent — the blended crowd /
 * Sqwod scores stay our own. "We publish low scores too."
 *
 * Data source:
 *   - With TRUSTPILOT_API_KEY set, it first refreshes each registry entry from
 *     the live Trustpilot Business API, then writes the result in.
 *   - Without a key (dry-run / default), it uses the researched values already
 *     in the registry. Never invents numbers.
 *
 * Usage:
 *   node automation/verified.mjs                 # refresh from registry (dry-run safe)
 *   node automation/verified.mjs --date=2026-06-28
 *   TRUSTPILOT_API_KEY=… node automation/verified.mjs   # pull live TrustScores first
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(__dirname, 'sources', 'verified-sources.json');
const REVIEWS_DIR = join(__dirname, '..', 'site', 'src', 'content', 'reviews');
const LANGS = ['en', 'de'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const today = args.date || new Date().toISOString().slice(0, 10);
const apiKey = process.env.TRUSTPILOT_API_KEY;

// ---- live Trustpilot pull (optional) -----------------------------------
// Best-effort: refresh a registry entry's TrustScore + review count from the
// Trustpilot Business API. Any failure leaves the researched value in place —
// we never blank or invent a score.
async function refreshLive(tp) {
  if (!apiKey || !tp?.domain) return tp;
  try {
    const find = await fetch(
      `https://api.trustpilot.com/v1/business-units/find?name=${encodeURIComponent(tp.domain)}&apikey=${apiKey}`,
    );
    if (!find.ok) throw new Error(`find ${find.status}`);
    const unit = await find.json();
    const id = unit?.id;
    if (!id) throw new Error('no business unit id');
    const detail = await fetch(
      `https://api.trustpilot.com/v1/business-units/${id}?apikey=${apiKey}`,
    );
    if (!detail.ok) throw new Error(`detail ${detail.status}`);
    const d = await detail.json();
    const score = Number(d?.score?.trustScore);
    const reviews = Number(d?.numberOfReviews?.total);
    if (Number.isFinite(score)) tp.score = Math.round(score * 10) / 10;
    if (Number.isFinite(reviews)) tp.reviews = reviews;
    console.log(`  ↻ live Trustpilot ${tp.domain}: ${tp.score}★ · ${tp.reviews} reviews`);
  } catch (err) {
    console.warn(`  ! live Trustpilot fetch failed for ${tp.domain} (${err.message}); using registry value`);
  }
  return tp;
}

// ---- per-file upsert ----------------------------------------------------
const tpChip = (tp) => `    - { name: "Trustpilot", value: "${tp.score}★", url: "https://www.trustpilot.com/review/${tp.domain}" }`;
const TP_LINE = /^\s*-\s*\{\s*name:\s*"Trustpilot".*\}\s*$/m;
const bumpInt = (src, key, delta) =>
  src.replace(new RegExp(`^(\\s*${key}:\\s*)(\\d+)`, 'm'), (_, p, n) => `${p}${Number(n) + delta}`);

function upsert(slug, lang, tp) {
  const path = join(REVIEWS_DIR, `${slug}.${lang}.md`);
  let src;
  try { src = readFileSync(path, 'utf8'); }
  catch { console.warn(`  - ${slug}.${lang}.md not found, skipping`); return false; }

  const chip = tpChip(tp);
  let next = src;

  if (TP_LINE.test(src)) {
    next = src.replace(TP_LINE, chip);              // refresh in place
  } else {
    next = src.replace(/^(\s*sources:\s*\n)/m, `$1${chip}\n`); // insert as a new platform
    if (next !== src) {
      next = bumpInt(next, 'platforms', 1);
      next = bumpInt(next, 'reviews', Number(tp.reviews) || 0);
    }
  }

  if (next === src) return false;                   // nothing changed → no date churn
  next = next.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${today}`);
  writeFileSync(path, next);
  return true;
}

// ---- run ----------------------------------------------------------------
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
let changed = 0;
console.log(`Sqwod Verified refresh · ${today}${apiKey ? ' · live Trustpilot' : ' · registry (dry-run)'}`);

for (const [slug, entry] of Object.entries(registry.reviews)) {
  if (!entry.trustpilot) continue;
  const tp = await refreshLive(entry.trustpilot);
  for (const lang of LANGS) {
    if (upsert(slug, lang, tp)) { changed++; console.log(`  ✓ ${slug}.${lang}: Trustpilot ${tp.score}★`); }
  }
}

console.log(changed ? `Updated ${changed} file(s).` : 'No changes — everything already current.');
