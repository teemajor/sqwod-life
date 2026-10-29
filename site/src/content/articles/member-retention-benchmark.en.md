---
urlSlug: member-retention-benchmark
lang: en
counterpart: member-retention-benchmark
title: "The Member Retention Benchmark 2026"
seoTitle: "Gym Member Retention Rate Benchmark 2026"
description: "The current industry anchor is 66.4% annual retention (HFA, 175 companies, 17,000+ facilities). Independent clubs have historically run higher. Enter your number and see where you stand. A living Sqwod Intelligence report."
pillar: signal
type: market-data
format: report
conversion: sqwod-os
publishedAt: 2026-06-28
updatedAt: 2026-10-28
asOf: Oct 2026
author: "Sqwod Intelligence"
gated: true
sources:
  - { label: "Health & Fitness Association (HFA): 2025 Fitness Industry Benchmarking Report (175 companies, 17,000+ facilities, 27 countries, surveyed Apr to Jun 2025)", url: "https://www.healthandfitness.org/hfa-releases-2025-fitness-industry-benchmarking-report/" }
  - { label: "IHRSA: 2019 Profiles of Success (98 club companies, 10,859 facilities, 2018 data)", url: "https://www.healthandfitness.org/ihrsa-releases-2019-profiles-of-success/" }
  - { label: "Sperandei et al. (2016), Journal of Science and Medicine in Sport: attrition among 5,240 members of one gym in Rio de Janeiro", url: "https://doi.org/10.1016/j.jsams.2015.12.522" }
  - { label: "Health Club Management: UK National Retention Report 2013 (342,759 memberships, joined 2009 to 2012)", url: "https://www.healthclubmanagement.co.uk/health-club-management-features/Attention-retention/28332" }
  - { label: "StudioPulse: Boutique fitness retention benchmarks 2026 (vendor estimate)", url: "https://getstudiopulse.com/blog/boutique-fitness-retention-rate" }
takeaways:
  - "The current anchor is 66.4% annual retention (HFA 2025). The previous published IHRSA figure was 69.3% (2018 data)."
  - "Independent clubs historically run higher: 75.8% vs 62.3% for chains (IHRSA 2019). A well-run studio should aim for 75%+."
  - "Early months carry the most risk: in one long-run gym study, 63% of new members stopped before month three. Fix onboarding before you discount."
figures:
  - { label: "Industry annual retention", value: "66.4%", note: "HFA 2025: 175 companies, 17,000+ facilities, 27 countries", source: "HFA 2025", url: "https://www.healthandfitness.org/hfa-releases-2025-fitness-industry-benchmarking-report/" }
  - { label: "Independent clubs vs chains", value: "75.8% vs 62.3%", note: "annual retention, 2018 data; overall 69.3%", source: "IHRSA 2019", url: "https://www.healthandfitness.org/ihrsa-releases-2019-profiles-of-success/" }
  - { label: "Stopped before month 3", value: "63%", note: "of new members at one gym in Rio de Janeiro, 2005 to 2014 (5,240 members)", source: "Sperandei et al. 2016", url: "https://doi.org/10.1016/j.jsams.2015.12.522" }
  - { label: "Still members after 12 months", value: "51.9%", note: "of 342,759 UK memberships joined 2009 to 2012", source: "UK National Retention Report 2013", url: "https://www.healthclubmanagement.co.uk/health-club-management-features/Attention-retention/28332" }
benchmark:
  label: "Your annual member retention"
  unit: "%"
  prompt: "Annual member retention = the share of members still active 12 months on. Enter yours to see where you land against the latest industry data."
  betterIsHigh: true
  min: 40
  max: 100
  median: 66.4
  medianLabel: "industry avg"
  bands:
    - { to: 60, label: "Needs work" }
    - { to: 66, label: "Below average" }
    - { to: 75, label: "Industry-solid" }
    - { to: 85, label: "Boutique-strong" }
    - { to: 100, label: "Top tier" }
  source: "HFA 2025 Fitness Industry Benchmarking Report; independent-club reference per IHRSA 2019 Profiles of Success; boutique tier is a vendor estimate (StudioPulse 2026)."
playbook:
  - { move: "Benchmark against 66.4%, and know how you measure it.", why: "HFA does not publish its exact formula. Compare like with like: members active at month 12 divided by members at month 0." }
  - { move: "Instrument the first 90 days.", why: "Dropout is front-loaded: 63% of new members stopped before month three in one 9-year gym study. Structured onboarding beats any win-back discount." }
  - { move: "If you run an independent studio, set the bar at 75%+.", why: "Independents averaged 75.8% in IHRSA's last published split. Industry-average is not the goal for boutique." }
changelog:
  - { date: "28 Jun 2026", note: "First publish: adopts the HFA 2025 66.4% anchor." }
  - { date: "28 Oct 2026", note: "Correction: the first version called 71.4% an IHRSA 2016 figure. We could not trace that number to a published IHRSA report, so we removed it and now cite IHRSA's 2019 published figures (69.3% overall, 75.8% independents). We also replaced an unsourced 'first 90 days' claim with two named studies." }
hero:
  kind: bars
  stat: "66.4%"
  statLabel: "industry retention · 2026"
tags: ["retention", "market-data", "studios"]
---

The current industry anchor is **66.4% annual member retention**, from the Health & Fitness Association's 2025 benchmarking report: 175 companies, more than 17,000 facilities, 27 countries, surveyed April to June 2025. That is the number to measure yourself against.

For context, IHRSA's last published *Profiles of Success* (2019, built on 2018 data) put overall retention at **69.3%**, with a sharp split: **independent clubs 75.8%, chains 62.3%**. You will also see "71.4%" quoted on vendor blogs as an IHRSA figure. We could not trace it to a published IHRSA report, so we don't use it.

Use the tool above to place yourself. Then the only number that matters is the one you set for next quarter.

### Why this matters for operators

Retention is mostly an onboarding problem. The best long-run data we have points at the early months: in a study of 5,240 members at one gym in Rio de Janeiro, **63% of new members stopped before their third month**. In the UK's 2013 National Retention Report, covering 342,759 memberships, only **51.9%** were still members after 12 months. Different countries, different decades, same shape: most of the loss happens early.

That is good news. The lever is early, structured and cheap compared with replacing members. Win-back discounts treat the symptom; a deliberate first 90 days fixes the cause.

Independent studios should hold themselves to a higher line. **75%+** is a defensible target, in line with IHRSA's independent-club average, and it is where pricing power and referrals actually come from.

*This is a living Sqwod Intelligence report. We refresh the anchor as new HFA and industry data lands (see the update log).*
