# Sqwod Verified — Deals / Affiliate Architecture (v1)

*Phase 4. The deals engine, built as a credible, methodology-driven buyer's-guide system — not a coupon dump. Trust is the product; affiliate revenue is the byproduct of being the most rigorous reviewer in wellness.*

---

## 1. The principle: an authority brand, not an affiliate farm

Sqwod Verified earns the right to recommend by being transparent and rigorous. The reader trusts it because the methodology is visible, the scoring is consistent, and the affiliate relationship is disclosed up front. Everything below serves that. The name was chosen to lead with the *standard*, not the discount.

**Editorial firewall (non-negotiable):** scores are set by the criteria, never by commission rate. We publish products that score poorly. We state when we haven't tested something. This firewall is itself a marketing asset — and it's what keeps us compliant in both markets.

---

## 2. Section structure (from the IA)

```
/[lang]/verified/
├── /                       Hub — categories + latest "Best of" + how we test
├── /{category}             Category buyer's guide (e.g. /wearables, /recovery)
├── /{category}/best-{x}    "Best of" roundup (Best for coaches, Best budget, etc.)
├── /reviews/{product}      Single product review (standard template)
├── /methodology            The visible weighted scorecard (trust anchor)
└── /disclosure             Affiliate disclosure — DE + EN compliant
```

Three content types: **Buyer's Guides** (category overview + ranked picks), **Best-of Roundups** (use-case cuts), **Single Reviews** (one product, full template). All three reuse the same scoring spine.

---

## 3. Launch categories

Chosen to (a) map to the wellness industry, (b) feed from the **Tech & Tools** pillar, and (c) route to Sqwod destinations. Start with 4–5, expand off wiki data.

| Category | Routes to | Notes |
|---|---|---|
| Wearables & trackers | Sqwod AI + affiliate | Highest search volume; data-rich |
| Recovery tools | Products + affiliate | Massage guns, compression, sauna/cold |
| Supplements & nutrition | Products + affiliate | Compliance-sensitive (health claims) |
| Equipment & home gym | Pods + affiliate | Ties to the Pod's Rogue-equipped story |
| Coaching apps & software | Sqwod OS + affiliate | Operator-facing; highest conversion intent |

---

## 4. The weighted scorecard (the methodology page, made concrete)

A **transparent, weighted, criteria-based** score out of 10. A shared spine applies to everything; each category re-weights for what matters there. Published openly on `/verified/methodology`.

**Shared scoring spine (default weights):**

| Criterion | Weight | What it measures |
|---|---|---|
| Performance / efficacy | 30% | Does it do the core job well? |
| Value for money | 20% | Price vs. what you actually get |
| Build quality / durability | 15% | Will it last under real use? |
| Experience / ease of use | 15% | Setup, daily use, friction |
| **Coach/operator fit** | 12% | *Our edge:* usefulness to a wellness professional |
| Support & warranty | 8% | Service, returns, guarantee |

Each criterion scored 1–10, multiplied by weight, summed → overall score. Sub-scores always shown so readers can weight for themselves.

**Category overrides (example — Wearables):** Performance becomes *data accuracy* and rises to 35%; add *battery life* and *data export/interoperability*; trim build weight. Each category page states its own weighting table. Where relevant, criteria are **backed by Forge/Statista data** (e.g. category price benchmarks, adoption stats) so scores sit on real market context, and the wiki stores each product as a node with price/spec facts that refresh over time.

---

## 5. The review template (identical on every product)

Consistency is the trust signal. Every `/verified/reviews/{product}` page carries, in this order:

1. **Verdict line** — one sentence + overall score badge (the diamond-seed mark scored 0–10).
2. **At-a-glance** — price, category, best-for tag, last-updated date, "tested / assessed-from-spec" flag.
3. **Sub-scores** — the weighted table, visible.
4. **Pros / Cons** — scannable, honest.
5. **Who it's for / Who should skip it** — the operator lens.
6. **The detail** — performance, value, experience, written analysis.
7. **Verdict (full)** — recommendation + alternatives ("if this isn't right, consider…").
8. **Last updated** + reviewer + **affiliate disclosure block** + link to methodology.

The **last-updated date is mandatory and prominent** — it's both a trust signal and an SEO freshness signal, and it triggers the wiki's staleness flow to keep prices/specs current.

---

## 6. Compliance — both markets, baked in

Affiliate revenue is only safe if the disclosure is clean. This is engineered, not hoped for.

**Germany / EU (UWG, TMG, EU consumer law):**
- Clear paid labeling — **"Werbung"** / **"Anzeige"** / **"Affiliate-Links"** — visibly at the top of any page with affiliate links, not buried in a footer.
- Affiliate links carry `rel="sponsored nofollow"`.
- Prices show currency, VAT context, and a "price as of {date}" stamp (German price-accuracy norms).
- **Impressum** linked site-wide (already in IA).

**English / international (FTC-style):**
- Plain-language disclosure at the top: *"We may earn a commission from links on this page. It never affects our scores — here's how we test."* linking to `/methodology` and `/disclosure`.

**Privacy & tracking (GDPR):**
- Consent-managed (CMP) before any non-essential/affiliate tracking fires — required for lawful attribution.
- First-party, consent-gated click tracking so we can measure revenue per product/pillar without dark patterns.

**Health-claims guardrail (supplements/nutrition):** no medical/efficacy claims beyond what evidence and EU/DE health-claim rules permit; this category gets an extra review pass.

---

## 7. How it monetizes & connects to the engine

- **Revenue:** affiliate commissions, instrumented per product → ties back to the `conversion: verified` tag so we see which categories and pillars actually earn.
- **Fed by the cascade:** Tech & Tools articles link into Verified; the living wiki holds each product as a node (price, specs, score history), so reviews get faster to produce and prices stay current automatically.
- **Routes to Sqwod:** every guide surfaces the relevant Sqwod destination natively (equipment guide → Pods; software guide → Sqwod OS; wearable guide → Sqwod AI) — helpful, not forced.

---

## 8. Decisions before Phase 5 (monetization funnel)

1. **First 2 categories to build:** my lean — **Wearables** (reach/SEO) + **Coaching apps & software** (highest conversion intent, routes to Sqwod OS).
2. **Testing model:** hands-on tested vs. expert-assessed-from-spec+data at launch? My lean — assessed-from-spec+data with the wiki/Statista backbone at MVP, clearly flagged, adding hands-on for flagship picks as we scale. (Affects credibility claims, so worth your nod.)
3. **Default scorecard weights:** good as-is, or do you want "Coach/operator fit" weighted even higher to sharpen the differentiation?

Confirm (or let me keep driving) and I'll build Phase 5 — the newsletter, community, and full monetization funnel with all four revenue streams instrumented from day one — then close with Phase 6: the tech stack, the living-wiki technical design, and the phased MVP→V1→Scale roadmap.
