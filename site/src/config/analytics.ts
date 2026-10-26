// Self-hosted Umami (Railway, cookieless — no consent banner needed). We own the
// database, so retention is unlimited and the API is free (powers the Command Center).
// Custom events are emitted via data-umami-event attributes on key elements
// (share buttons, subscribe CTAs, report unlock, Move-of-the-Day) — Umami captures
// them automatically.
// Oct 2026 additions: daily-play / daily-listen-50 / daily-listen-complete (episode
// player, via umami.track), daily-listen-click (homepage), listen-spotify, deal-click
// (product, placement, earns), daily-rec-click, sponsor-click, article-read. The beacon only loads when both values are set.
export const ANALYTICS = {
  src: 'https://umami-production-5dc9.up.railway.app/script.js',
  websiteId: '35fd123d-0a68-4295-a875-8947947b5d76',
};
