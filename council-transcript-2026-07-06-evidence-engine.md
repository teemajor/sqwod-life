# LLM Council Transcript — sqwod.life "Research Evidence Engine"

**Date:** 2026-07-06
**Counciled by:** Tee (founder, sqwod.life)

---

## Original Question

"Should I use PubMed, Consensus, and ClinicalTrials.gov connectors to aggregate research on one topic and craft comprehensively-cited, on-brand articles with graphs, charts, facts, and answers to the most-asked questions — the best-sourced article out there on topics my audience wants to read? What do you think? Help me decide."

## Framed Question

Should Tee, a solo founder, build an automated "research evidence engine" (PubMed + Consensus + ClinicalTrials.gov) to produce comprehensively-cited wellness articles (creatine, ashwagandha, zone 2, magnesium, cold exposure) for sqwod.life — a bilingual DE/EN wellness media brand serving coaches / trainers / studio owners, top-of-funnel for a Sqwod Pods / products / AI ecosystem — given an existing weekly DE/EN SEO blog agent, an entrenched incumbent (Examine.com), and German health-claim liability (HWG/UWG)? Sub-questions: new engine vs. upgrade existing agent; reader = coach vs. consumer; autonomous vs. human-in-the-loop.

---

## Advisor Responses

### The Contrarian (anonymized as Response C)
This idea will die the way most solo-founder "moat" plays die: by mistaking effort for differentiation. Examine's moat isn't ranking — it's a 15-year trust asset with named PhD reviewers, visible methodology, version history, and a business model that funds obsessive accuracy because accuracy IS the product. Tee's pipeline can match citation *density* but not citation *credibility*; a reader who cross-references notices "curated by our science team" vs. "PubMed API pull summarized by an LLM." That gap is the whole moat and isn't closable with better prompting. The liability math doesn't pencil: HWG/UWG enforcement includes competitor Abmahnung lawsuits — cheap to file, expensive to defend. One automated "reduces cortisol by X%" from a small trial and Tee is a defendant with no legal team. The unasked question: what's this FOR? Coaches don't need the best-sourced article on creatine — Examine gave them that free. They need synthesis-to-action. The real idea buried here: "translate and localize Examine-tier evidence for German coaches with an accountable human byline" — a research-assistant tool feeding a human writer, not an autonomous publisher.

### The First Principles Thinker (anonymized as Response D)
You're solving the wrong problem. The question presupposes the bottleneck is content production. It isn't — the bottleneck is that Examine already spent 15 years converting aggregation into trust, and trust isn't automatable faster than the incumbent already banked it. Strip it down: (1) sqwod.life is a top-of-funnel hub that cascades into Pods/products/AI — its job is to move a coach down a funnel, not be the encyclopedia of record. (2) "Best-sourced article" buys nothing if it ranks page 3 behind Examine. (3) The real differentiated asset is Tee — a person with a POV, rebel voice, and a business (Pods) Examine doesn't have. Examine is deliberately neutral and faceless — that's its strength AND its ceiling; it will never say "here's what this means for how you program your gym." Reframe: don't build a science-aggregation engine, build a translation layer — take existing synthesis as input, produce the coach-facing implication. Fraction of the liability surface. The question isn't build vs. upgrade — it's "encyclopedia or interpreter?" Pick interpreter.

### The Expansionist (anonymized as Response A)
Nobody's asking the right question: what if the engine isn't the product — the proprietary *dataset* is? Examine is 15 years of PDF-locked, human-curated summaries — a moat built for 2010. What they DON'T have: a live, queryable, bilingual DE/EN knowledge graph that auto-refreshes when new trials drop, cross-references ClinicalTrials.gov's live pipeline (what's *about* to be proven), and feeds a coach's workflow. Once built, it's infrastructure: (1) powers Sqwod AI as an in-session assistant, (2) a licensable API/data feed to other fitness media/supplement brands, (3) an "evidence-graded" badge/certification for Pod trainers and supplement brands seeking affiliate placement — flip liability into revenue: brands pay to be evaluated. (4) The DE-market wedge is wide open — Examine has zero German-native authority, and German claims law rewards rigor. Build the evidence layer once, monetize five ways, let the article be the free trailer for the dataset and trust position nobody in DACH has built.

### The Outsider (anonymized as Response E)
Total outsider — never heard of Fitt Insider, Examine, HWG, or sqwod.life. What jumps out: the plan describes a "research evidence engine" like a technical feature, but it's actually proposing that one person's automated software becomes the thing German and English readers trust to tell them whether a supplement is safe. Strange thing to automate first and worry about later. The tell: the goal is "best-sourced article" — a content-quality goal. But the actual product is a *trust* product. Nobody reads a creatine article for citations; they read it to know if it's safe. If citation-generation is automated and trust-verification isn't, you've built a convincing system for producing confidently-wrong things — worse than producing obviously-uncertain things. Second: "Examine dominates" reads like a moat problem, but from outside it's a gift — the opportunity isn't out-citing Examine, it's doing what Examine structurally can't: bilingual, creator-voice, tied to a real PT community that road-tests advice. Differentiation through relationship, not database size. Third: nobody parses "draft-for-approval" as safety unless a named human is accountable for each claim before it's public. Right now that's a vague promise, not a control.

### The Executor (anonymized as Response B)
Don't build it. Not this quarter, not solo. Monday morning: Tee has three connectors and a working DE/EN blog agent that publishes weekly with draft-for-approval. The fastest path to value is not a fourth pipeline — it's adding a "sourcing pass" to the existing agent: when a topic touches a health claim, query the three tools, pull 5–10 citations, insert them into the article it already produces. That's a config change, not a new system. Examine's moat isn't the API calls — anyone can hit PubMed. It's 15 years of PhD reviewers who stake their name on interpretation. Tee solo cannot out-review that. An automated pipeline generating "comprehensively cited" claims without expert review is a liability generator with extra steps; under HWG/UWG a wrong claim from an "AI research engine" brand promise is worse than from a normal blog. Test: can Tee name the human who reviews every health claim before it ships this week? If no, there's no build, just risk. First step: pick the next scheduled topic, manually run it through Consensus + PubMed, draft one article with real citations, review, publish. Do it four times before writing pipeline code.

---

## Peer Review Round (anonymization revealed: A=Expansionist, B=Executor, C=Contrarian, D=First Principles, E=Outsider)

**Reviewer 1:** Strongest = B (only one with a falsifiable test + concrete action; reframes as build-vs-augment). Biggest blind spot = A (never touches HWG/UWG; "brands pay to be evaluated" increases regulatory + conflict-of-interest exposure). All missed: the *cost* of the review bottleneck (hours/article, who reviews, impact on weekly cadence), and that citations need conflict-of-interest + study-quality weighting — an ungraded citation dump is worse than Examine's curated one.

**Reviewer 2:** Strongest = B (executable next action tied to existing infra + falsifiable go/no-go gate). Biggest blind spot = A (treats data/API/certification as solo-achievable; pay-to-play badge stacks a second liability line). All missed: nobody priced the actual downside — what an Abmahnung costs in euros/time, what legal review requires operationally (which professional, what insurance, per-article cost).

**Reviewer 3:** Strongest = B (concrete sequenced action this week; accountability test is the sharpest operational filter). Biggest blind spot = A (compelling vision, zero feasibility/liability engagement). All missed: what "review" actually requires operationally; using the existing draft-for-approval step as the enforcement mechanism; translation-fidelity risk — DE claims can't be literal translations of EN evidence without hitting different HWG thresholds.

**Reviewer 4:** Strongest = D (reframes the real decision variable — sqwod's job in the funnel — and lands on a concrete lower-liability alternative). Biggest blind spot = A (badge/certification compounds HWG/UWG exposure). All missed: is the *existing* weekly agent already making unsourced claims today (risk exists now regardless)? EU AI Act implications for automated health content; the option of licensing/partnering with Examine's data rather than out-building it.

**Reviewer 5:** Strongest = B (only executable next step; sharpest liability test). Biggest blind spot = A (ignores the core legal constraint; 5-way monetization contradicts the solo constraint). All missed: the existing agent's current output likely already carries this risk — if HWG/UWG risk is real, it's live now, engine or not. Also: nobody proposed verifying German legal exposure with an actual lawyer / real Abmahnung cases rather than reasoning from priors.

---

## Chairman Synthesis

See COUNCIL VERDICT in the HTML report and the chat summary.
