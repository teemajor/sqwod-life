/**
 * Sqwod Jobs helpers shared by cascade.mjs (Friday "5 jobs this week"), jobs-alert.mjs
 * (Friday email) and digest.mjs (Friday line). Reads site/src/data/jobs.json, written by jobs.mjs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const JOBS_FILE = join(ROOT, 'site', 'src', 'data', 'jobs.json');
const DAY = 86400000;

export function loadJobs(file = JOBS_FILE) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return { generatedAt: null, edition: null, jobs: [] }; }
}
export const hasPay = (j) => j.payMin != null || j.payMax != null;
/** Live roles first seen in the 7 days before `now`: pay listed first, then newest. */
export function newThisWeek(jobs, now = Date.now()) {
  return jobs.filter((j) => !j.expired && j.seenAt && now - Date.parse(j.seenAt + 'T12:00:00Z') <= 7 * DAY)
    .sort((a, b) => Number(hasPay(b)) - Number(hasPay(a)) || String(b.postedAt || b.seenAt).localeCompare(String(a.postedAt || a.seenAt)));
}
/** "2.800 € / Monat" (DE) or "€2,800 / month" (EN); null when no pay is listed. */
export function payLabel(j, lang) {
  if (!hasPay(j)) return null;
  const de = lang === 'de', loc = de ? 'de-DE' : 'en-GB';
  const eur = (n) => (de ? `${n.toLocaleString(loc, { maximumFractionDigits: 2 })} €` : `€${n.toLocaleString(loc, { maximumFractionDigits: 2 })}`);
  const a = j.payMin != null ? eur(j.payMin) : null, b = j.payMax != null ? eur(j.payMax) : null;
  const amt = a && b && a !== b ? `${a}–${b}` : a && b ? a : a ? `${de ? 'ab' : 'from'} ${a}` : `${de ? 'bis' : 'up to'} ${b}`;
  const per = de ? { hour: 'Std.', month: 'Monat', year: 'Jahr' } : { hour: 'hour', month: 'month', year: 'year' };
  return j.payPeriod ? `${amt} / ${per[j.payPeriod]}` : amt;
}
export const cityLabel = (j, lang) => (j.region === 'Remote DE' ? 'Remote' : j.city || '') || null;
