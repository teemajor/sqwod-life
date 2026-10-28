# sqwod-subscribe — Cloudflare Worker

Captures newsletter sign-ups from sqwod.life and adds them to the matching
Resend segment. **Double opt-in:** a submit never writes to Resend — it sends a
confirmation email with a signed, expiring link, and the contact is only created
when that link is clicked.

## Flow

```
POST /subscribe          → bot checks → confirmation email → ?status=pending
GET  /confirm?t=<token>  → verify signature + expiry → create contact → ?status=confirmed
```

The token is `base64url(payload).base64url(HMAC-SHA256(payload))`, signed with
`CONFIRM_SECRET`. The payload carries email, locale, source and expiry, so there
is no pending-signup table to maintain.

## Bot defences, in order

| # | Check | Behaviour when it trips |
|---|-------|-------------------------|
| 1 | Honeypot (`company` field) | Silent success — the bot sees a normal response |
| 2 | Origin/Referer must match `ALLOW_ORIGIN` | 403 — blocks scripted POSTs straight at the endpoint |
| 3 | Time-on-form (`ts` field) under `MIN_FILL_MS` | 429. Missing `ts` is tolerated for JS-off browsers |
| 4 | Email shape + known disposable domains | 400 |
| 5 | Per-IP rate limit (5 / hour, needs `SUBS_KV`) | 429 |
| 6 | Confirmation click | Unconfirmed addresses never reach the list |

Check 2 is the one that closes the hole the old worker had: the honeypot was
already there, but it only helps against bots that fill hidden fields. Anything
POSTing directly to the endpoint sailed through.

## Contact properties written on confirm

| Property | Value |
|----------|-------|
| `locale` | `de` or `en` |
| `signup_source` | e.g. `home-hero`, `home-footer`, `subscribe-page`, `report-unlock` |
| `confirmed_at` | ISO timestamp of the confirmation click |

These must exist in Resend (Contacts → Properties) — they were created on
2026-08-16.

## Deploy

```bash
cd infrastructure/subscribe
wrangler kv namespace create SUBS_KV      # optional, for rate limiting
# paste the id into wrangler.toml, uncomment the [[kv_namespaces]] block
wrangler secret put RESEND_API_KEY
wrangler secret put CONFIRM_SECRET        # openssl rand -hex 32
wrangler deploy
```

`RESEND_FROM` must be an address on the verified sqwod.life domain.

## Site side

Every sign-up form posts `email`, `lang`, `company` (honeypot), `source` and
`ts`. The `ts` field is stamped client-side on page load. Forms live in:

- `site/src/pages/[lang]/index.astro` — hero + footer capture
- `site/src/pages/[lang]/subscribe.astro` — full page
- `site/src/components/ArticleView.astro` — gated-report unlock (JSON fetch)

`site/src/pages/[lang]/subscribe.astro` renders the banner for each
`?status=` the Worker redirects to: `pending`, `confirmed`, `expired`,
`invalid`, `error`.

## Known trade-off

Resend click tracking rewrites the confirmation link. Corporate mail scanners
that pre-fetch links can therefore auto-confirm an address. That is inherent to
double opt-in with click tracking on, and it is a much smaller problem than
unverified bot sign-ups.


## Referral programme ("refer 3, get the report")

Built into this Worker. Every subscriber has a stable code derived from their email
(`HMAC(CONFIRM_SECRET, "ref:" + email)`, first 10 hex chars), so no table of codes exists.

```
welcome email (sent on confirm) carries   https://sqwod.life/<lang>/subscribe?ref=<code>
↓ friend lands anywhere on the site with ?ref= → remembered in localStorage → sent as `ref` with the sign-up
↓ friend confirms → contact created → referrer credited ONCE per friend (KV: refd:<email>)
↓ KV refcount:<code> += 1 → Resend property referral_count on the referrer
↓ at 3 (and 10) → reward email to the referrer (REFERRAL_REWARDS_JSON, defaults in worker.js)
```

- `/refer` page (`site/src/pages/[lang]/refer.astro`) → `POST /refer` re-sends a subscriber their link + count. It only emails addresses that are on the list and answers identically either way.
- Resend contact properties used: `ref_code`, `referred_by`, `referral_count` (created 2026-10-28).
- KV: `.github/workflows/deploy-subscribe-worker.yml` creates the `sqwod-subscribe-SUBS_KV` namespace on first deploy (needs **Workers KV Storage: Edit** on `CLOUDFLARE_API_TOKEN`) and binds it. Without KV, sign-ups still work; referrals are simply not counted.
- Rewards: 3 = sticker pack, 10 = tee, 25 = hoodie (the Shopify variants in `infrastructure/swag-fulfill/wrangler.toml`). The reward email asks the referrer to reply with a postal address (and size), because the list holds no addresses. Override copy with the `REFERRAL_REWARDS_JSON` var. `SWAG_WORKER_URL` + secret `SWAG_SECRET` also fire `infrastructure/swag-fulfill` at each milestone; without an address that order cannot ship, so leave them unset until a claim form exists.
