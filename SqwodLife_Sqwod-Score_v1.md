# The Sqwod Score — Proprietary Rating System (v1)

*Extends Phase 4 (Sqwod Verified). The Sqwod Score becomes the heart of the deals engine: one trustworthy number per product, built from real-user feedback across the whole internet + our own assessment + the best live price.*

---

## 1. The origin story (the positioning)

> *"I just wanted the best product. Instead I got 40 open tabs, fake five-star reviews, affiliate junk, and a different rating on every site. So I built the thing I actually wanted: one list, the real info, and the best deal. Simple."* — Tee

That frustration **is** the product. Sqwod Verified exists to end the search. Every category answers three questions and nothing else:

1. **What's the best?** → the ranked list
2. **Why?** → the info, distilled
3. **Where do I get it for less?** → the best deal, live

The **Sqwod Score** is the one number that collapses all the noise. It's not our opinion shouted louder — it's the *whole picture*, made honest.

---

## 2. What the Sqwod Score is

A single score (**0–100**, shown with the diamond-seed badge) per product, computed from three transparent components. Every sub-score is visible — readers can see exactly how we got there, and re-weight for themselves.

| Component | Weight | What it is |
|---|---|---|
| **Crowd Signal** | 45% | Aggregated, normalized real-user feedback from across many platforms — ratings + sentiment, volume- and recency-weighted, fake-review-filtered. |
| **Sqwod Assessment** | 40% | Our Phase 4 expert scorecard (performance, value, build, experience, **coach/operator fit**, support). The professional lens. |
| **Value / Deal** | 15% | Best available price vs. category benchmark + price trend. Rewards the genuine deal, not the inflated "was/now." |

Plus two honesty signals shown alongside the number (never hidden):

- **Confidence** — High / Medium / Low, based on how much real data backs the score (10 reviews vs. 10,000 is not the same).
- **Last updated** — the score is *live*; it recomputes as new data and prices arrive.

> Why a blend, not just crowd ratings? Pure star-averages are gameable and shallow. Pure expert scores are one person's taste. The blend — crowd truth, professional judgment, real price — is what no single site gives you, and it's exactly the gap your origin story describes.

---

## 3. Crowd Signal — how we gather the full picture (responsibly)

The goal: capture what *actual users* across the internet think. The constraint: do it in a way that keeps the brand legally clean and genuinely trustworthy — because "most trusted score in wellness" dies the day we get caught republishing scraped content or laundering fake reviews.

**Source tiers (credibility-weighted):**

| Tier | Examples | How we access |
|---|---|---|
| Retail & marketplace ratings | Amazon, retailer sites | Official APIs / affiliate product feeds (PA-API etc.) |
| App stores | iOS App Store, Google Play | Official store APIs |
| Dedicated review platforms | Trustpilot, G2, Capterra | APIs / licensed access where available |
| Community & social | Reddit, YouTube, forums | Official APIs (Reddit, YouTube) + sentiment on permitted content |
| Expert/editorial | Reviews, lab tests, publications | Read & cite + **link out** (we summarize findings, never copy the article) |

**The principle — aggregate the *signal*, not the *content*:**
- We store the **data point** (a rating, a review count, a sentiment read) as a sourced fact, with attribution and a link back. We do **not** republish copyrighted review text wholesale; we quote sparingly with credit and link to the original.
- We prefer **official APIs and licensed data**; we respect `robots.txt` and platform terms. Where a high-value source has no clean access path, we use a **licensed data provider or assisted manual curation** rather than brittle, risky scraping. ("Scrape everything" is the intent; "ingest the signal legitimately" is the implementation that survives scale and scrutiny.)
- Every external rating becomes a **sourced fact in the living wiki** (Phase 3) → the Sqwod Score is **computed, auditable, and citable** down to its inputs. That auditability is the trust feature.

**Quality controls (so the crowd number means something):**
- **Normalization** — every scale (5-star, 10-point, thumbs) mapped to a common 0–100.
- **Volume weighting** — more reviews → more weight (with diminishing returns).
- **Recency decay** — last 12–18 months count more; a product that got worse shows it.
- **Source credibility weighting** — a verified-purchase platform outranks an anonymous comment.
- **Fake-review mitigation** — anomaly detection (rating spikes, duplicate language, burst patterns) discounts suspicious clusters; low-trust sources are capped.
- **De-duplication** — the same review syndicated across sites counted once.

---

## 4. Value / Deal — solving "the best deal"

The third of your three questions, instrumented:
- Track price across retailers via affiliate feeds; surface the **best current price** with a "price as of {date}" stamp (DE price-accuracy rules).
- Show a simple **price-history sparkline** so "deal" means a real low, not marketing theater.
- Affiliate links carry `rel="sponsored"`; the deal that's best for the *reader* wins placement — never the one that pays us most. (Editorial firewall, Phase 4.)

---

## 5. On the page (what the reader sees)

Every `/verified/reviews/{product}` now leads with the Score:

1. **Sqwod Score 0–100** (diamond-seed badge) + Confidence + Last-updated.
2. **The three components**, each expandable: Crowd Signal (with source count + "from X reviews across Y platforms"), Sqwod Assessment (the scorecard), Value (best price + history).
3. **Best deal** button (live price).
4. The Phase 4 template below it: pros/cons, who it's for / who should skip, verdict, alternatives.

Category buyer's guides and "best-of" roundups simply **rank by Sqwod Score** — that's the list your origin story wanted. A `/verified/methodology` page shows the entire formula, weights, sources, and controls in the open. **Radical transparency is the moat.**

---

## 6. How it's built (fits the existing stack)

- Each product = a **node** in the living wiki; each external rating, price, and our assessment = **sourced facts** on that node.
- **Scheduled jobs** (Phase 6) refresh ratings + prices and **recompute the Score** → that's what makes it "live" and the last-updated date real.
- The Score formula is just a function over the node's facts — versioned, so methodology changes are transparent and historical.
- MVP can launch with 2 categories where clean API/feed access exists (e.g. **Wearables**, **Coaching apps & software**), proving the model before expanding.

---

## 7. Two calls for you

1. **The blend:** Crowd 45 / Sqwod 40 / Value 15 — comfortable? If you want the *crowd* to lead even harder (more "voice of the people"), we go 55/30/15. My lean: 45/40/40→ keep our expert lens strong early (it's the differentiator vs. plain aggregators), shift toward crowd as data volume grows.
2. **Scale & name:** **0–100 "Sqwod Score"** (my pick — more granular, feels like an index) or **0–10** to match the Phase 4 scorecard? And do we badge it just "Sqwod Score," or brand the seal (e.g. *"Sqwod Verified — Score 92"*)?

Give me those two and I'll fold this into the Sqwod Verified spec, update the methodology page, and — if you want — mock up a sample scored review so you can see the Score in action on a real product.
