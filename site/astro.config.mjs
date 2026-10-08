import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { INDEX_COMPARE_PAGES, dailyIsFresh } from './src/config/seo.mjs';

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
        if (!INDEX_COMPARE_PAGES && page.includes('/verified/compare/')) return false;
        const m = page.match(/\/daily\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (m && !dailyIsFresh(m[1])) return false;
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
