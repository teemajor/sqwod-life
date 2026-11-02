// Citation details for the Sources list and the footnote preview cards (Nov 2026).
// Works from what is already stored (label + url), so no article needs editing:
//  • research labels follow "Author et al. 2024: what it found (Journal) · PMID …"
//  • news labels are just the outlet name ("Athletech News")
// A source can still set publisher / year / kind by hand in its front matter.
// The kind maps to the source tiers in EDITORIAL.md; unknown domains get no tag
// rather than a guessed one.
import type { Lang } from '../i18n/ui';

export type SourceKind = 'study' | 'data' | 'trade' | 'news' | 'company';
export interface SourceIn { label: string; url: string; publisher?: string; year?: string | number; kind?: SourceKind }
export interface SourceOut { title: string; publisher: string; year: string; kind: SourceKind | null; host: string }

const KIND_LABEL: Record<SourceKind, Record<Lang, string>> = {
  study: { en: 'Study', de: 'Studie' },
  data: { en: 'Primary data', de: 'Primärdaten' },
  trade: { en: 'Trade press', de: 'Fachpresse' },
  news: { en: 'News', de: 'Nachrichten' },
  company: { en: 'Company', de: 'Unternehmen' },
};
export const kindLabel = (k: SourceKind | null, lang: Lang) => (k ? KIND_LABEL[k][lang] ?? KIND_LABEL[k].en : '');

// Domain → kind. Matched against the end of the host name.
const STUDY_HOSTS = ['consensus.app', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'doi.org', 'sciencedirect.com', 'springer.com',
  'nature.com', 'bmj.com', 'jamanetwork.com', 'thelancet.com', 'frontiersin.org', 'mdpi.com', 'wiley.com', 'tandfonline.com',
  'journals.lww.com', 'academic.oup.com', 'cochranelibrary.com', 'plos.org', 'biomedcentral.com', 'sagepub.com'];
const DATA_HOSTS = ['clinicaltrials.gov', 'statista.com', 'ibisworld.com', 'globalwellnessinstitute.org', 'healthandfitness.org',
  'ihrsa.org', 'europeactive.eu', 'dssv.de', 'sec.gov', 'who.int', 'destatis.de', 'ons.gov.uk', 'census.gov', 'bls.gov', 'europa.eu',
  'gesetze-im-internet.de', 'bundesgesetzblatt.de', 'eur-lex.europa.eu', 'aeaweb.org'];
const TRADE_HOSTS = ['athletechnews.com', 'bodylife.com', 'healthclubmanagement.co.uk', 'fitt.co', 'fitnessmanagement.de',
  'clubindustry.com', 'clubsolutionsmagazine.com', 'nutraingredients.com', 'fooddive.com', 'trainingsworld.com'];
const NEWS_HOSTS = ['news.google.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'nytimes.com', 'cnbc.com',
  'techcrunch.com', 'forbes.com', 'businessinsider.com', 'handelsblatt.com', 'theguardian.com', 'bbc.co.uk'];
// Outlet names as they appear in labels (Google News links hide the real domain).
const TRADE_NAMES = ['athletech news', 'bodylife', 'health club management', 'fitt insider', 'fitness management', 'club industry',
  'club solutions', 'nutraingredients', 'food dive', 'trainingsworld'];

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const onHost = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

// "Ooi et al. 2021: BCAA & lean mass … (The Journal of Nutrition) · PMID 123"
const RESEARCH = /^(.+?)\s+((?:19|20)\d{2})[a-z]?\s*:\s*(.+?)(?:\s*\(([^()]+)\))?\s*(?:·.*)?$/;

export function describeSource(s: SourceIn): SourceOut {
  const host = hostOf(s.url);
  const label = s.label.trim();
  const isStudyHost = onHost(host, STUDY_HOSTS);
  const m = label.match(RESEARCH);
  // Only read a label as "Author Year: finding (Journal)" when it really is a paper.
  const paper = m && (isStudyHost || /et al\.|PMID|DOI/.test(label)) ? m : null;
  const title = paper ? `${paper[1]}: ${paper[3]}` : label.replace(/\s*·\s*(Consensus|PMID.*|DOI.*)$/i, '');
  let kind: SourceKind | null = null;
  if (paper || isStudyHost) kind = 'study';
  else if (onHost(host, DATA_HOSTS) || host.endsWith('.gov')) kind = 'data';
  else if (onHost(host, TRADE_HOSTS) || TRADE_NAMES.some((n) => label.toLowerCase().includes(n))) kind = 'trade';
  else if (onHost(host, NEWS_HOSTS)) kind = 'news';
  return {
    title,
    publisher: s.publisher ?? paper?.[4] ?? '',
    year: s.year != null ? String(s.year) : paper?.[2] ?? '',
    kind: s.kind ?? kind,
    host: host === 'news.google.com' ? '' : host, // a Google News link hides the real site
  };
}
