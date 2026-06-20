# beehiiv — list, send, referral, swag

beehiiv is the ESP for Sqwod Daily: it owns the **subscriber list**, **sends** the
email, runs the **referral program**, and hosts the **subscribe forms**. Our site
+ automation feed it; a Cloudflare Worker turns referral milestones into swag.

```
site subscribe forms ─┐
                      ├─► beehiiv (list · send · referral) ──► milestone webhook ──► swag-fulfill Worker ──► Shopify order ──► Printful ships
cascade → issue HTML ─┘            └─ {{rp_refer_url}} / {{rp_personalized_text}} render in the email
```

## How the daily email gets sent (pick one)
beehiiv's programmatic **Send/Create-Post API is Enterprise-only (beta)**, so unless you're on Enterprise, automate the send one of these ways:
1. **RSS-to-send automation (recommended, no Enterprise):** beehiiv can auto-create/send a post from an RSS feed. We can publish a content RSS of each issue (full HTML in `content:encoded`) for beehiiv to pull. Layout is wrapped by beehiiv's template.
2. **Paste (simplest):** drop our generated `site/public/email/<date>-<lang>.html` into a beehiiv **custom-HTML block** and send. Fully on-brand, ~1 min/day.
3. **Send API (if Enterprise):** POST the HTML to beehiiv's Create-Post endpoint from a workflow — fully automated.
The referral merge tags (`{{rp_refer_url}}`, `{{rp_personalized_text}}`) and `{{unsubscribe}}` are already in our HTML and resolve when beehiiv sends.

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
