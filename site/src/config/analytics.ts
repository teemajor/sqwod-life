// Self-hosted Umami (Railway, cookieless — no consent banner needed). We own the
// database, so retention is unlimited and the API is free (powers the Command Center).
// Custom events are emitted via data-umami-event attributes on key elements
// (share buttons, subscribe CTAs, report unlock, Move-of-the-Day) — Umami captures
// them automatically. The beacon only loads when both values are set.
export const ANALYTICS = {
  src: 'https://umami-production-5dc9.up.railway.app/script.js',
  websiteId: '35fd123d-0a68-4295-a875-8947947b5d76',
};
