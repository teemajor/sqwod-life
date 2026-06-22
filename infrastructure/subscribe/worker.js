/**
 * Sqwod subscribe — Cloudflare Worker.
 *
 * Captures newsletter sign-ups from the site and adds them to a Resend segment
 * (the same segment ID we broadcast the Daily to). The Resend API key lives only
 * here as a secret — never in the browser.
 *
 * Route:
 *   POST /subscribe   ← email + lang (form-encoded OR JSON). Adds/updates the
 *                       contact in the matching segment, then 303-redirects to
 *                       the thank-you page (native form) or returns JSON (fetch).
 *
 * Secrets (wrangler secret put …):
 *   RESEND_API_KEY     re_…
 * Vars (wrangler.toml [vars]):
 *   RESEND_SEGMENT_EN  segment ID for the English list
 *   RESEND_SEGMENT_DE  segment ID for the German list
 *   SITE_BASE          e.g. https://sqwod.life
 *   ALLOW_ORIGIN       e.g. https://sqwod.life (CORS for fetch sign-ups)
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
});
const json = (o, s, env) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors(env) } });
const redirect = (url) => new Response(null, { status: 303, headers: { Location: url } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (req.method === 'POST' && url.pathname === '/subscribe') return subscribe(req, env);
    return new Response('Sqwod subscribe', { status: 200 });
  },
};

async function subscribe(req, env) {
  // Accept either a posted form or a JSON fetch body.
  let email = '', lang = 'en', hp = '';
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({}));
    email = (b.email || '').toString().trim();
    lang = b.lang === 'de' ? 'de' : 'en';
    hp = (b.company || '').toString();           // honeypot
  } else {
    const form = await req.formData();
    email = (form.get('email') || '').toString().trim();
    lang = (form.get('lang') || '') === 'de' ? 'de' : 'en';
    hp = (form.get('company') || '').toString(); // honeypot
  }

  const base = env.SITE_BASE || 'https://sqwod.life';
  const back = (state) => `${base}/${lang}/subscribe?status=${state}`;

  // Silently accept bots (honeypot filled) — look successful, do nothing.
  if (hp) return ct.includes('application/json') ? json({ ok: true }, 200, env) : redirect(back('ok'));
  if (!EMAIL_RE.test(email)) return ct.includes('application/json') ? json({ ok: false, error: 'invalid_email' }, 400, env) : redirect(back('error'));

  const segment = lang === 'de' ? env.RESEND_SEGMENT_DE : env.RESEND_SEGMENT_EN;
  const payload = { email, unsubscribed: false };
  if (segment) payload.segments = [{ id: segment }];

  const r = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Resend treats a re-subscribe of an existing email as 200/409-ish; treat both as success.
  if (!r.ok && r.status !== 409) {
    const msg = (await r.text()).slice(0, 200);
    console.log('resend contact error', r.status, msg);
    return ct.includes('application/json') ? json({ ok: false, error: 'provider', detail: msg }, 502, env) : redirect(back('error'));
  }
  return ct.includes('application/json') ? json({ ok: true }, 200, env) : redirect(back('ok'));
}
