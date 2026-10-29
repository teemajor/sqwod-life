/**
 * Sqwod swag fulfillment — Cloudflare Worker.
 *
 * beehiiv referral program → milestone reached → webhook here → we create a
 * free Shopify order for the milestone's reward → Printful (Shopify app)
 * auto-fulfills and ships it. No human in the loop once it's wired.
 *
 *   POST /reward   ← beehiiv webhook (referral milestone / reward earned)
 *
 * Secrets (wrangler secret put …):
 *   SHOPIFY_ADMIN_TOKEN     Admin API access token (Orders: write, Products: read)
 *   SWAG_SECRET             shared secret the subscribe Worker sends as X-Sqwod-Secret
 *                           (BEEHIIV_WEBHOOK_SECRET still accepted for the legacy beehiiv hook)
 * Vars (wrangler.toml [vars]):
 *   SHOPIFY_STORE           e.g. sqwodpod.myshopify.com
 *   REWARDS_JSON            map of milestone → reward. A reward is one of:
 *                             "44069279236385"              a Shopify variant id
 *                             {"S":"…","M":"…"}             variant ids by size (claim's `size`)
 *                             {"handle":"sqwod-canvas-bag"} a Shopify product handle; the
 *                                 variant is looked up at order time (by size title when the
 *                                 claim carries one, else the first variant). Lets you push a
 *                                 product from Printful and name it once, no id hunting.
 *                           (numeric keys = referral count thresholds)
 *
 * Caller today: infrastructure/subscribe (POST /claim) sends
 *   {email, milestone, size?, shipping_address:{first_name,last_name,address1,address2,city,zip,country_code}}
 */
const API = '2024-10';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/reward') return reward(req, env);
    return new Response('Sqwod swag fulfillment', { status: 200 });
  },
};

async function reward(req, env) {
  // 1) authenticate the webhook (shared secret in header or query)
  const secret = req.headers.get('X-Sqwod-Secret') || new URL(req.url).searchParams.get('secret');
  const expected = env.SWAG_SECRET || env.BEEHIIV_WEBHOOK_SECRET;
  if (!expected || secret !== expected) return json({ error: 'unauthorized' }, 401);

  const p = await req.json().catch(() => ({}));
  // beehiiv payloads vary — accept the common shapes. Adjust keys to your webhook.
  const email = p.email || p.subscriber?.email || p.data?.email;
  const milestone = String(p.milestone ?? p.reward?.milestone ?? p.referral_count ?? p.data?.milestone ?? '');
  const ship = p.shipping_address || p.address || p.data?.shipping_address || null;
  if (!email || !milestone) return json({ error: 'missing email or milestone' }, 400);

  // 2) map milestone → Shopify variant
  let rewards = {};
  try { rewards = JSON.parse(env.REWARDS_JSON || '{}'); } catch {}
  let variantId = rewards[milestone];
  const size = String(p.size || '').toUpperCase();
  if (variantId && typeof variantId === 'object' && variantId.handle) {   // product handle → variant
    variantId = await variantByHandle(env, variantId.handle, size);
    if (!variantId) return json({ error: `no product with handle "${rewards[milestone].handle}" in Shopify (push it from Printful, then set its URL handle)` }, 404);
  } else if (variantId && typeof variantId === 'object') {               // sized item
    variantId = variantId[size] || variantId.M || Object.values(variantId)[0];
  }
  if (!variantId) return json({ skipped: `no reward configured for milestone ${milestone}` });
  if (!ship) return json({ error: 'shipping_address required: a physical reward cannot ship without one' }, 400);

  // 3) create a free order (100% discount) so Printful fulfills it
  const order = {
    order: {
      email,
      line_items: [{ variant_id: numericId(variantId), quantity: 1 }],
      financial_status: 'paid',
      send_receipt: false,
      send_fulfillment_receipt: true,
      tags: 'referral-reward,sqwod-daily',
      discount_codes: [{ code: 'REFERRAL-REWARD', amount: '100.0', type: 'percentage' }],
      note: `Sqwod Daily referral reward — milestone ${milestone}`,
      ...(ship ? { shipping_address: ship } : {}),
    },
  };
  const r = await fetch(`https://${env.SHOPIFY_STORE}/admin/api/${API}/orders.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!r.ok) return json({ error: 'shopify order failed', detail: (await r.text()).slice(0, 300) }, 502);
  const created = await r.json();
  return json({ ok: true, orderId: created.order?.id, milestone, email });
}

// Product handle → variant id (first variant, or the one whose title contains the size).
async function variantByHandle(env, handle, size) {
  const r = await fetch(`https://${env.SHOPIFY_STORE}/admin/api/${API}/products.json?handle=${encodeURIComponent(handle)}&fields=id,variants`, {
    headers: { 'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN },
  });
  if (!r.ok) return null;
  const prod = ((await r.json()).products || [])[0];
  const vs = prod?.variants || [];
  if (!vs.length) return null;
  const bySize = size ? vs.find((v) => String(v.title).toUpperCase().split(/\s*\/\s*/).includes(size)) : null;
  return (bySize || vs[0]).id;
}

// accept either a numeric variant id or a gid://shopify/ProductVariant/123
const numericId = (v) => (String(v).match(/(\d+)\s*$/) || [, v])[1];
