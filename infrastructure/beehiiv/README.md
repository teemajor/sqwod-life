# beehiiv — list, send, referral, swag

beehiiv is the ESP for Sqwod Daily: it owns the **subscriber list**, **sends** the
email, runs the **referral program**, and hosts the **subscribe forms**. Our site
+ automation feed it; a Cloudflare Worker turns referral milestones into swag.

```
site subscribe forms ─┐
                      ├─► beehiiv (list · send · referral) ──► milestone webhook ──► swag-fulfill Worker ──► Shopify order ──► Printful ships
cascade → issue HTML ─┘            └─ {{rp_refer_url}} / {{rp_personalized_text}} render in the email
```

## How the daily email gets sent — NOT on Enterprise (and not planning to be)
beehiiv's programmatic Send/Create-Post API is Enterprise-only, and **RSS-to-Send needs the Max plan**. Two real paths, both now produced automatically by `automation/newsletter.mjs`:

**Path A — Free / any plan: paste the snippet (pixel-perfect, ~60 sec/day).**
Our email is built with **inline styles only** (no `<style>`/`<script>`), which is exactly what beehiiv's **HTML Snippet** block preserves. Each morning:
1. New post in beehiiv → add an **HTML Snippet** block.
2. Paste the contents of `site/public/email/<date>-<lang>.snippet.html` (body-only, ready to paste).
3. Send. The referral tags (`{{rp_refer_url}}`, `{{rp_personalized_text}}`) + `{{unsubscribe}}` resolve on send.
This keeps our exact design. It's the recommended path while free.

**Path B — Max plan: RSS-to-Send (fully automated).**
We publish a content feed at `https://sqwod.life/daily-en.xml` (+ `daily-de.xml`) with the full inline-styled email in `content:encoded`. In beehiiv → Automations → RSS-to-Send, point it at that URL, schedule weekday mornings, keep the beehiiv wrapper minimal. Zero-touch sends; fidelity is close (beehiiv adds its own header/footer around our content — test once).

> Bottom line: stay free and paste the daily snippet (exact look, one minute), or pay for **Max** to fully automate via the RSS feed. You do **not** need Enterprise either way.

## Setup checklist
1. **Create the publication** in beehiiv (Sqwod Daily). Set up EN/DE — beehiiv is one list; use a language custom field or two publications if you want fully separate sends.
2. **Subscribe forms:** Settings → Subscribe Forms → Embed. Paste the iframe `src` into `site/src/config/beehiiv.ts` (`embedUrl`), or set `subscribeUrl` to your `*.beehiiv.com` page. The homepage strips + `/subscribe` page use these.
3. **Referral Program:** enable it; define milestones + rewards to match the swag:
   - 3 referrals → Sqwod Sticker Pack
   - 10 → Sqwod Daily Tee
   - 25 → Sqwod Hoodie
4. **Swag (Shopify + Printful):** the 3 products already exist in Shopify as **DRAFT** (collection "Referral Rewards"). In Printful, **link each existing Shopify product** to a print file (don't recreate — link, to avoid duplicates), add your artwork, then set the products **Active**.
5. **Milestone → fulfillment:** deploy `infrastructure/swag-fulfill` (`wrangler deploy`), set secrets `SHOPIFY_ADMIN_TOKEN` + `BEEHIIV_WEBHOOK_SECRET`, confirm `REWARDS_JSON` variant IDs (prefilled with the draft variants). In beehiiv, add a **webhook** on the referral-milestone event → `https://<worker>/reward?secret=<BEEHIIV_WEBHOOK_SECRET>`. Map beehiiv's payload fields (email, milestone, shipping) — the Worker already handles common shapes.
6. **Printful auto-fulfill:** in Printful's Shopify settings, enable automatic order fulfillment so reward orders ship without manual steps.

## Notes
- Reward orders are created at 100% discount (free) and tagged `referral-reward`.
- Sized items (tee/hoodie) default to M; capture size in the beehiiv reward-claim form and pass it through to pick the right variant.
- Merge tags live in `automation/newsletter.mjs` (Share Sqwod card + footer).
