// Sqwod Jobs (Germany), read at build time. site/src/data/jobs.json is written by
// automation/jobs.mjs every Thursday; expired jobs stay in the file and never render.
import data from '../data/jobs.json';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface Job {
  id: string; title: string; employer: string | null; employerSite: string | null; city: string | null;
  region: 'Berlin' | 'Hamburg' | 'München' | 'Köln' | 'Frankfurt' | 'Other DE' | 'Remote DE';
  type: string | null; employment: 'full-time' | 'part-time' | 'freelance' | 'mini-job' | 'unknown';
  payText: string | null; payMin: number | null; payMax: number | null; payPeriod: 'hour' | 'month' | 'year' | null; payCurrency: 'EUR' | null;
  url: string; source: 'career-page' | 'ba' | 'adzuna' | 'dssv' | 'fitt'; postedAt: string | null; seenAt: string; lastSeenAt: string;
  lang: string; summaryEn?: string; summaryDe?: string; expired?: boolean;
}

export const hasPay = (j: Job) => j.payMin != null || j.payMax != null;
/** Open roles: not expired. Pay listed first, then newest. */
export function liveJobs(): Job[] {
  return ((data.jobs || []) as Job[]).filter((j) => !j.expired)
    .sort((a, b) => Number(hasPay(b)) - Number(hasPay(a)) || (b.postedAt || b.seenAt).localeCompare(a.postedAt || a.seenAt));
}
export const jobsGeneratedAt: string | null = data.generatedAt;
export const jobsEdition: string | null = data.edition;
/** The Tools card flips to Live once the first weekly run has published roles. */
export const jobsLive = () => liveJobs().length > 0;

// ---- employer identity: short name, logo file (fetched by automation/jobs-logos.mjs), monogram fallback ----
const AUTOMATION = join(process.cwd(), '..', 'automation');
const readJson = (p: string) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
const EMPLOYERS: { match: string; short: string; domain: string }[] = readJson(join(AUTOMATION, 'jobs-employers.json'))?.employers || [];
const LOGOS: Record<string, { file: string | null; short?: string | null; domain?: string | null }> = readJson(join(AUTOMATION, 'jobs-logos.json'))?.logos || {};
/** Stable key for an employer name, same rule as automation/jobs-logos.mjs. */
export const employerKey = (name: string | null) => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(se|ag|gmbh|ggmbh|kg|co\.?|gbr|egbr|e\.?v\.?|mbh|inc|ltd|llc|holding|international|germany|deutschland)\b/g, ' ')
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
export interface Brand { key: string; name: string; short: string; logo: string | null; initials: string; hue: number }
export function brandOf(job: Job): Brand {
  const name = job.employer || '';
  const key = employerKey(name);
  const row = EMPLOYERS.find((r) => new RegExp(r.match, 'i').test(name));
  const logo = LOGOS[key]?.file ? `/brands/jobs/${LOGOS[key].file}` : null;
  const short = row?.short || LOGOS[key]?.short || name.replace(/\s*[-–,(].*$/, '').replace(/\b(SE|AG|GmbH|gGmbH|KG|Co\.?|GbR|eGbR|e\.?V\.?|mbH)\b\.?/g, '').replace(/&\s*$/, '').replace(/\s{2,}/g, ' ').trim() || name;
  const words = short.split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2 ? words[0][0] + words[1][0] : short.slice(0, 2)).toUpperCase();
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { key, name, short, logo, initials, hue: h };
}
/** Monthly-equivalent pay for sorting: hourly × 160, yearly ÷ 12. */
export const payMonthly = (j: Job): number | null => {
  const v = j.payMax ?? j.payMin; if (v == null) return null;
  return j.payPeriod === 'hour' ? v * 160 : j.payPeriod === 'year' ? v / 12 : v;
};
