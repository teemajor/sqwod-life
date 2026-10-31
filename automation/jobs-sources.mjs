/**
 * Sqwod Jobs: where the jobs scraper (automation/jobs.mjs) looks, in this order.
 * Edit the query list or flip a source here; jobs.mjs reads nothing else.
 */

// Searched on every job board that takes a keyword (BA, Adzuna). Nationwide.
export const QUERIES = [
  'Fitnesstrainer',
  'Personal Trainer',
  'Fitness Coach',
  'Studioleiter',
  'Clubmanager Fitness',
  'Sport- und Fitnesskaufmann',
  'Trainer Fitnessstudio',
  'Yoga Lehrer',
  'Physiotherapeut Fitness',
];

export const USER_AGENT = 'SqwodJobsBot/1.0 (+https://sqwod.life/en/jobs/)';
export const TIMEOUT_MS = 10_000;
export const HOST_GAP_MS = 1_000;          // one request per second per host
export const EXPIRE_DAYS = 21;             // not seen for this long -> expired (kept in the file)
export const DISCOVERY_RETRY_DAYS = 90;    // a brand with no careers page found is retried after this

export const SOURCES = [
  {
    id: 'ba', enabled: true, label: 'Bundesagentur für Arbeit',
    // Jobsuche API, documented at https://jobsuche.api.bund.dev/. The key is the published one.
    url: 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs',   // v4 answered 403 (31 Oct 2026)
    // Tried in order until one returns postings (v6 answered 200 but empty on 31 Oct 2026).
    endpoints: [
      'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs',
      'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs',
    ],
    apiKey: 'jobboerse-jobsuche',
    detail: (refnr) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`,
  },
  {
    id: 'adzuna', enabled: true, label: 'Adzuna',
    // Free developer key (developer.adzuna.com). Secrets ADZUNA_APP_ID / ADZUNA_APP_KEY;
    // without them the source is skipped and the run log says so.
    url: 'https://api.adzuna.com/v1/api/jobs/de/search',
  },
  {
    id: 'career-page', enabled: true, label: 'Career pages',
    // Brands in automation/jobs-brands.json. Only roles with a German location count.
  },
  {
    id: 'dssv', enabled: true, label: 'DSSV',
    // DSSV (Arbeitgeberverband deutscher Fitness- und Gesundheits-Anlagen) public job board.
    // Read as HTML: JobPosting JSON-LD first, else job links on the page and their detail pages.
    url: 'https://www.dssv.de/jobboerse/',
  },
  {
    // Off (31 Oct 2026): /jobs/ is a 404 and the board's current address is not known. Set the
    // right URL and flip `enabled` once it is; it only adds remote roles open to Germany.
    id: 'fitt', enabled: false, label: 'Fitt Insider',
    // US board. Only roles that explicitly allow Germany count (region "Remote DE"); the
    // source is credited on the row.
    url: 'https://insider.fitt.co/jobs/',
  },
  // Indeed and StepStone both forbid automated access in their terms of use, and Adzuna and
  // the BA API already carry most of their postings. Do NOT scrape them. If this flag is ever
  // flipped, jobs.mjs still checks robots.txt and stops at the first 403 from the host.
  { id: 'indeed', enabled: false, label: 'Indeed', url: 'https://de.indeed.com/jobs' },
  { id: 'stepstone', enabled: false, label: 'StepStone', url: 'https://www.stepstone.de/jobs' },
];

// Applicant-tracking systems with a public JSON (or XML) feed. `match` finds the board id
// in a careers link; `feed` is where the postings are read.
export const ATS = [
  { type: 'personio', match: /https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i,
    feed: (id) => `https://${id}.jobs.personio.de/xml?language=de` },
  { type: 'greenhouse', match: /https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i,
    feed: (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true` },
  { type: 'lever', match: /https?:\/\/jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i,
    feed: (id) => `https://api.lever.co/v0/postings/${id}?mode=json` },
  { type: 'ashby', match: /https?:\/\/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i,
    feed: (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}?includeCompensation=true` },
  { type: 'smartrecruiters', match: /https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i,
    feed: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings?country=de&limit=100` },
  { type: 'workable', match: /https?:\/\/apply\.workable\.com\/([a-z0-9_-]+)/i,
    feed: (id) => `https://apply.workable.com/api/v1/widget/accounts/${id}` },
  // No public feed: the careers URL is saved, postings are read from JobPosting JSON-LD.
  { type: 'join', match: /https?:\/\/join\.com\/companies\/([a-z0-9_-]+)/i, feed: null },
  { type: 'softgarden', match: /https?:\/\/([a-z0-9-]+)\.softgarden\.io/i, feed: null },
];

// Paths and link texts tried when a brand has no careersUrl yet.
export const CAREER_PATHS = ['/careers', '/jobs', '/karriere', '/de/karriere'];
export const CAREER_LINK_RX = /^\s*(careers?|karriere|jobs|join us|work with us|stellenangebote)\s*$/i;
