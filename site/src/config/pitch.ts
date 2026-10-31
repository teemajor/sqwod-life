// AI pitch read → Cloudflare Worker in infrastructure/investor-pitch.
// Set `endpoint` to the deployed Worker URL after `wrangler deploy`, e.g.
//   https://sqwod-investor-pitch.sqwodlife.workers.dev/pitch
// Until it's set, the pitch box renders with a "coming soon" note and no dead posts.
export const PITCH = {
  endpoint: '',
  maxChars: 2000,
};
