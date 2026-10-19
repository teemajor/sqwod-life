// Sqwod Daily fresh start (decided 2026-10-19).
//
// The Daily was relaunched with a new writing prompt (plain news, real facts,
// one language per edition) and new sources (trade press first, Fitt Insider's
// curated brief). Issues from before that were written the old way, so they are
// retired from the site, the podcast feeds and the email archive.
//
// Nothing is deleted: the old issue files stay in src/content/daily. To bring
// them back, set DAILY_START to an earlier date. It is a one-line change.
//
// Plain .mjs so the Astro pages and the automation scripts can both import it.

export const DAILY_START = '2026-10-19';

// Is this issue live? Published AND on or after the relaunch date.
// Takes the issue's status and date (a Date or a 'YYYY-MM-DD' string).
export function isLiveIssue(status, date) {
  if (status !== 'published') return false;
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date || '').slice(0, 10);
  return day >= DAILY_START;
}
