import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import { INDEX_COMPARE_PAGES, dailyIsFresh, newsTakeIsFresh } from './src/config/seo.mjs';

// Article URLs the index-budget policy hides (newsTake past NEWS_TAKE_INDEX_DAYS).
// Read straight from the content files: the sitemap filter only sees URLs.
const ART_DIR = new URL('./src/content/articles/', import.meta.url);
const hiddenArticleUrls = new Set();
for (const f of readdirSync(ART_DIR)) {
  if (!f.endsWith('.md')) continue;
  const fm = readFileSync(new URL(f, ART_DIR), 'utf8').split(/^---\s*$/m)[1] || '';
  if (!/^newsTake:\s*true\s*$/m.test(fm)) continue;
  const slug = (fm.match(/^urlSlug:\s*(\S+)/m) || [])[1];
  const lang = ((fm.match(/^lang:\s*"?(\w+)/m) || [])[1]);
  const date = ((fm.match(/^publishedAt:\s*(\S+)/m) || [])[1]);
  if (slug && lang && !newsTakeIsFresh(date)) hiddenArticleUrls.add(`https://sqwod.life/${lang}/analysis/${slug}/`);
}

// sqwod.life — one domain, /en/ + /de/ parity.
// Routing handled explicitly via the [lang] dynamic segment (see src/pages).
export default defineConfig({
  site: 'https://sqwod.life',
  integrations: [
    sitemap({
      // exclude redirect stubs + non-content routes from the sitemap, plus
      // everything the index-budget policy marks noindex (src/config/seo.mjs)
      filter: (page) => {
        if (page.includes('/go/') || page === 'https://sqwod.life/') return false;
        // campaign landing page (noindex) and its short-link stubs
        if (/^https:\/\/sqwod\.life\/((en|de)\/)?join\/?$/.test(page) || /^https:\/\/sqwod\.life\/pricing\/?$/.test(page)) return false;
        if (!INDEX_COMPARE_PAGES && page.includes('/verified/compare/')) return false;
        const m = page.match(/\/daily\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (m && !dailyIsFresh(m[1])) return false;
        if (hiddenArticleUrls.has(page)) return false;
        // old lane pages (Move/Build/Signal) are redirect stubs since 27 Oct 2026
        if (/\/articles\/(move|build|signal)\/?$/.test(page)) return false;
        return true;
      },
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', de: 'de' },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    // Let our own src/pages/index.astro handle the root → /en/ redirect (instant,
    // invisible). Astro's built-in one shows a 2s "Redirecting…" interstitial.
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  // VITE_CACHE_DIR lets sandboxed/CI environments relocate Vite's dep cache
  // off restricted mounts. Unset in normal dev → default behavior.
  vite: { cacheDir: process.env.VITE_CACHE_DIR || undefined },
});
