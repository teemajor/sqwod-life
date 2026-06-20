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
 *   BEEHIIV_WEBHOOK_SECRET  shared secret you set on the beehiiv webhook
 * Vars (wrangler.toml [vars]):
 *   SHOPIFY_STORE           e.g. sqwodpod.myshopify.com
 *   REWARDS_JSON            map of milestone → Shopify variant id, e.g.
 *                           {"3":"gid://...sticker","10":"...tee","25":"...hoodie"}
 *                           (numeric keys = referral count thresholds)
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
  if (!env.BEEHIIV_WEBHOOK_SECRET || secret !== env.BEEHIIV_WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401);

  const p = await req.json().catch(() => ({}));
  // beehiiv payloads vary — accept the common shapes. Adjust keys to your webhook.
  const email = p.email || p.subscriber?.email || p.data?.email;
  const milestone = String(p.milestone ?? p.reward?.milestone ?? p.referral_count ?? p.data?.milestone ?? '');
  const ship = p.shipping_address || p.address || p.data?.shipping_address || null;
  if (!email || !milestone) return json({ error: 'missing email or milestone' }, 400);

  // 2) map milestone → Shopify variant
  let rewards = {};
  try { rewards = JSON.parse(env.REWARDS_JSON || '{}'); } catch {}
  const variantId = rewards[milestone];
  if (!variantId) return json({ skipped: `no reward configured for milestone ${milestone}` });

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

// accept either a numeric variant id or a gid://shopify/ProductVariant/123
const numericId = (v) => (String(v).match(/(\d+)\s*$/) || [, v])[1];
