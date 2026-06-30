// Umami analytics (self-hosted, cookieless). Fill these after you deploy Umami:
//   src        = your Umami script URL, e.g. https://analytics.sqwod.life/script.js
//   websiteId  = the Website ID Umami gives you (a UUID)
// Until both are set, no tracking script loads (nothing breaks, zero requests).
// Custom events are emitted via data-umami-event attributes on key elements
// (share buttons, subscribe CTAs, report unlock, Move-of-the-Day) — Umami captures
// them automatically once the script is live.
export const ANALYTICS = {
  src: '',          // e.g. 'https://analytics.sqwod.life/script.js'
  websiteId: '',    // e.g. '00000000-0000-0000-0000-000000000000'
};
