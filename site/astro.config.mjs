import { defineConfig } from 'astro/config';

// sqwod.life — one domain, /en/ + /de/ parity.
// Routing handled explicitly via the [lang] dynamic segment (see src/pages).
// (Sitemap integration temporarily removed — re-add once i18n sitemap config is finalized.)
export default defineConfig({
  site: 'https://sqwod.life',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: { prefixDefaultLocale: true },
  },
});
