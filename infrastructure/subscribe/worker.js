/**
 * Sqwod subscribe — Cloudflare Worker (double opt-in).
 *
 * Sign-ups are NOT written to Resend on submit. Instead the Worker sends a
 * confirmation email containing a signed, expiring token. The contact is only
 * created in Resend when that link is clicked — so a bot that posts an address
 * it doesn't own never lands on the list.
 *
 * Routes:
 *   POST /subscribe   ← email + lang (+ optional role: studio|coach|brand|investor|company|creator)
 *                       (form-encoded OR JSON). Runs bot checks,
 *                       emails a confirmation link, redirects to ?status=pending.
 *   GET  /confirm?t=… ← verifies the token, creates the contact in the matching
 *                       segment with locale/signup_source/confirmed_at, then
 *                       redirects to ?status=confirmed. Also: mints the new
 *                       subscriber's referral code, credits the referrer (if the
 *                       sign-up carried ?ref=CODE), sends the welcome email with
 *                       the subscriber's own referral link, and sends the reward
 *                       email when a referrer hits a milestone.
 *   POST /refer       ← email + lang: re-sends a subscriber their referral link
 *                       and current count (only if the address is on the list;
 *                       the response never reveals whether it is).
 *
 * Referral programme (needs the SUBS_KV binding; without it referrals are ignored):
 *   code      = first 10 hex chars of HMAC(CONFIRM_SECRET, "ref:" + email), so a
 *               subscriber's code is stable and needs no table.
 *   link      = SITE_BASE/<lang>/subscribe?ref=<code>   (forms carry ?ref through)
 *   KV keys   = ref:<code> → email · refcount:<code> → n · refd:<email> → code
 *   Resend    = contact properties ref_code, referred_by, referral_count
 *   rewards   = REFERRAL_REWARDS_JSON, {"3":{"en":{"subject":..,"body":..,"url":..},"de":{..}}, ...}
 *               (defaults below); optional SWAG_WORKER_URL + SWAG_SECRET also POST
 *               {email, milestone} to infrastructure/swag-fulfill for physical rewards.
 *
 * Secrets (wrangler secret put …):
 *   RESEND_API_KEY     re_…
 *   CONFIRM_SECRET     long random string — signs the confirmation tokens
 * Vars (wrangler.toml [vars]):
 *   RESEND_SEGMENT_EN  segment ID for the English list
 *   RESEND_SEGMENT_DE  segment ID for the German list
 *   RESEND_FROM        e.g. "Sqwod Daily <daily@sqwod.life>"
 *   CONFIRM_FROM       sender for the confirmation mail only. Must sit on a domain
 *                      with click tracking OFF (notify.sqwod.life), otherwise the
 *                      confirm link is rewritten and link-prefetching mail scanners
 *                      auto-confirm sign-ups. Falls back to RESEND_FROM.
 *   SITE_BASE          e.g. https://sqwod.life
 *   ALLOW_ORIGIN       e.g. https://sqwod.life (CORS + origin gate)
 *   CONFIRM_TTL_HOURS  token lifetime, default 48
 *   MIN_FILL_MS        minimum time-on-form in ms, default 2500
 *   REFERRAL_REWARDS_JSON  optional override of the milestone rewards (see above)
 *   SWAG_WORKER_URL    optional, e.g. https://swag.sqwod.life (physical rewards)
 * Secrets (optional): SWAG_SECRET  shared secret for the swag Worker
 * Bindings (optional but recommended):
 *   SUBS_KV            KV namespace: per-IP rate limiting + referral ledger
 *                      (created automatically by .github/workflows/deploy-subscribe-worker.yml)
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL = 254;
const RATE_MAX = 5;            // sign-ups allowed per IP…
const RATE_WINDOW = 3600;      // …per this many seconds

// Self-reported audience segment from the role picker. Anything else is stored
// as 'unknown' so a crafted POST can't write arbitrary values to Resend.
const ROLES = new Set(['coach', 'studio', 'brand', 'creator', 'investor', 'company']);
const cleanRole = (v) => { const r = (v || '').toString().trim().toLowerCase(); return ROLES.has(r) ? r : ''; };

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
    if (req.method === 'POST' && url.pathname === '/refer') return refer(req, env);
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

  let email = '', lang = 'en', hp = '', source = '', ts = 0, role = '', ref = '';
  if (wantsJson) {
    const b = await req.json().catch(() => ({}));
    email = (b.email || '').toString().trim().toLowerCase();
    lang = b.lang === 'de' ? 'de' : 'en';
    hp = (b.company || '').toString();
    source = (b.source || '').toString().slice(0, 60);
    ts = parseInt(b.ts, 10) || 0;
    role = cleanRole(b.role);
    ref = cleanRef(b.ref);
  } else {
    const form = await req.formData();
    email = (form.get('email') || '').toString().trim().toLowerCase();
    lang = (form.get('lang') || '') === 'de' ? 'de' : 'en';
    hp = (form.get('company') || '').toString();
    source = (form.get('source') || '').toString().slice(0, 60);
    ts = parseInt(form.get('ts'), 10) || 0;
    role = cleanRole(form.get('role'));
    ref = cleanRef(form.get('ref'));
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
    r: role,
    f: ref,                                   // referrer's code, credited on confirm
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
      role: cleanRole(data.r) || 'unknown',
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
  // Referral bookkeeping + welcome email only for a genuinely NEW contact, so a
  // re-confirm can never credit a referrer twice or re-send the welcome.
  if (r.ok) {
    try { await onNewSubscriber(env, data.e, lang, data.f || ''); } catch (e) { console.log('referral step failed', String(e).slice(0, 200)); }
  }
  return redirect(`${base}/${lang}/subscribe?status=confirmed`);
}

/* ------------------------------------------------------------ referrals ----
 * No table of codes: a subscriber's code is derived from their email with the
 * signing secret, so it is stable, unguessable and needs nothing stored to issue.
 * KV only maps code → email (for crediting) and keeps the counts.
 */
const REF_RE = /^[a-f0-9]{10}$/;
const cleanRef = (v) => { const r = (v || '').toString().trim().toLowerCase(); return REF_RE.test(r) ? r : ''; };
async function refCode(env, email) {
  const key = await hmacKey(env.CONFIRM_SECRET);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('ref:' + email));
  return [...new Uint8Array(mac)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const refLink = (env, lang, code) => `${env.SITE_BASE || 'https://sqwod.life'}/${lang}/subscribe?ref=${code}`;

// Milestone rewards. 3 = what Tee asked for (a free Intelligence report). NOTE: the
// reports already unlock with any email, so this reward is a thank-you, not something
// scarce. Swap REFERRAL_REWARDS_JSON (or wire SWAG_WORKER_URL) for stickers / tee /
// hoodie when the Shopify variants exist; the copy in newsletter.mjs already promises those.
const DEFAULT_REWARDS = {
  3: {
    en: { subject: 'You brought 3 people to Sqwod Daily. Here is your report.', body: 'Three confirmed referrals. Thank you. As promised, your Sqwod Intelligence report, free, with every chart, table and source:', url: 'https://sqwod.life/en/intelligence/state-of-wearables-2026?utm_source=referral&utm_medium=email&utm_campaign=reward-3', cta: 'Open the report' },
    de: { subject: 'Du hast 3 Leute zu Sqwod Daily gebracht. Hier ist dein Report.', body: 'Drei bestätigte Empfehlungen. Danke. Wie versprochen: dein Sqwod-Intelligence-Report, kostenlos, mit allen Grafiken, Tabellen und Quellen:', url: 'https://sqwod.life/de/intelligence/state-of-wearables-2026?utm_source=referral&utm_medium=email&utm_campaign=reward-3', cta: 'Report öffnen' },
  },
  10: {
    en: { subject: '10 referrals. You are officially Sqwod crew.', body: 'Ten people joined Sqwod Daily because of you. Reply to this email with your postal address and we will send you Sqwod gear.', url: '', cta: '' },
    de: { subject: '10 Empfehlungen. Du bist offiziell Sqwod-Crew.', body: 'Zehn Leute sind wegen dir bei Sqwod Daily. Antworte auf diese Mail mit deiner Postadresse und wir schicken dir Sqwod-Gear.', url: '', cta: '' },
  },
};
function rewards(env) {
  try { const o = JSON.parse(env.REFERRAL_REWARDS_JSON || ''); if (o && typeof o === 'object') return o; } catch (_) {}
  return DEFAULT_REWARDS;
}

async function resendPatch(env, email, properties) {
  const r = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
  if (!r.ok) console.log('resend patch error', r.status, (await r.text()).slice(0, 160));
  return r.ok;
}
async function resendHas(env, email) {
  const r = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
  return r.ok;
}

async function onNewSubscriber(env, email, lang, referredBy) {
  const code = await refCode(env, email);
  const props = { ref_code: code };
  let credited = '';
  if (env.SUBS_KV) {
    await env.SUBS_KV.put(`ref:${code}`, email);
    if (referredBy && referredBy !== code && !(await env.SUBS_KV.get(`refd:${email}`))) {
      const referrer = await env.SUBS_KV.get(`ref:${referredBy}`);
      if (referrer && referrer !== email) {
        await env.SUBS_KV.put(`refd:${email}`, referredBy);           // this address is credited once, ever
        const n = (parseInt(await env.SUBS_KV.get(`refcount:${referredBy}`), 10) || 0) + 1;
        await env.SUBS_KV.put(`refcount:${referredBy}`, String(n));
        await resendPatch(env, referrer, { referral_count: n });
        credited = referredBy;
        const tier = rewards(env)[String(n)];
        if (tier) await sendReward(env, referrer, n, tier);
      }
    }
  }
  if (credited) props.referred_by = credited;
  await resendPatch(env, email, props);
  await sendWelcome(env, email, lang, refLink(env, lang, code));
}

async function sendReward(env, email, n, tier) {
  const rl = await resendHas(env, email) ? await refLang(env, email) : 'en';
  const t = tier[rl] || tier.en || Object.values(tier)[0];
  if (!t || !t.subject) return;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;color:#111;line-height:1.6">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Daily · ${n} referrals</p>
<h2 style="margin:4px 0 10px">${esc(t.subject)}</h2><p>${esc(t.body)}</p>
${t.url ? `<p><a href="${esc(t.url)}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">${esc(t.cta || 'Open')}</a></p>` : ''}</div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Sqwod Daily <daily@sqwod.life>', to: email, subject: t.subject, html, text: `${t.subject}\n\n${t.body}${t.url ? `\n\n${t.url}` : ''}` }),
  });
  if (env.SWAG_WORKER_URL && env.SWAG_SECRET) {
    await fetch(`${env.SWAG_WORKER_URL.replace(/\/$/, '')}/reward`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Sqwod-Secret': env.SWAG_SECRET }, body: JSON.stringify({ email, milestone: n }) }).catch(() => {});
  }
}
async function refLang(env, email) {
  try {
    const r = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
    const j = r.ok ? await r.json() : null;
    return (j?.properties?.locale || j?.data?.properties?.locale) === 'de' ? 'de' : 'en';
  } catch (_) { return 'en'; }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function sendWelcome(env, email, lang, link) {
  const t = lang === 'de' ? {
    subject: 'Willkommen bei Sqwod Daily. Hier ist dein Empfehlungslink.',
    head: 'Du bist dabei.',
    body: 'Die nächste Ausgabe kommt am nächsten Werktag um sechs. Lesen oder hören, fünf Minuten.',
    refHead: 'Kennst du drei Leute, die das lesen sollten?',
    refBody: 'Das ist dein persönlicher Link. Drei bestätigte Anmeldungen darüber, und du bekommst einen Sqwod-Intelligence-Report geschenkt. Wir zählen für dich.',
    cta: 'Link kopieren und teilen',
  } : {
    subject: 'Welcome to Sqwod Daily. Here is your referral link.',
    head: "You're in.",
    body: 'The next issue lands on the next weekday at six. Read it or hear it, five minutes.',
    refHead: 'Know three people who should read this?',
    refBody: 'This is your personal link. Three confirmed sign-ups through it and we send you a Sqwod Intelligence report, free. We count for you.',
    cta: 'Copy and share your link',
  };
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;color:#111;line-height:1.6">
<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Daily</p>
<h2 style="margin:4px 0 10px">${t.head}</h2><p>${t.body}</p>
<h3 style="margin:22px 0 6px">${t.refHead}</h3><p style="margin:0 0 10px">${t.refBody}</p>
<p style="background:#f4f4f4;padding:12px 14px;border-radius:10px;word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:14px"><a href="${link}" style="color:#111">${link}</a></p>
<p><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">${t.cta}</a></p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Sqwod Daily <daily@sqwod.life>', to: email, subject: t.subject, html, text: `${t.head}\n\n${t.body}\n\n${t.refHead}\n${t.refBody}\n\n${link}` }),
  });
}

/* ---------------------------------------------------------------- POST /refer
 * The /refer page: a subscriber asks for their link again. We email it (with the
 * count) only if the address is on the list, and answer the same way either way.
 */
async function refer(req, env) {
  const ct = req.headers.get('content-type') || '';
  const wantsJson = ct.includes('application/json');
  let email = '', lang = 'en', hp = '';
  if (wantsJson) { const b = await req.json().catch(() => ({})); email = (b.email || '').toString().trim().toLowerCase(); lang = b.lang === 'de' ? 'de' : 'en'; hp = (b.company || '').toString(); }
  else { const f = await req.formData(); email = (f.get('email') || '').toString().trim().toLowerCase(); lang = (f.get('lang') || '') === 'de' ? 'de' : 'en'; hp = (f.get('company') || '').toString(); }
  const base = env.SITE_BASE || 'https://sqwod.life';
  const done = () => (wantsJson ? json({ ok: true }, 200, env) : redirect(`${base}/${lang}/refer?status=sent`));
  if (hp) return done();
  const allow = env.ALLOW_ORIGIN;
  if (allow) { const o = req.headers.get('origin') || '', rf = req.headers.get('referer') || ''; if (!(o === allow || (!o && rf.startsWith(allow + '/')))) return wantsJson ? json({ ok: false, error: 'origin' }, 403, env) : redirect(`${base}/${lang}/refer?status=error`); }
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) return wantsJson ? json({ ok: false, error: 'invalid_email' }, 400, env) : redirect(`${base}/${lang}/refer?status=error`);
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (env.SUBS_KV && ip) {
    const key = `rate:refer:${ip}`;
    const seen = parseInt(await env.SUBS_KV.get(key), 10) || 0;
    if (seen >= RATE_MAX) return done();
    await env.SUBS_KV.put(key, String(seen + 1), { expirationTtl: RATE_WINDOW });
  }
  if (!env.CONFIRM_SECRET || !(await resendHas(env, email))) return done();
  const code = await refCode(env, email);
  if (env.SUBS_KV) await env.SUBS_KV.put(`ref:${code}`, email);          // self-heals contacts from before the programme
  const n = env.SUBS_KV ? parseInt(await env.SUBS_KV.get(`refcount:${code}`), 10) || 0 : 0;
  const link = refLink(env, lang, code);
  const t = lang === 'de'
    ? { subject: 'Dein Sqwod-Empfehlungslink', body: `Dein persönlicher Link. Bisher ${n} bestätigte Empfehlung${n === 1 ? '' : 'en'}. Drei, und du bekommst einen Sqwod-Intelligence-Report geschenkt.` }
    : { subject: 'Your Sqwod referral link', body: `Your personal link. ${n} confirmed referral${n === 1 ? '' : 's'} so far. Three, and we send you a Sqwod Intelligence report, free.` };
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;color:#111;line-height:1.6"><p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777">Sqwod Daily</p><h2 style="margin:4px 0 10px">${t.subject}</h2><p>${t.body}</p><p style="background:#f4f4f4;padding:12px 14px;border-radius:10px;word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:14px"><a href="${link}" style="color:#111">${link}</a></p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Sqwod Daily <daily@sqwod.life>', to: email, subject: t.subject, html, text: `${t.body}\n\n${link}` }),
  });
  return done();
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
      from: env.CONFIRM_FROM || env.RESEND_FROM || 'Sqwod Daily <confirm@notify.sqwod.life>',
      to: [email],
      subject: t.subject,
      html,
      text,
    }),
  });
  if (!r.ok) console.log('resend send error', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}
