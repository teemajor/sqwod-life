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

## Intelligence refresh approvals — the `/intel` route

The same Worker powers one-tap Approve/Reject for living-report figure updates.

```
intel-scan.yml (weekly) → intelligence-refresh.mjs --scan
   → fetch source, extract candidate, draft automation/intel-queue/<id>.json
   → email YOU branded Approve/Reject buttons (signed, single-use, 14-day links)
        ↓ you tap
Worker GET /intel → verify HMAC + expiry → flip the proposal to approved/rejected
        ↓
intel-apply.yml (every 4h / on demand) → --apply → update the figure (EN+DE) +
   changelog + date → push → deploy.   Nothing publishes until you approve.
```

### One-time setup
1. **Pick a signing secret** (any long random string). It must match in two places:
   - Worker: `wrangler secret put INTEL_SIGNING_SECRET`
   - GitHub repo → Settings → Secrets → Actions → `INTEL_SIGNING_SECRET` (same value)
2. **GitHub repo secrets:** `INTEL_REVIEWER_EMAIL` (where proposals go — you), plus the existing `ANTHROPIC_API_KEY` (source extraction) and `RESEND_API_KEY` (sending).
3. **GitHub repo variables:** `INTEL_FROM` (a Resend-verified sender, e.g. `Sqwod Intelligence <intel@sqwod.life>`) and `INTEL_WORKER_URL` — the Worker's address. If you haven't set up the `pr.sqwod.life` custom domain, use the `workers.dev` URL that `wrangler deploy` prints (e.g. `https://sqwod-pr-intake.<account>.workers.dev`).
4. **Resend:** verify the `intel@` sender (or reuse your existing `daily@`).
5. **Deploy** — two options:
   - **Local:** `wrangler deploy` from this folder.
   - **No terminal (recommended):** `.github/workflows/deploy-worker.yml` deploys the Worker on every push that touches `infrastructure/pr-intake/**` (and on demand). Add two GitHub secrets once and you never touch the CLI:
     - `CLOUDFLARE_API_TOKEN` — Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template → create. (Add `CLOUDFLARE_ACCOUNT_ID`, shown on the dashboard's right sidebar, only if a deploy errors about multiple accounts.)
     - `INTEL_SIGNING_SECRET` — the same signing value from step 1; the workflow pushes it to the Worker for you.

   The `/intel` route needs the Worker to have a **`GITHUB_TOKEN`** secret (a GitHub fine-grained PAT, **Contents: Read & write** on `sqwod-life`) — that's how a tap writes your decision back to the repo. If the Worker was created fresh by the auto-deploy (the log says *"Creating new Worker"*), add it once in the Cloudflare dashboard → Workers → `sqwod-pr-intake` → Settings → Variables and Secrets → **Secret** → `GITHUB_TOKEN`. It persists across future deploys (CI only manages `INTEL_SIGNING_SECRET`).

### Add a figure to track
Edit `automation/intel-sources.json`: per report, add `{ index, label, value, sourceUrl, cadenceDays, lastChecked }`. `index` is the figure's position in the report's frontmatter `figures:` array. Quarterly (`90`) suits flagship figures; `30` for fast-movers. Without `ANTHROPIC_API_KEY` the scan still runs but sends "please verify" nudges instead of an extracted old→new.
