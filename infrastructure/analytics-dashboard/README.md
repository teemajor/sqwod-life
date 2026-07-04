# Sqwod.Life Analytics (private dashboard)

One private page that merges **site** (self-hosted Umami) and **email** (Resend)
into a single branded view at **https://dash.sqwod.life**, gated by Cloudflare Access.
A Cloudflare Worker; no paid Umami API (it logs into our own Umami for a token).

**Layout (v2):** ① north-star hero (total list + net-new this week + activity
sparkline) → ② "this week's move" auto-insight → ③ funnel (visitors → subscribe rate
→ share rate) → ④ site detail (KPIs with % change, top pages/sources, custom events)
→ ⑤ email (EN/DE list sizes + recent broadcasts). 7/30/90-day switch. Fresh each load.

## As-built setup
- **Worker:** `sqwod-command-center` (internal name only; the page reads "Sqwod.Life Analytics").
- **Custom domain:** `dash.sqwod.life` (Access only works on a real domain, not `*.workers.dev`).
- **Gate:** Cloudflare Zero Trust (Free) → Access → app "Sqwod.Life Analytics", policy
  **Allow → Emails**. Login method: **One-Time PIN** and/or Cloudflare. The account email
  is `sqwodlife@gmail.com`, so that address is on both the Access policy **and** the
  Worker's `ALLOWED_EMAILS` (the Worker re-checks the Access identity header).

## Variables & Secrets (Worker → Settings → Variables and Secrets)
**Variables:** `UMAMI_URL`, `UMAMI_WEBSITE_ID`, `ALLOWED_EMAILS` (comma list),
optional `RESEND_AUDIENCE_EN` / `RESEND_AUDIENCE_DE`.
**Secrets:** `UMAMI_USERNAME`, `UMAMI_PASSWORD`, `RESEND_API_KEY`, `DIGEST_KEY`.

## Weekly digest (always-on, no runner)
The Worker's `scheduled()` handler runs on a **Cloudflare cron** (`[triggers] crons`
in wrangler.toml — Monday 07:00 UTC) and **emails the weekly pulse via Resend**. This
runs on Cloudflare itself: no Claude runner, no git, works with your laptop closed.
Needs `RESEND_API_KEY` + `RESEND_FROM` (a verified Resend sender); `DIGEST_TO`
defaults to tee@teemajor.com. (This replaced the Cowork scheduled task that hit git
exit-128 — that task can be deleted.)

Also still available: `GET /digest?key=<DIGEST_KEY>` returns the same pulse as
plain text (keyed, not Access-gated) if you ever want to fetch it manually.

## Notes
- **Read-only.** Only GETs from the two APIs. No writes, no cookies, no storage.
- **Open/click per broadcast** stays in Resend (enable Open + Click tracking on the
  domain). This page shows list growth + send status; email→action is the Subscribe /
  Share events, driven by the daily UTMs.
- If a panel says "unreachable," the matching secret is wrong/missing — re-set it in the
  Worker's Variables and Secrets and redeploy.
- **Bookmark `dash.sqwod.life`** on your phone home screen for a one-tap glance.
