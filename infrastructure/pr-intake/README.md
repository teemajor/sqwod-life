# pr-intake — press-release submission Worker

A tiny Cloudflare Worker that takes the press submit form, blocks spam (Turnstile),
takes payment for premium (Stripe), and writes each submission into the repo at
`automation/press-queue/<id>.json`. From there, `automation/press.mjs` (run by
`.github/workflows/press.yml`) screens with AI and publishes what you approve.

```
submit form → Worker → Turnstile → [premium: Stripe Checkout] → write to repo
                                                                     ↓
Stripe webhook → Worker → mark paid           press.mjs: AI screen → you approve → publish → deploy
```

## One-time setup (your accounts)
1. **Cloudflare:** `npm i -g wrangler` → `wrangler login`. From this folder: `wrangler deploy`.
2. **Custom domain:** in the Cloudflare dashboard, add a route/custom domain like `pr.sqwod.life` to the Worker (or uncomment `routes` in `wrangler.toml`).
3. **GitHub token:** create a fine-grained PAT with **Contents: Read & write** on the `sqwod-life` repo → `wrangler secret put GITHUB_TOKEN`.
4. **Stripe:** create a Product + Price for the premium tier (~€490). Then:
   - `wrangler secret put STRIPE_SECRET` (sk_…)
   - `wrangler secret put STRIPE_PRICE_ID` (price_…)
   - Add a webhook endpoint → `https://pr.sqwod.life/webhook`, event `checkout.session.completed` → `wrangler secret put STRIPE_WEBHOOK_SECRET` (whsec_…)
5. **Turnstile:** create a Turnstile widget (free) → `wrangler secret put TURNSTILE_SECRET`. Put the **site key** into `site/src/pages/[lang]/press/submit.astro` (replace `TURNSTILE_SITE_KEY`) and load the Turnstile script.
6. **Point the form at the Worker:** set `PR_INTAKE_URL` in `site/src/config/press.ts` to `https://pr.sqwod.life/submit`. Commit + deploy.

## Daily operation (automatic)
- A reader submits → spam-checked → stored in the repo (premium pays first).
- `press.yml` runs `press.mjs`: AI screens each new submission and writes a recommendation into its queue JSON.
- You review and set `"status": "approved"` on the ones you want (premium also needs `"paid": true`, set automatically by the Stripe webhook).
- Next run publishes approved/paid releases to `site/src/content/press/` (EN + DE) and the deploy ships them.

## Notes
- The Worker holds no editorial logic — intake + payment only. All curation is AI-screen + your approval in the repo.
- Test mode: use Stripe `sk_test_…` + test price and a Turnstile test key before going live.
