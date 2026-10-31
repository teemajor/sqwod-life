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
| `jobs_alert` | `"true"` when the sign-up came from the Sqwod Jobs page (`signup_source` = `jobs-alert`). Existing subscribers who sign up there keep their contact; the Worker switches the property on with a `PATCH /contacts/<email>`. The Worker also adds the contact to the one jobs segment for both languages (`RESEND_SEGMENT_JOBS` in `wrangler.toml`; the email is German first, English below), which is what `automation/jobs-alert.mjs` sends the Friday jobs email to. A new contact from the jobs page joins **only** the jobs segment, unless they tick "Also send me the Sqwod Daily"; then they join the Daily segment for their language as well. The alert is sent under the Resend topic "Sqwod Jobs", so its unsubscribe link ends only the jobs alert. |

These must exist in Resend (Contacts → Properties). The first four were created on
2026-08-16; `jobs_alert` (type string, fallback `false`) was added for Sqwod Jobs in Oct 2026.

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
