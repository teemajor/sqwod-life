// Sqwod Jobs (Germany), read at build time. site/src/data/jobs.json is written by
// automation/jobs.mjs every Thursday; expired jobs stay in the file and never render.
import data from '../data/jobs.json';

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
