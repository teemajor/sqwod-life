# Sqwod Content Engine — Operating Playbook (v1)

This is the brain for the automated blog content agent on **sqwodpod.com / Pod Guides**.
The weekly scheduled task ("sqwod-content-engine") reads this file every run. Edit this file to change strategy — the agent will follow the latest version.

Last updated: 2026-06-30 · Owner: Tee · Cadence: weekly · Autonomy: **draft-for-approval** (nothing publishes without Tee's sign-off).

---

## 1. Mission & the one number that matters

Turn organic search + AI-answer traffic into **booked Sqwod Pod sessions and qualified leads**, in **German and English**, for Berlin and the DACH region.

**North-star KPI:** assisted bookings + lead-page conversions from blog traffic.
**Leading indicators per post:** keyword ranks (DE + EN), impressions/clicks (Search Console), internal-link clicks to conversion pages, AI-engine citations.

Quality over volume. Google rewards genuinely helpful content and penalizes thin, mass-produced AI pages. **One excellent bilingual post per week beats five mediocre ones.** Never publish to hit a number.

---

## 2. The four audiences → conversion paths

Every post is written for ONE primary audience and routed to ONE primary conversion page.

| # | Audience | What they search | Primary CTA page | Secondary |
|---|----------|------------------|------------------|-----------|
| A | **Consumers / members** (busy professionals, fitness-curious, Berlin) | "private gym Berlin", "personal training near me", "Pilates Prenzlauer Berg", "how to start strength training" | `/pages/packages-and-memberships` (DE: `/pages/workout-buchen`) | `/pages/memberships`, Locations |
| B | **Coaches / personal trainers** | "rent gym space Berlin", "how to get personal training clients", "PT studio costs", "selbstständig als Personal Trainer" | `/pages/fitness-trainers` (For Trainers) | `/pages/find-a-trainer`, `/pages/claim` |
| C | **Gym / studio founders & operators** | "open a gym Germany", "studio retention", "boutique fitness business model" | `/pages/fitness-trainers` | `/pages/company-wellness` if HR-adjacent |
| D | **HR / workplace-wellness buyers** | "corporate wellness Berlin", "Betriebliches Gesundheitsmanagement", "employee fitness benefit", "BGM Anbieter" | `/pages/company-wellness` | `/pages/contact` |

Rule: **A** is the volume driver (top-of-funnel reach). **B/C/D** are higher-intent, lower-volume, higher-value. Balance the calendar ~50% A, ~20% B, ~15% C, ~15% D.

---

## 3. Content pillars (map to project taxonomy)

1. **Industry Intelligence** — market data, trends (Statista-backed) → authority, funnels to all.
2. **Coaching & Studio Business** — acquisition, retention, ops → audiences B/C → For Trainers.
3. **Method & Programming** — training science, how-to → audience A → Packages / Sqwod App.
4. **Tech & Tools** — wearables, apps, AI in wellness → audience A → (future deals pages).
5. **Wellness Culture** — longevity, recovery, nutrition → audience A → reach + list growth.

Tag every post with: `pillar`, `audience (A–D)`, `language (DE/EN)`, `primary CTA page`. Record it in the backlog file.

---

## 4. Local SEO strategy (this is the core advantage)

Sqwod Pod is a **physical Berlin business** — local intent is where we win cheaply.

**Geo-terms to weave in naturally** (never stuff): Berlin, Prenzlauer Berg, Weißensee, Pankow, Kollwitzkiez, 10405, 13086, "in der Nähe", "near me", DACH. Two Pods: **Weißensee** and **Kollwitzkiez**.

**On-page local signals every relevant post must carry:**
- City/neighbourhood in the H1 or first 100 words when the topic is location-relevant.
- A link to the **Locations** page and to the relevant Pod's Google reviews.
- `LocalBusiness` / `HealthClub` JSON-LD already lives in the footer — don't duplicate; instead use `Article` + `FAQPage` schema on posts (see §6).
- Consistent NAP (name, address, phone) — never invent an address or phone; pull from the live site.

**Topical authority:** build clusters, not one-offs. A pillar page ("Private Gyms in Berlin: the complete guide") links down to cluster posts ("Private gym vs commercial gym", "Cost of personal training in Berlin", "Best neighbourhoods to train in Berlin"), which link back up. The agent should grow one cluster at a time.

---

## 5. GEO — Generative Engine Optimization (get cited by AI answers)

Increasingly, traffic starts in ChatGPT / Google AI Overviews / Perplexity. To be the cited source:

- **Answer the question in the first 2–3 sentences**, then expand. AI engines lift clean, self-contained answers.
- **Use a clear question as H2**, answer directly beneath it (feeds `FAQPage` schema + featured snippets + AI citations).
- **Cite concrete, attributable data** (Statista, official bodies). AI engines prefer sourced claims. Link the source.
- **Entity clarity:** state plainly what Sqwod Pod is ("Sqwod Pod is a private, app-booked gym in Berlin with locations in Weißensee and Kollwitzkiez"). Repeat the entity definition once per post.
- **Structured comparisons** (tables, pros/cons, "who it's for") get pulled into answers.
- **Freshness:** include "last updated" dates; refresh cornerstone posts quarterly.

---

## 6. Bilingual DE/EN parity (hard rule)

- **Both languages are first-class.** Every post ships EN + DE. DE is not a machine afterthought — write idiomatic German (du-form, Berlin-direct tone, correct fitness terminology: Krafttraining, Beweglichkeit, Regeneration, Betriebliches Gesundheitsmanagement).
- The store has **no `/de` subfolder** — DE is served at the same URL via locale. Use Shopify article translations (`translationsRegister` with `translatableContentDigest`) to attach the DE version, exactly as the legal pages were done.
- Keyword research must be run **separately per language** — DE search intent ≠ translated EN keywords (e.g. "Personal Trainer Berlin Kosten", not "personal trainer Berlin cost").
- German headlines run ~30% longer — keep titles tight so they don't truncate in SERPs.

---

## 7. Artwork — the locked house style (answers "how do we handle images on new posts")

Every new post gets an original cover in the **locked black-and-white manhwa style** (chosen via LLM Council, 30 Jun 2026). This is now automatic — same pipeline that produced the 45-cover batch.

**Style prompt template (Imagen 4 / `imagen-4.0-generate-001`):**
> Black-and-white Korean webtoon manhwa comic-book illustration, monochrome, high-contrast bold black ink outlines, grayscale cel shading with subtle screentone, dramatic lighting, absolutely no colour, semi-realistic athletic proportions, cinematic, clean composition with negative space. Subject: {SCENE}. No text, no words, no letters, no logo, no numbers, no watermark, no signature, no vehicles, no capsule, no pod cabin, no sci-fi chamber, no enclosed booth, no cryo-pod, no photorealism.

**⚠️ CRITICAL — what a "Pod" is:** A Sqwod Pod is a **spacious private gym ROOM (~30–50 m²)** with equipment along the walls — NOT a capsule, cabin, sci-fi chamber, or person-sized unit. AI models draw "pod" as a capsule; they are WRONG. Never put the word "pod" in the image scene. Describe the setting as **"a spacious private gym room"** (large window, premium minimal interior). See [[ref-sqwod-pod-definition]].

**Rules:**
- **No baked-in text/headlines on the image** (Tee's call — the theme renders the title separately). The negative prompt above enforces this.
- Compose one clear human subject + action/metaphor, weighted to one side, clean negative space.
- **Alt text in English**, descriptive + keyword-aware (e.g. "Black and white illustration of a coach guiding a client through a deadlift in a private Berlin gym").
- **QC before upload:** generate, eyeball for misfires (extra limbs, stray objects, accidental text, any colour, capsules/pods, photorealism). Regenerate up to 2× if wrong. Common misfires seen: vehicles, animals, baked text, sci-fi capsules, stray stock photos — reject and re-roll.
- Pipeline: generate PNG → `stagedUploadsCreate` (httpMethod **PUT**, single presigned URL) → PUT bytes (Content-Type image/png) → `articleUpdate(image:{url:resourceUrl, altText})`. Use a **unique filename** per upload (append a short random suffix) to avoid CDN dedup silently keeping an old image.
- **MANDATORY post-upload verification:** after `articleUpdate`, re-query the article's `image.url`, download that live file, and confirm it visually matches the manhwa image you just generated (correct style, correct concept, not a stray/stock photo). If it doesn't match, the upload silently failed — re-upload. (This exact failure shipped a stock suit-man photo in the June batch because only the *generated* file was QC'd, never the *live* attached one.)
- Cost ≈ $0.04/image. Budget-capped key (see §11).

---

## 8. Internal linking & CTA rules (non-negotiable per post)

- **≥2 links to conversion pages** (the primary CTA page for the audience + one secondary), with natural anchor text.
- **≥2 links to related Pod Guides posts** (build the cluster; distribute authority).
- One clear **CTA block** near the end routing to the booking/lead page in the reader's language (EN → Packages, DE → Workout buchen / Company Wellness).
- Never link to competitors. Outbound links only to authoritative sources (Statista, research, official bodies) for E-E-A-T.

---

## 9. Maintenance & de-staling (runs alongside new content each week)

- Scan a slice of existing posts each run for: outdated years in titles/body, dead internal links, missing alt text, thin content, missing schema.
- **De-date** stale titles (e.g. "...in 2025" → drop or update) — **keep the URL/handle unchanged** to avoid breaking links.
- **Never invent statistics.** If a stat is outdated, either replace it with a sourced current figure (Statista/official) or flag it for Tee — do not fabricate.
- Refresh "last updated" date when a post is meaningfully improved.

---

## 10. Compliance

- **E-E-A-T:** real expertise, sourced claims, author = Sqwod Pod, no fabricated credentials.
- **Affiliate/deals content (future):** label clearly per German law (UWG/TMG — "Anzeige"/"Werbung") for DE and FTC-style disclosure for EN. Not active yet — flag when deals posts begin.
- **GDPR:** no tracking pixels added in post body; consent handled by the site's custom cookie banner.
- **No medical claims** beyond general wellness; no "cure/treat" language.

---

## 11. Identifiers & runtime config (appendix)

- **Store:** Sqwod Pod · https://sqwodpod.com
- **Blog:** "Pod Guides" · handle `the-sqwod-journal` · `gid://shopify/Blog/89116541217`
- **Conversion pages:** `/pages/packages-and-memberships`, `/pages/workout-buchen` (DE booking), `/pages/memberships`, `/pages/company-wellness`, `/pages/fitness-trainers` (For Trainers), `/pages/find-a-trainer`, `/pages/claim`, `/pages/about-us`, `/pages/contact`, `/pages/sqwod-app`, `/pages/influencers-affiliates-collabs` (Community).
- **Locations:** served as a collection page (per store ref); link Pod reviews from there.
- **Live theme write rule:** theme file writes are blocked on the published theme — content posts are DATA (articles/metaobjects), so they publish fine; only *theme* edits need the duplicate-and-publish workflow.
- **Image key:** read at runtime from `Sqwod.Life/.secrets/gemini.key` (single line). Never hard-code the key in the task prompt or memory. Current AI Studio keys use the **`AQ.` prefix** — this is the standard, permanent format (Google retired the old `AIza…` keys in 2026). An `AQ.` key is correct; do not treat it as temporary. Verified working 2026-06-30 (Imagen 4, billing + quota live).
- **Backlog/calendar:** `Sqwod.Life/Sqwod-Content-Backlog_v1.md` — the agent picks the next topic from here and marks it done.

---

## 12. Per-run SOP (the weekly checklist the agent executes)

1. **Read** this playbook + the backlog file.
2. **Pick** the next `Queued` topic (respect the audience mix ~50/20/15/15). If the backlog is low (<6 queued), research and append 6 new topic ideas first.
3. **Keyword research** for that topic — separately in DE and EN (WebSearch; note primary + 3–5 secondary keywords per language, with local geo-modifiers where relevant).
4. **Draft** the post (EN), 800–1,400 words: direct answer up top, clear H2 questions, sourced data, table/pros-cons where useful, entity definition, FAQ section.
5. **Write the German version** — idiomatic, not translated; re-target DE keywords.
6. **Internal links + CTA** per §8. **Schema:** Article + FAQPage.
7. **Generate the cover** in the locked manhwa style (§7), QC, upload, set as article image with EN alt text.
8. **Create the article as a DRAFT / unpublished** (`isPublished: false`) on blog `89116541217`; attach DE translation.
9. **Maintenance pass:** scan ~3–5 existing posts; de-date/fix links/add alt text where safe (§9).
10. **Report back** (notification): title (EN+DE), audience, pillar, target keywords, CTA page, cover preview note, what maintenance was done, and the admin/preview link — **ask Tee to review & publish.**
11. **Update the backlog** file: mark the topic `Drafted (awaiting approval)`, append any new ideas surfaced.

Never publish. Never invent stats. Never bake text into images. Never link competitors.
