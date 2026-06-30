# Sqwod Analytics

How sqwod.life measures attention and conversion. Three parts, joined by UTMs:

| Layer | Tool | Answers |
|---|---|---|
| Site behavior + conversions | **Umami, self-hosted** (Railway, own DB) | Pageviews, referrers, UTMs, custom events, goals |
| Email delivery | **Resend** | Delivered, opens, clicks, bounces, unsubscribes |
| Email → site bridge | **UTM tags** on every Daily link | Which issue drove which visit / subscribe / share |

Everything is cookieless and low-PII, so **no consent banner is required** for analytics.

---

## 1. Umami — self-hosted (site analytics)

Moved off Umami Cloud because its free tier caps retention at 6 months and paywalls
the API ($20/mo Pro). Self-hosting on Railway means **we own the Postgres database**:
retention is unlimited and the API is free (it powers the private dashboard).

- **Instance:** https://umami-production-5dc9.up.railway.app (Railway, US West region)
- **Website:** sqwod.life · **Website ID:** `35fd123d-0a68-4295-a875-8947947b5d76`
- **Login:** admin account (password changed from default). Private behind that login.
- **Cost:** ~$5/mo Railway Hobby + free Postgres. Owned, not rented; no caps.
- Region is US West (Railway default); fine for cookieless data we own. Recreate in
  Railway EU region if the DE-partner data-residency story ever matters.

### How it's wired in the site
- `site/src/config/analytics.ts` holds `{ src, websiteId }`.
- `site/src/layouts/Base.astro` loads the beacon **only when both are set**:
  ```astro
  {ANALYTICS.src && ANALYTICS.websiteId && (
    <script defer src={ANALYTICS.src} data-website-id={ANALYTICS.websiteId}></script>
  )}
  ```
- To pause tracking: blank either value in `analytics.ts` and redeploy. Zero requests fire.

### Custom events (already instrumented via `data-umami-event`)
| Event | Where | Useful breakdown |
|---|---|---|
| `share` | ShareBar (every article/Daily/report) | `network` (X/FB/LinkedIn/WhatsApp/copy/native), `page` → **most-shared content** |
| `subscribe` | Home top, home bottom, subscribe page | `where` → **which placement converts** |
| `report-unlock` | Gated Intelligence reports | gated lead-magnet conversion |
| `move-watch` | Move-of-the-Day link | engagement with curated clips |

### Goals → conversion rates
In Umami → the site → **Settings → Goals**, add goals for the `subscribe` and `report-unlock` events. Umami then shows conversion rate (event ÷ visitors) over any range.

### Verify it's live
Umami → **Realtime**, then open sqwod.life in another tab — you should appear within seconds.

---

## 2. Resend (email analytics)

Email metrics live in Resend, **not** Umami.

- **Dashboard:** Resend → **Broadcasts** → click a broadcast = delivered, open rate, click rate, bounces, unsubscribes. Marketing Analytics shows trends across campaigns.
- **One-time setup:** enable **Open + Click Tracking** on the sending domain (Resend → Domains → toggles), or opens/clicks won't record.
- **Caveat:** open rates are inflated by Apple Mail Privacy Protection — treat opens as a rough trend; **clicks + downstream conversions are the real signal.**

---

## 3. UTM tags (the email → site bridge)

`automation/newsletter.mjs` tags every **internal** link in the Daily so Umami attributes the resulting traffic + conversions to the exact issue. Sponsor/affiliate/external links are left clean — we never put Sqwod UTMs on a third party's URL.

**Scheme:**
```
utm_source=sqwod-daily
utm_medium=email
utm_campaign=daily-<YYYY-MM-DD>
utm_content=<placement>   # view-online | listen | play | share-cta | subscribe-footer | rec
```

**Read it in Umami:** filter by campaign `daily-2026-06-30` (or source `sqwod-daily`), then break down by `utm_content` to see whether the read-online link, the listen CTA, or the subscribe button drove the action.

This flows automatically through `send.mjs` → every Resend broadcast ships with tagged links. No per-issue work.

---

## The full loop
Daily email (Resend: who clicked) → tagged links → site (Umami: what they did — read, subscribe, share, unlock) → goals (conversion rate). One funnel, two dashboards, free.
