import { defineConfig } from 'astro/config';

// sqwod.life — one domain, /en/ + /de/ parity.
// Routing handled explicitly via the [lang] dynamic segment (see src/pages).
// (Sitemap integration temporarily removed — re-add once i18n sitemap config is finalized.)
export default defineConfig({
  site: 'https://sqwod.life',
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
