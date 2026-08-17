/**
 * Sqwod subscribe — Cloudflare Worker (double opt-in).
 *
 * Sign-ups are NOT written to Resend on submit. Instead the Worker sends a
 * confirmation email containing a signed, expiring token. The contact is only
 * created in Resend when that link is clicked — so a bot that posts an address
 * it doesn't own never lands on the list.
 *
 * Routes:
 *   POST /subscribe   ← email + lang (form-encoded OR JSON). Runs bot checks,
 *                       emails a confirmation link, redirects to ?status=pending.
 *   GET  /confirm?t=… ← verifies the token, creates the contact in the matching
 *                       segment with locale/signup_source/confirmed_at, then
 *                       redirects to ?status=confirmed.
 *
 * Secrets (wrangler secret put …):
 *   RESEND_API_KEY     re_…
 *   CONFIRM_SECRET     long random string — signs the confirmation tokens
 * Vars (wrangler.toml [vars]):
 *   RESEND_SEGMENT_EN  segment ID for the English list
 *   RESEND_SEGMENT_DE  segment ID for the German list
 *   RESEND_FROM        e.g. "Sqwod Daily <daily@sqwod.life>"
 *   SITE_BASE          e.g. https://sqwod.life
 *   ALLOW_ORIGIN       e.g. https://sqwod.life (CORS + origin gate)
 *   CONFIRM_TTL_HOURS  token lifetime, default 48
 *   MIN_FILL_MS        minimum time-on-form in ms, default 2500
 * Bindings (optional but recommended):
 *   SUBS_KV            KV namespace used for per-IP rate limiting
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL = 254;
const RATE_MAX = 5;            // sign-ups allowed per IP…
const RATE_WINDOW = 3600;      // …per this many seconds

// Throwaway-inbox domains. Not exhaustive by design — the confirmation step is
// the real gate; this just avoids burning sends on known junk.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'yopmail.com', 'sharklasers.com', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'throwawaymail.com',
  'mohmal.com', 'emailondeck.com', 'spam4.me', 'moakt.com', 'tempr.email',
]);

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
    if (req.method === 'GET' && url.pathname === '/confirm') return confirm(req, env, url);
    return new Response('Sqwod subscribe', { status: 200 });
  },
};

/* ---------------------------------------------------------------- tokens --
 * A token is base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
 * Everything the confirm step needs lives in the payload, so no pending-signup
 * table is required — the signature is what makes it trustworthy.
 */
const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payloadObj, secret) {
  const body = new TextEncoder().encode(JSON.stringify(payloadObj));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, body);
  return `${b64u.enc(body)}.${b64u.enc(sig)}`;
}

async function verify(token, secret) {
  const [head, tail] = (token || '').split('.');
  if (!head || !tail) return null;
  const body = b64u.dec(head);
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, b64u.dec(tail), body);
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(body)); } catch (_) { return null; }
}

/* ------------------------------------------------------------ POST /subscribe */
async function subscribe(req, env) {
  const ct = req.headers.get('content-type') || '';
  const wantsJson = ct.includes('application/json');

  let email = '', lang = 'en', hp = '', source = '', ts = 0;
  if (wantsJson) {
    const b = await req.json().catch(() => ({}));
    email = (b.email || '').toString().trim().toLowerCase();
    lang = b.lang === 'de' ? 'de' : 'en';
    hp = (b.company || '').toString();
    source = (b.source || '').toString().slice(0, 60);
    ts = parseInt(b.ts, 10) || 0;
  } else {
    const form = await req.formData();
    email = (form.get('email') || '').toString().trim().toLowerCase();
    lang = (form.get('lang') || '') === 'de' ? 'de' : 'en';
    hp = (form.get('company') || '').toString();
    source = (form.get('source') || '').toString().slice(0, 60);
    ts = parseInt(form.get('ts'), 10) || 0;
  }

  const base = env.SITE_BASE || 'https://sqwod.life';
  const back = (state) => `${base}/${lang}/subscribe?status=${state}`;
  const okResponse = () => (wantsJson ? json({ ok: true }, 200, env) : redirect(back('pending')));
  const fail = (code, status) => (wantsJson ? json({ ok: false, error: code }, status, env) : redirect(back('error')));

  // 1. Honeypot — a real browser never fills the hidden field. Look successful.
  if (hp) return okResponse();

  // 2. Origin gate. Browsers attach Origin to cross-origin form posts and to
  //    fetch(); a scripted POST usually doesn't. Missing Origin is rejected,
  //    which is the single biggest change vs the old worker.
  const allow = env.ALLOW_ORIGIN;
  if (allow) {
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const originOk = origin === allow || (!origin && referer.startsWith(allow + '/'));
    if (!originOk) return fail('origin', 403);
  }

  // 3. Time-on-form. Absent ts is tolerated (JS-off); an implausibly fast fill
  //    is not.
  const minFill = parseInt(env.MIN_FILL_MS, 10) || 2500;
  if (ts && Date.now() - ts < minFill) return fail('too_fast', 429);

  // 4. Shape + disposable-domain checks.
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) return fail('invalid_email', 400);
  const domain = email.split('@')[1] || '';
  if (DISPOSABLE.has(domain)) return fail('disposable', 400);

  // 5. Per-IP rate limit (skipped silently if no KV binding).
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (env.SUBS_KV && ip) {
    const key = `rate:${ip}`;
    const seen = parseInt(await env.SUBS_KV.get(key), 10) || 0;
    if (seen >= RATE_MAX) return fail('rate_limited', 429);
    await env.SUBS_KV.put(key, String(seen + 1), { expirationTtl: RATE_WINDOW });
  }

  // 6. Mint the confirmation link and email it. Nothing hits Resend contacts yet.
  if (!env.CONFIRM_SECRET) {
    console.log('CONFIRM_SECRET missing — refusing to sign tokens');
    return fail('server_misconfigured', 500);
  }
  const ttlHours = parseInt(env.CONFIRM_TTL_HOURS, 10) || 48;
  const token = await sign({
    e: email,
    l: lang,
    s: source || 'site',
    x: Date.now() + ttlHours * 3600 * 1000,
  }, env.CONFIRM_SECRET);

  const confirmUrl = `${new URL(req.url).origin}/confirm?t=${encodeURIComponent(token)}`;
  const sent = await sendConfirmation(env, email, lang, confirmUrl, ttlHours);
  if (!sent) return fail('provider', 502);

  return okResponse();
}

/* ------------------------------------------------------------- GET /confirm */
async function confirm(req, env, url) {
  const base = env.SITE_BASE || 'https://sqwod.life';
  const data = env.CONFIRM_SECRET ? await verify(url.searchParams.get('t'), env.CONFIRM_SECRET) : null;
  if (!data) return redirect(`${base}/en/subscribe?status=invalid`);

  const lang = data.l === 'de' ? 'de' : 'en';
  if (!data.x || Date.now() > data.x) return redirect(`${base}/${lang}/subscribe?status=expired`);

  const segment = lang === 'de' ? env.RESEND_SEGMENT_DE : env.RESEND_SEGMENT_EN;
  const payload = {
    email: data.e,
    unsubscribed: false,
    properties: {
      locale: lang,
      signup_source: data.s || 'site',
      confirmed_at: new Date().toISOString(),
    },
  };
  if (segment) payload.segments = [{ id: segment }];

  const r = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Re-confirming an address that already exists is a success, not an error.
  if (!r.ok && r.status !== 409) {
    console.log('resend contact error', r.status, (await r.text()).slice(0, 200));
    return redirect(`${base}/${lang}/subscribe?status=error`);
  }
  return redirect(`${base}/${lang}/subscribe?status=confirmed`);
}

/* ------------------------------------------------------- confirmation email */
async function sendConfirmation(env, email, lang, confirmUrl, ttlHours) {
  const t = lang === 'de' ? {
    subject: 'Bestätige deine Anmeldung zum Sqwod Daily',
    head: 'Nur noch ein Klick.',
    body: 'Klick den Button, um deine Anmeldung zum Sqwod Daily zu bestätigen. Ohne Bestätigung schicken wir dir nichts.',
    cta: 'Anmeldung bestätigen',
    fine: `Der Link ist ${ttlHours} Stunden gültig. Du hast dich nicht angemeldet? Dann ignorier diese Mail einfach — es passiert nichts.`,
    fallback: 'Button geht nicht? Kopier diesen Link in den Browser:',
  } : {
    subject: 'Confirm your Sqwod Daily subscription',
    head: 'One click to go.',
    body: "Hit the button to confirm your Sqwod Daily subscription. We won't send you anything until you do.",
    cta: 'Confirm subscription',
    fine: `This link works for ${ttlHours} hours. Didn't sign up? Ignore this email — nothing happens.`,
    fallback: "Button not working? Paste this link into your browser:",
  };

  const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#111;border:1px solid #262626;border-radius:16px">
    <tr><td style="padding:32px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a8a8a">Sqwod Daily</div>
      <h1 style="margin:14px 0 10px;font-size:24px;line-height:1.2;letter-spacing:-.02em;color:#fff">${t.head}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#b8b8b8">${t.body}</p>
      <a href="${confirmUrl}" style="display:inline-block;background:#fff;color:#0a0a0a;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:999px">${t.cta}</a>
      <p style="margin:26px 0 6px;font-size:12px;color:#6f6f6f">${t.fallback}</p>
      <p style="margin:0;font-size:12px;color:#8a8a8a;word-break:break-all">${confirmUrl}</p>
      <p style="margin:22px 0 0;font-size:11.5px;line-height:1.6;color:#5c5c5c;border-top:1px solid #262626;padding-top:16px">${t.fine}</p>
    </td></tr>
  </table>
</body></html>`;

  const text = `${t.head}\n\n${t.body}\n\n${confirmUrl}\n\n${t.fine}`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Sqwod Daily <daily@sqwod.life>',
      to: [email],
      subject: t.subject,
      html,
      text,
    }),
  });
  if (!r.ok) console.log('resend send error', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}
