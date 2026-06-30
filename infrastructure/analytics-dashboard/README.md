# Sqwod Command Center

One private page that merges **site** (Umami) and **email** (Resend) into a single
branded dashboard — so you never sign into Umami again. Same Cloudflare Worker
infra you already run for subscribe / move intake.

Shows: visitors, pageviews, visits, bounces (with % change), a pageviews-per-day
sparkline, top pages, top sources, your custom events (subscribes, shares, report
unlocks, move watches), plus EN/DE list sizes and recent broadcasts from Resend.
Date range switch: 7 / 30 / 90 days. Data is fresh on every load.

---

Reads from our **self-hosted Umami** (Railway) — no paid API key. The Worker logs
into Umami with your username/password to get a token, so the only Umami "secrets"
are your Umami login. `UMAMI_URL` + `UMAMI_WEBSITE_ID` live in `wrangler.toml`.

## Deploy (~15 min, one time)

### 1. Get the Resend key
- **Resend:** resend.com → **API Keys → Create** (read access is enough). Copy it.
- (Umami needs no key — the Worker uses your Umami login, set as secrets below.)

### 2. (Optional) Resend audience IDs for list sizes
Resend → **Audiences** → click each list → copy its ID. Put them in `wrangler.toml`
under `RESEND_AUDIENCE_EN` / `RESEND_AUDIENCE_DE`. Skip to leave list-size cards blank.

### 3. Deploy the Worker
```bash
cd infrastructure/analytics-dashboard
npx wrangler secret put UMAMI_USERNAME    # your Umami login (e.g. admin)
npx wrangler secret put UMAMI_PASSWORD    # your Umami password
npx wrangler secret put RESEND_API_KEY    # the Resend key
npx wrangler deploy
```
This gives you a URL like `https://sqwod-command-center.<you>.workers.dev`.
`UMAMI_URL` and `UMAMI_WEBSITE_ID` are already filled in `wrangler.toml`.

### 4. Lock it to your email with Cloudflare Access (this is the real gate)
Cloudflare dashboard → **Zero Trust → Access → Applications → Add application →
Self-hosted**:
- Application domain = the Worker's URL (or `dash.sqwod.life` if you add the route below).
- Policy: **Allow**, rule **Emails → tee@teemajor.com**.
- Save. Now opening the URL prompts a one-time email code (or Google login) — only
  you get in, and it is **not** your Umami login.

The Worker also re-checks the `ALLOWED_EMAILS` var against the Access identity header
as a backstop, so it refuses anything that somehow bypasses Access.

### 5. (Optional) Pretty URL
Uncomment the `[[routes]]` block in `wrangler.toml`, set `dash.sqwod.life`, add a
DNS record for `dash` in Cloudflare, redeploy, and point the Access app at it.

---

## Notes
- **Read-only.** It only GETs from the two APIs. No writes, no cookies, no storage.
- **Open/click rates per broadcast** stay in Resend (enable Open + Click tracking on
  the sending domain). This page focuses on list growth + send status; the real
  email→action picture is the Site **events** (subscribes/shares) driven by the
  daily UTMs.
- **Bookmark it** on your phone home screen for a one-tap glance.
- If a panel says "unreachable," the matching key is wrong or missing — re-run the
  `wrangler secret put` for that service.
