// Index-budget policy for sqwod.life (plain .mjs so astro.config.mjs and
// .astro files can both import it).
//
// WHY (2026-10-08): Search Console showed 0 indexed pages after 3.5 months.
// Once Google does crawl, it will find ~1,100 URLs on a brand-new domain with
// no backlinks — roughly half of them programmatic "X vs Y" compare pages and
// ~170 short daily episodes. On a young domain that reads as thin/scaled
// content and drags the strong pages (reports, reviews, evidence) down with it.
// So: keep those pages for readers and internal linking, but keep them OUT of
// Google's index and the sitemap until the domain has authority. Flip the
// flags below to re-open them — it's a one-line change.

// Daily episodes older than this many days get noindex,follow and leave the
// sitemap. Fresh episodes stay indexable (NewsArticle schema, unique summary).
export const DAILY_INDEX_DAYS = 30;

// Programmatic /verified/compare/<a>-vs-<b> pages (554 URLs). false = noindex,follow
// and excluded from the sitemap. Set true once the site has real inbound links
// and the reviews themselves are ranking.
export const INDEX_COMPARE_PAGES = false;

// Helper shared by the sitemap filter: is a daily URL still fresh?
export function dailyIsFresh(urlSlug, now = Date.now()) {
  const t = Date.parse(urlSlug);
  if (Number.isNaN(t)) return true; // unknown slug shape → don't hide it
  return now - t <= DAILY_INDEX_DAYS * 86400000;
}
