#!/usr/bin/env node
/**
 * Sqwod Jobs: employer logos. Runs after jobs.mjs in the weekly workflow (needs outbound HTTPS).
 *
 * For every employer with live roles, work out a domain (jobs-employers.json → jobs-brands.json →
 * the job's employerSite), fetch its favicon through DuckDuckGo's icon service (falls back to Google's)
 * and keep it as site/public/brands/jobs/<key>.png. The manifest automation/jobs-logos.json maps the
 * employer key to the file, so the site never requests a logo from a third party at page-view time.
 *
 *   node automation/jobs-logos.mjs            # fetch missing logos (default)
 *   node automation/jobs-logos.mjs --refresh  # refetch every logo
 *   node automation/jobs-logos.mjs --dry      # list what would be fetched
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = join(ROOT, 'site/src/data/jobs.json');
const EMPLOYERS = join(ROOT, 'automation/jobs-employers.json');
const BRANDS = join(ROOT, 'automation/jobs-brands.json');
const MANIFEST = join(ROOT, 'automation/jobs-logos.json');
const OUT = join(ROOT, 'site/public/brands/jobs');
const args = new Set(process.argv.slice(2));
const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);

/** Stable key for an employer name: "FitX SE" -> "fitx", "McFIT - RSG Group GmbH" -> "mcfit-rsg-group". */
export const employerKey = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(se|ag|gmbh|ggmbh|kg|co\.?|gbr|egbr|e\.?v\.?|mbh|inc|ltd|llc|holding|international|germany|deutschland)\b/g, ' ')
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const norm = (s) => employerKey(s).replace(/-/g, ' ');

export function resolveEmployer(name, employers, brands, employerSite) {
  const rows = employers.employers || [];
  for (const r of rows) if (new RegExp(r.match, 'i').test(name || '')) return { short: r.short, domain: r.domain, via: 'employers' };
  const n = norm(name);
  if (n.length >= 4) {
    const b = (brands.brands || []).find((b) => { const bn = norm(b.brand); return bn.length >= 4 && (n === bn || n.startsWith(bn + ' ') || bn.startsWith(n + ' ')); });
    if (b?.site) { try { return { short: b.brand, domain: new URL(b.site).hostname.replace(/^www\./, ''), via: 'brands' }; } catch {} }
  }
  if (employerSite) { try { return { short: null, domain: new URL(employerSite).hostname.replace(/^www\./, ''), via: 'site' }; } catch {} }
  return { short: null, domain: null, via: null };
}

async function fetchIcon(domain) {
  const tries = [`https://icons.duckduckgo.com/ip3/${domain}.ico`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`];
  for (const u of tries) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'SqwodJobsLogos/1.0 (+https://sqwod.life)' } });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      // skip the services' generic placeholders (tiny) and anything that is not PNG
      if (buf.length < 400 || !(buf[0] === 0x89 && buf[1] === 0x50)) continue;
      return buf;
    } catch {}
  }
  return null;
}

async function main() {
  const jobs = (readJson(JOBS, { jobs: [] }).jobs || []).filter((j) => !j.expired);
  const employers = readJson(EMPLOYERS, { employers: [] });
  const brands = readJson(BRANDS, { brands: [] });
  const manifest = readJson(MANIFEST, { _doc: 'Written by automation/jobs-logos.mjs. key → { file, domain, short, fetchedAt }. Delete a row to refetch it.', logos: {} });
  mkdirSync(OUT, { recursive: true });
  const seen = new Map();
  for (const j of jobs) { const k = employerKey(j.employer); if (k && !seen.has(k)) seen.set(k, j); }
  let fetched = 0, kept = 0, none = 0;
  for (const [key, j] of seen) {
    const r = resolveEmployer(j.employer, employers, brands, j.employerSite);
    const cur = manifest.logos[key];
    if (cur && !args.has('--refresh') && (cur.file ? existsSync(join(OUT, cur.file)) : cur.tried === r.domain)) { kept++; continue; }
    if (!r.domain) { manifest.logos[key] = { file: null, domain: null, short: r.short, tried: null, fetchedAt: new Date().toISOString().slice(0, 10) }; none++; continue; }
    if (args.has('--dry')) { console.log(`${key} ← ${r.domain} (${r.via})`); continue; }
    const buf = await fetchIcon(r.domain);
    const file = buf ? `${key}.png` : null;
    if (buf) { writeFileSync(join(OUT, file), buf); fetched++; } else none++;
    manifest.logos[key] = { file, domain: r.domain, short: r.short, tried: r.domain, fetchedAt: new Date().toISOString().slice(0, 10) };
    console.log(`${buf ? 'ok  ' : 'none'} ${key} ← ${r.domain} (${r.via})`);
  }
  if (!args.has('--dry')) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`logos: ${fetched} fetched, ${kept} kept, ${none} without`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
