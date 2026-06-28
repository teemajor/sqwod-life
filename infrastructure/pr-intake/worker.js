/**
 * Sqwod PR intake — Cloudflare Worker.
 *
 * Routes:
 *   POST /submit   ← the press submit form. Verifies Turnstile, writes the
 *                    submission to the repo (automation/press-queue/<id>.json),
 *                    and for premium creates a Stripe Checkout and redirects.
 *   POST /webhook  ← Stripe checkout.session.completed → marks the submission paid.
 *   GET  /intel    ← one-tap actions for an Intelligence refresh proposal.
 *                    Verifies a signed (HMAC) single-use, expiring link and flips
 *                    automation/intel-queue/<id>.json. Actions:
 *                      approve        → approved        (Update value)
 *                      replace        → replace-approved(Update value + source)
 *                      review         → flagged         (manual look; no change)
 *                      reject         → rejected        (Keep / dismiss)
 *                      remove         → confirmation page (no change yet)
 *                      remove-confirm → remove-approved  (delete the figure)
 *                    The scheduled `intelligence-refresh.mjs --apply` then
 *                    publishes the result. Removal is the ONLY action that
 *                    deletes a figure, and it always requires the second tap.
 *
 * Everything lives in the repo as the single source of truth; automation/press.mjs
 * (run by .github/workflows/press.yml) screens + publishes. The Worker holds NO
 * editorial logic — it only intakes + takes payment.
 *
 * Secrets (wrangler secret put …):
 *   GITHUB_TOKEN          fine-grained PAT, Contents: Read/Write on the repo
 *   STRIPE_SECRET         sk_live_… (or sk_test_…)
 *   STRIPE_WEBHOOK_SECRET whsec_…
 *   STRIPE_PRICE_ID       price_… for the €490 premium tier
 *   TURNSTILE_SECRET      Cloudflare Turnstile secret key
 * Vars (wrangler.toml [vars]):
 *   GH_OWNER, GH_REPO, GH_BRANCH, SITE_BASE  (e.g. https://sqwod.life)
 */
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const redirect = (url) => new Response(null, { status: 303, headers: { Location: url } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/submit') return submit(req, env);
    if (req.method === 'POST' && url.pathname === '/webhook') return webhook(req, env);
    if (req.method === 'GET' && url.pathname === '/intel') return intel(req, env);
    return new Response('Sqwod PR intake', { status: 200 });
  },
};

async function submit(req, env) {
  const form = await req.formData();
  const f = (k) => (form.get(k) || '').toString().trim();
  const lang = f('lang') === 'de' ? 'de' : 'en';

  // 1) anti-spam: verify Turnstile
  const ok = await verifyTurnstile(form.get('cf-turnstile-response'), env.TURNSTILE_SECRET, req.headers.get('CF-Connecting-IP'));
  if (!ok) return redirect(`${env.SITE_BASE}/${lang}/press/submit?error=captcha`);
  if (!f('company') || !f('headline') || !f('body') || !f('contactEmail') || !form.get('consent')) {
    return redirect(`${env.SITE_BASE}/${lang}/press/submit?error=missing`);
  }

  // 2) build submission
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const tier = f('tier') === 'premium' ? 'premium' : 'standard';
  const sub = {
    id, company: f('company'), contactName: f('contactName'), contactEmail: f('contactEmail'),
    companyUrl: f('companyUrl'), headline: f('headline'), dek: f('dek'), body: f('body'),
    logo: f('logo'), link: f('link'), tier, publishLang: f('publishLang') || lang,
    preferredDate: f('preferredDate'), pillar: 'industry-trends', lang,
    status: 'submitted', paid: false, submittedAt: new Date().toISOString().slice(0, 10),
  };

  // 3) write to repo
  await putFile(env, `automation/press-queue/${id}.json`, JSON.stringify(sub, null, 2), `pr: submission ${id} (${sub.company})`);

  // 4) premium → Stripe Checkout; standard → thanks
  if (tier === 'premium') {
    const session = await stripeCheckout(env, id, sub, lang);
    if (session?.url) return redirect(session.url);
    return redirect(`${env.SITE_BASE}/${lang}/press/thanks?status=error`);
  }
  return redirect(`${env.SITE_BASE}/${lang}/press/thanks?status=submitted`);
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret); body.append('response', token); if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return r.ok && (await r.json()).success === true;
}

async function stripeCheckout(env, id, sub, lang) {
  const body = new URLSearchParams();
  body.append('mode', 'payment');
  body.append('line_items[0][price]', env.STRIPE_PRICE_ID);
  body.append('line_items[0][quantity]', '1');
  body.append('client_reference_id', id);
  body.append('metadata[submissionId]', id);
  body.append('customer_email', sub.contactEmail);
  body.append('success_url', `${env.SITE_BASE}/${lang}/press/thanks?status=paid`);
  body.append('cancel_url', `${env.SITE_BASE}/${lang}/press/submit?error=cancelled`);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET}`, 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!r.ok) return null;
  return r.json();
}

async function webhook(req, env) {
  const sig = req.headers.get('Stripe-Signature') || '';
  const payload = await req.text();
  if (!(await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'bad signature' }, 400);
  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed') {
    const id = event.data.object.metadata?.submissionId || event.data.object.client_reference_id;
    if (id) {
      const path = `automation/press-queue/${id}.json`;
      const cur = await getFile(env, path);
      if (cur) {
        const sub = JSON.parse(cur.content);
        sub.paid = true; sub.status = sub.status === 'screened' ? sub.status : sub.status; sub.paidAt = new Date().toISOString();
        await putFile(env, path, JSON.stringify(sub, null, 2), `pr: payment received ${id}`, cur.sha);
      }
    }
  }
  return json({ received: true });
}

// Stripe signature check (HMAC-SHA256 over `${t}.${payload}`), Web Crypto.
async function verifyStripe(payload, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === parts.v1;
}

// ---- Intelligence refresh: one-tap Approve / Reject ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function page(title, bodyHtml) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Sqwod Intelligence</title>` +
    `<div style="font-family:-apple-system,Segoe UI,Arial;background:#0e0e10;color:#FAFAFA;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center">` +
    `<div style="max-width:460px;padding:32px;text-align:center">` +
    `<div style="font:800 22px/1 -apple-system;letter-spacing:-.02em">SQWOD<span style="color:#85858e">.life</span></div>` +
    `<div style="font:700 11px/1 -apple-system;letter-spacing:.16em;text-transform:uppercase;color:#85858e;margin:6px 0 24px">Intelligence</div>` +
    `<h1 style="font-size:24px;margin:0 0 12px">${esc(title)}</h1>` +
    `<p style="color:#b8b8c0;font-size:15px;line-height:1.6">${bodyHtml}</p>` +
    `</div></div>`, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8' } });
}
async function hmacHex(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmacOk(data, sig, secret) {
  const hex = await hmacHex(data, secret);
  // constant-time-ish compare
  if (!sig || sig.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
const btn = (href, label, danger) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${danger ? '#7a2230' : '#FAFAFA'};color:${danger ? '#fff' : '#0e0e10'};text-decoration:none;font:800 15px/1 -apple-system;padding:14px 22px;border-radius:10px;margin:8px 8px 0 0">${label}</a>`;

const INTEL_ACTIONS = {
  approve: 'approved', replace: 'replace-approved', review: 'flagged', reject: 'rejected', 'remove-confirm': 'remove-approved',
};
async function intel(req, env) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') || '', action = u.searchParams.get('action') || '';
  const exp = u.searchParams.get('exp') || '', sig = u.searchParams.get('sig') || '';
  const known = action === 'remove' || Object.prototype.hasOwnProperty.call(INTEL_ACTIONS, action);
  if (!id || !known) return page('Invalid link', 'This action link is malformed.');
  if (!Number(exp) || Number(exp) * 1000 < Date.now()) return page('Link expired', 'This link has expired — the next refresh will send a fresh one.');
  if (!(await hmacOk(`${id}.${action}.${exp}`, sig, env.INTEL_SIGNING_SECRET))) return page('Could not verify', 'This link failed signature verification.');

  const path = `automation/intel-queue/${id}.json`;
  const cur = await getFile(env, path);
  if (!cur) return page('Not found', 'That proposal no longer exists.');
  const p = JSON.parse(cur.content);

  // First tap of Remove never changes anything — it asks for an explicit confirm.
  if (action === 'remove') {
    if (p.status !== 'pending') return page('Already handled', `This proposal was already <b>${esc(p.status)}</b>.`);
    const sig2 = await hmacHex(`${id}.remove-confirm.${exp}`, env.INTEL_SIGNING_SECRET);
    const confirmUrl = `${u.origin}/intel?id=${encodeURIComponent(id)}&action=remove-confirm&exp=${exp}&sig=${sig2}`;
    return page('Remove this figure?', `You're about to permanently remove <b>${esc(p.label)}</b> (currently <b>${esc(p.oldValue)}</b>${p.currentSource ? `, ${esc(p.currentSource)}` : ''}) from <b>${esc(p.report)}</b> in both languages. This can't be undone from the email. ${btn(confirmUrl, 'Yes, remove it', true)}`);
  }

  if (p.status !== 'pending') return page('Already handled', `This proposal was already <b>${esc(p.status)}</b>.`);
  p.status = INTEL_ACTIONS[action];
  p.decidedAt = new Date().toISOString();
  const ok = await putFile(env, path, JSON.stringify(p, null, 2), `intel: ${p.status} ${id}`, cur.sha);
  if (!ok) return page('Try again', 'Could not record your decision — please tap the link again.');

  const within = 'on the next refresh (within a few hours), with a changelog entry and a fresh date';
  switch (action) {
    case 'approve':
      return page('Update queued ✓', `<b>${esc(p.label)}</b> will update ${esc(p.oldValue)} &rarr; <b>${esc(p.newValue || '(review)')}</b> ${within}.`);
    case 'replace':
      return page('Replace queued ✓', `<b>${esc(p.label)}</b> will change to <b>${esc(p.newValue || '(review)')}</b> and the citation will switch to <b>${esc(p.foundSource || 'the new source')}</b> ${within}.`);
    case 'review':
      return page('Flagged for review', `<b>${esc(p.label)}</b> is flagged for your manual look. Nothing on the site changes — your figure stays exactly as it is.`);
    case 'remove-confirm':
      return page('Removal queued', `<b>${esc(p.label)}</b> will be removed from <b>${esc(p.report)}</b> ${within}.`);
    case 'reject':
    default:
      return page('Kept', `<b>${esc(p.label)}</b> stays as <b>${esc(p.oldValue)}</b>. Nothing on the site changes.`);
  }
}

// ---- GitHub contents API ----
const GH = (env, path) => `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
const ghHeaders = (env) => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'sqwod-pr-intake', Accept: 'application/vnd.github+json' });
async function getFile(env, path) {
  const r = await fetch(`${GH(env, path)}?ref=${env.GH_BRANCH || 'main'}`, { headers: ghHeaders(env) });
  if (!r.ok) return null;
  const j = await r.json();
  return { sha: j.sha, content: atob(j.content.replace(/\n/g, '')) };
}
async function putFile(env, path, content, message, sha) {
  const body = { message, content: btoa(unescape(encodeURIComponent(content))), branch: env.GH_BRANCH || 'main' };
  if (sha) body.sha = sha;
  const r = await fetch(GH(env, path), { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(body) });
  return r.ok;
}
