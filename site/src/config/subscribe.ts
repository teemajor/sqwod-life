// Subscribe capture → Resend (via the Cloudflare Worker in infrastructure/subscribe).
// Set `endpoint` to your deployed Worker URL after `wrangler deploy`, e.g.
//   https://sqwod-subscribe.<you>.workers.dev/subscribe   (or https://join.sqwod.life/subscribe)
// Until it's set, forms render disabled with a "coming soon" note (no dead posts).
export const SUBSCRIBE = {
  endpoint: 'https://sqwod-subscribe.sqwodlife.workers.dev/subscribe',
};
