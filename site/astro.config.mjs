import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// sqwod.life — one domain, /en/ + /de/ parity.
// Routing is handled explicitly via the [lang] dynamic segment (see src/pages),
// so behaviour is predictable; i18n config below drives sitemap + hreflang.
export default defineConfig({
  site: 'https://sqwod.life',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: { prefixDefaultLocale: true },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', de: 'de' },
      },
    }),
  ],
});
