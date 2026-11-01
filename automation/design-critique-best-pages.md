# Design critique: ranking pages (`/en/best/<category>/`)

Reviewed 1 Nov 2026 against the built page for `/en/best/wearables/` on a 1280px desktop and a 390px phone, and against the patterns of Wirecutter, RTINGS, DC Rainmaker, Natural Intelligence (Top10.com, BestMoney), Compado, Buyers Guide and Forbes (Vetted and Advisor). External review sites cannot be fetched from this session, so their patterns are from prior knowledge, tagged below. Screenshots: `automation/build-shots/best-*.png`.

## Overall impression

The page has better bones than most affiliate roundups: a public 0–100 score with published weights, a disclosure above the fold, pros and cons with markers, per-criterion scores, "buy if / skip if" and an operator view. The biggest problem is that it does not behave like a ranking on a phone. The number the page is built around, the Sqwod Score, is scrolled off the right edge of the table, the lede describes a product that is no longer the top pick, and 21 undifferentiated picks make it a catalogue, not a recommendation.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| On a 390px phone the "At a glance" table is 560px wide. Rank, thumbnail, name and "best for" fill the screen; Score, Price and 90-day low are cut off. The reader scrolls 1.7 screens of table without seeing a single score. [Certain, screenshot `best-phone-table.png`] | 🔴 Critical | Below 640px render ranked cards instead of a table: rank, thumb, name, best-for tag, score pill, price on one row. No horizontal scroll. Desktop keeps the table. |
| The lede is static text in `config/best.ts`, written when the Oura ring led ("you will actually wear it overnight"). The ranking is live, and Suunto Race (a watch) now leads, so the first sentence a reader sees contradicts the pick. [Certain] | 🔴 Critical | Take the lede from the top pick's review (first sentence of its verdict) and keep the guide-level sentence only where it is product-neutral. Add a build check: lede may not name a product that is not `top`. |
| 21 picks, of which 16 are generation pairs (Oura Gen3/5, Whoop 4/5, Apple Watch 9/11/12, Forerunner 165/170 and 965/970, PACE 3/4, RingConn 2/3, Suunto Race/Race 2). Five "best for" labels appear twice. Wirecutter recommends 3–5 with a role each; RTINGS 7–9 by use case; DC Rainmaker groups by budget tier. [Certain for our data, Likely for theirs] | 🔴 Critical | Two layers. "Our picks": 5–7 winners with a unique role (Best overall, Best ring, Best for runners, Best budget, Best subscription-free, Best for Apple users, Best for coaches). "Every scored product": the full table, with older generations collapsed under the current one ("Series 11: still fine, often €80 cheaper"). |
| "The picks" section starts 4,900px down on a phone (5.8 screens). No jump navigation. | 🟡 Moderate | Chip row under the H1: Top pick · All 21 · How we score · Picks · FAQ. Sticky on phones. Forbes and Wirecutter both do this with a sticky table of contents. |
| No way to narrow by intent. The page's own "before you buy" says ring vs watch is the first decision, then asks the reader to scan 21 rows. | 🟡 Moderate | Filter chips over the table: Ring · Watch · Band, Subscription-free, Under €200. Client-side on the existing rows. This is the one thing Top10-style sites do well, minus their paid ordering. |
| Price shows cents (€319.16) and the subscription sits in a separate small line, although the methodology says subscriptions weigh against the score. | 🟡 Moderate | Round to whole euros. Add a "first-year cost" value: price plus 12 months of subscription. "€349 + €5.99/mo = €421 first year" is the sentence a coach needs. |
| Top-pick badge is a bare "87" in a diamond; the scale appears only in the table. | 🟢 Minor | "87 / 100" on the badge, or a one-word band under it (Excellent). |
| Product images are remote (brand CDNs). They did not load in this sandbox; the live site is probably fine, but any brand that moves a file breaks a thumbnail with no fallback image. [Likely] | 🟢 Minor | The `ProductThumb` category glyph already exists; make sure it shows on image error, and consider caching images at build time. |

## Visual hierarchy

- **What draws the eye first**: the 2-line uppercase H1, then the diamond badge. Correct for a ranking page. The "21 picks" in the H1 undercuts it, because 21 is not a selection.
- **Reading flow**: H1 → byline → lede → disclosure → top pick → table → methodology → professionals → before you buy → picks → operator → FAQ. The methodology and "before you buy" blocks (1,750px on a phone) sit between the table and the detailed picks, so the reader who wants #2 and #3 must pass two essays first. Move "How we score" and "Before you buy" below the picks, or collapse them.
- **Emphasis**: the detailed pick cards are strong (score, three sub-scores, criteria grid, pros/cons, buy if). The table row is weak (plain bold number). Add the score pill from the cards to the table.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| "Best for" tags | Same tag on two products ("Runners, best value" twice) | One role per product; older generation gets "Previous gen" instead of repeating the role |
| Score display | Diamond badge in the hero, bold number in the table, "87/100" text in the cards | One score pill component used in all three places |
| Buttons | "Best deal →" solid, "Read review" ghost: good. In the table there is no CTA at all | Add a compact "Deal" link in the card list on phones |
| Price formatting | "€319.16" vs "~€130" in copy | Whole euros everywhere |

## Accessibility

- **Colour contrast**: body and scores pass on the chalk background. The `.note` and `.disc` grey (`--g4`) on cream is close to the 4.5:1 limit at 12–12.5px; raise to `--g3` or 13px.
- **Touch targets**: deal and review buttons are 44px high. The product links inside the table are 14px text with no padding; fine on desktop, tight on a phone. Cards solve this.
- **Text readability**: lede at 17px/1.6 is good. The table at 14px with 10.5px headers is small; the card layout fixes it.
- **Table semantics**: real `<table>` with `<th>`: good for screen readers. Keep it on desktop.

## What works well

- Disclosure in the first screen, and a methodology with weights (45/40/15) linked from the page. Forbes Advisor and Top10.com disclose that payment affects order; we can say the opposite, and it is our strongest trust signal. Say it louder: "Ranking by score only. Commission never changes order."
- Pros and cons with + / – markers, criteria grid and "buy if / skip if" per pick. This is Wirecutter-level depth that Top10-style sites never offer.
- "For professionals" and "For coaches and studio owners" blocks. No competitor speaks to the operator; this is the Sqwod angle and deserves a place higher on the page.
- Structured data: `ItemList` plus `FAQPage` with live scores. Good for Google and for AI answers.
- "Last verified" date with author link.

## What the four operators teach (and what not to copy)

- **Natural Intelligence (Top10.com, BestMoney)** [Certain from their own site]: 80 categories, about 200M visits a year; compensation influences order and they say so. The page is a table and a CTA; everything else is a footnote. Lesson: put the comparison first and make one action obvious. Do not copy: ranking by payment. Google's reviews system has penalised exactly this, and our score is our moat.
- **Compado** (Berlin) [Certain]: 1,000+ "intent-based" sites and a "Brand Choice Widget" that ranks and recommends by machine learning, placed in publishers' content. Lesson: the ranking should travel. A compact "Top 3 wearables for runners" widget inside running articles would convert better than a link to the guide.
- **Buyers Guide (buyersguide.org)** [Guessing: owner not identifiable from public sources]: the template is a Top 5 with a decimal score and a label ("9.8 Exceptional"), one badge ("Best overall"), one CTA, and urgency text. Lesson: a score reads faster with a word next to it. Do not copy: fake urgency ("12 people bought today").
- **Forbes (Vetted and Advisor)** [Certain for the disclosure, Likely for layout]: Advisor states that payment affects position. Vetted leads with a summary box of winners by role with jump links, then per pick "Why we picked it", pros, cons, "who it's for", then "what to consider", methodology and tester credentials, and a "what's new" update log. Lesson: role-based winners at the top and a change log; both are cheap for us because the data already exists.

## Priority recommendations

1. **Phone card list instead of the table below 640px, score visible on every row.** This is the only change that fixes the core failure: a ranking where the rank's number is off-screen.
2. **Curate into roles: 5–7 "Our picks" plus the full table, with generation pairs collapsed.** Turns a catalogue into advice. The data (`bestFor`, scores, review slugs) already supports it; the work is in `config/verified-categories.ts` (unique roles) and the page template.
3. **Data-driven lede plus a build check.** Stops the page contradicting itself the next time the ranking changes.
4. **Jump chips and intent filters** (Ring / Watch / Band, Subscription-free, Under €200), client-side.
5. **First-year cost and whole-euro prices.**
6. **Later**: a guide widget for articles (Compado lesson) and a "What changed" log per guide (Wirecutter and Forbes pattern).

Items 1, 3 and 5 are one template change plus a 20-line check. Items 2 and 4 touch the category config and need your call on roles.
