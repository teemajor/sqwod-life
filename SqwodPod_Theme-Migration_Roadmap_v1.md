# Sqwod Pod — Theme Replacement & Store Management Roadmap (v1)

**Goal:** replace the current live theme ("Sqwod Pod V3", a customized Pitch theme) with the new dark Sqwod design system, and run the store day-to-day from Cowork — without breaking URLs, bookings, products, or SEO.

**Store facts (confirmed live):**
- Platform: Shopify, Online Store 2.0 (JSON/section templates) — re-skinnable, no full rebuild needed.
- Domain: sqwodpod.com (sqwod-pod.myshopify.com).
- Locales: EN (primary) + DE — both published (Markets already bilingual).
- Live theme: "Sqwod Pod V3" (MAIN). 8 draft themes already exist.
- Templates in play: home (+ Europe market variant), collection / 2-pods locations, product (pod, Momence Kollwitzkiez, Momence Weißensee), packages-and-memberships, book-session, contact, collabs, blog, article, cart, search, policies.

## Division of labor (Shopify safety model)
- **From Cowork (me):** edit theme files on a DRAFT theme, restyle all templates, set theme settings (color/type/logo), build pages, manage products / collections / inventory / blog / SEO, prep redirects.
- **In Shopify admin (you):** create the draft (duplicate), and PUBLISH when approved. Theme create/publish are intentionally blocked from here. Rollback = re-publish the old theme.

## Approach: re-skin a duplicate (not a rebuild)
Lowest risk, preserves every product, URL, booking link, and locale. Build on a draft, preview on the real store, publish when happy.

---

## Phase 0 — Setup (now)
- [ ] **You:** duplicate "Sqwod Pod V3" → rename "Sqwod 2026 Build" (draft).
- [ ] Me: detect the draft, read its theme settings + key templates.
- [ ] Me: map our design tokens (ink/chalk palette, type, logo) to theme settings.

## Phase 1 — Design system into the theme (MVP skin)
- [ ] Global: color scheme, typography, logo (white SQWOD POD wordmark), favicon.
- [ ] Header/nav + footer to match mockup.
- [ ] Home page re-skin (hero, why-private, 3 steps, pricing, locations, founder w/ Tee portrait).
- [ ] Buttons, cards, sections styled to the dark system.

## Phase 2 — Key templates
- [ ] Locations collection + the two Pod/Momence booking templates.
- [ ] Packages & Memberships page.
- [ ] Blog index re-skin → "Pod Guides" (local Berlin SEO funnel) + article template.
- [ ] **New page: Company Wellness** (Pod-in-office + Sqwod AI), DE/EN.

## Phase 3 — Bilingual + SEO/GEO
- [ ] DE/EN parity via Markets / Translate & Adapt; hreflang.
- [ ] Meta titles/descriptions, schema (LocalBusiness per Pod, Blog/Article, FAQ), alt text.
- [ ] Preserve all existing handles; redirect map for any changed URLs.

## Phase 4 — QA & launch
- [ ] Preview draft: both locales, mobile, checkout, every booking link, all redirects.
- [ ] **You:** publish. Keep old theme for one-click rollback.

## Phase 5 — Ongoing store management from Cowork
- Catalog cleanup (archive vs active, fix placeholder inventory), pricing, discounts, collections, blog publishing, SEO, analytics review.

---

### Open decisions
- Final name for the blog section ("Pod Guides" working name).
- Whether Company Wellness ships as a Shopify page now or waits for the full skin.
- Catalog cleanup scope (most merch is archived; inventory numbers are placeholders).
