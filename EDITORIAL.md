# Sqwod editorial standard — sourcing

Applies to **every** article, report, and Daily item we publish. The Sqwod brand
is "truth wins" — our credibility is the product.

## The rule
**Every claim is sourced to evidence or authority, and linked.** If we can't point
to a credible source, we don't state it as fact.

- Prefer **primary / authoritative** sources: the original study, the company's own
  numbers, an established trade body (HFA, IHRSA, Statista), a recognized platform
  or operator in the space.
- Fill the `sources:` array (rendered as clickable citations) and link figures to
  their source. Set `tags:` thoughtfully — they power the automatic Related links.
- **Every figure cites ONE named source with that source's actual number.** No
  "blended", composite, or rounded-to-feel-right figures — if no single source
  states the number, it does not ship. (This rule exists because a flagship report
  once carried a "~$96bn" market topline that traced to no source; never again.)
- **Never invent numbers or medical claims.** Feed real data; keep medical guidance
  inside a coach's scope and flag anything that needs a professional.

## Virality as a signal, not a source
Reach is a useful *discovery* signal — it tells us what's resonating and what's
**relevant and actionable right now**, especially for wellness creators and operators.

- **LinkedIn and X/Twitter** are great for finding the angles, formats, and questions
  the audience actually cares about (the actionable, save-worthy stuff).
- But a viral post is a *lead*, not a citation. Use it to find the topic, then
  **verify the underlying claim against an authoritative source** before we publish,
  and cite that source — not the tweet.
- Net: source *what to write about* from what's proven useful (high engagement);
  source *what we assert* from authority.

## How we find and verify a figure (the research protocol)
You must **actively search** for a source before publishing — never ship an
unsourced number, and never use a "review-due / TBD" placeholder as a substitute
for doing the search. If a figure can't be sourced, it doesn't go in.

**Search → verify → cite, every time:**
1. **Search the web** (the agent has WebSearch/WebFetch; the automated refresh uses
   the Anthropic `web_search` tool). WebSearch reliably egresses here; WebFetch is
   often blocked (403) by publishers — so **triangulate the number across two or
   more independent search reads** rather than trusting one.
2. **Go to the primary source.** A company metric → its own filing/IR release
   (e.g. Peloton's Q3 FY2026 results, SEC). A market size → the named research firm.
   A platform stat → the platform's own report. If you can only reach it through a
   reporter, **name both** ("ClassPass data, via Fitt Insider").
3. **Pin the edition year.** State the period (2026, FY2026, etc.) and record it as
   `period` in `automation/intel-sources.json` so the refresh can't later swap in a
   different year's number.
4. **Reject the bad ones — this rejection IS the integrity.** When estimates for the
   same thing disagree wildly (the "$142bn–$614bn global Pilates" case — reputable
   firms 4× apart), they're noise; use the one credibly-scoped figure and say why
   you excluded the rest.

### Source tiers (who to trust, and how)
- **Tier 1 — cite freely (primary/authoritative):** company filings & IR releases
  (SEC, earnings), government & trade bodies (HFA, IHRSA), and research firms with
  real methodology — **IBISWorld**, **Statista**. Quote the exact number + year and
  link it. (IBISWorld/Statista headline pages often paywall the detail; cite the
  specific figure + scope you verified, e.g. "IBISWorld — US Pilates & Yoga Studios,
  $19.2bn, 2026".)
- **Tier 2 — cite, but name the underlying data:** credible trade press —
  **Athletech News**, **Fitt Insider**, Health Club Management — and platform
  year-in-reviews (ClassPass, Mindbody). These are trustworthy *reporters*; always
  attribute the original data behind their story (the survey/platform/firm).
- **Tier 3 — leads only, NEVER a citation:** viral posts, our own `automation/leads`,
  and SEO/blog aggregators. Use to find the topic; verify the claim in Tier 1/2.
- **Reject outright:** market-research-mill domains (e.g. businessresearchinsights,
  futuredatastats, maximizemarketresearch, polarismarketresearch, researchnester,
  imarc, proficient/fortune "market insights" clones). Inflated, contradictory,
  un-methodical. If that's the only "source," the figure does not ship.

## Quick checklist before publish
- [ ] Every figure/claim has a linked, credible source (Tier 1/2) in `sources:`.
- [ ] Number verified across ≥2 reads; primary source cited where reachable.
- [ ] Edition year stated, and pinned as `period` in the registry if tracked.
- [ ] No invented numbers; no market-mill estimates; no out-of-scope medical advice.
- [ ] Actionable for the reader (coach / studio operator / wellness creator).
- [ ] `tags:` set so it auto-links to related pieces.
- [ ] Bilingual parity (EN + DE) where the section is bilingual.
