import { defineCollection, z } from 'astro:content';

// Reader-facing lanes (2026-06): the 4 top-level content streams.
// The granular content type (founder-story, ai-automation, method, etc.) lives in
// the per-item `type` tag — see i18n/pillars.ts typeMeta. Lane = nav; type = sub-tag.
const pillar = z.enum(['move', 'build', 'gear', 'signal']);
const conversion = z.enum(['pods', 'sqwod-os', 'products', 'sqwod-ai', 'verified', 'list-growth']);
const lang = z.enum(['en', 'de']);

// Sqwod Verified review = a product node rendered. Score components per Sqwod Score spec.
const reviews = defineCollection({
  type: 'content',
  schema: z.object({
    urlSlug: z.string(),
    lang,
    counterpart: z.string().optional(), // the other language's slug (1:1 parity)
    title: z.string(),
    productName: z.string(),
    category: z.string(),
    glyph: z.enum(['ring', 'watch', 'band', 'tracker', 'massager', 'bed', 'supplement']).default('ring'),
    gallery: z.number().default(4), // how many gallery frames the quick-look shows
    pillar: pillar.default('gear'),
    type: z.string().default('tool-review'),  // granular sub-type (e.g. wearables, buyers-guide)
    conversion: conversion.default('verified'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.string().default('Sqwod Verified'),
    affiliate: z.boolean().default(true),
    draft: z.boolean().default(false), // unpublished — excluded from pages, /go, and related links until a real Sqwod Score is set
    verdict: z.string(),

    // --- The Sqwod Score ---
    sqwodScore: z.number().min(0).max(100),
    confidence: z.enum(['High', 'Medium', 'Low']),
    crowd: z.object({
      score: z.number(),
      reviews: z.number(),
      platforms: z.number(),
      sources: z.array(z.object({ name: z.string(), value: z.string(), url: z.string().optional() })),
    }),
    assessment: z.object({
      score: z.number(),
      criteria: z.array(z.object({ name: z.string(), score: z.number() })),
    }),
    value: z.object({
      score: z.number(),
      bestPrice: z.number(),
      currency: z.string().default('EUR'),
      low: z.number().optional(),
      subscription: z.string().optional(),
      history: z.array(z.number()).default([]),
    }),

    pros: z.array(z.string()),
    cons: z.array(z.string()),
    whoFor: z.object({ buy: z.string(), skip: z.string() }),

    // asset for the viewer fallback chain (see infrastructure/schemas/product-asset.schema.json)
    // images MUST be licensed: direct/network media first (Awin/Impact/CJ feeds, brand press kits); Amazon PA-API optional. Never scraped.
    asset: z.object({
      type: z.enum(['glb', 'spin360', 'images', 'fallback']).default('fallback'),
      glb: z.string().optional(),
      images: z.array(z.string()).default([]),
      credit: z.string().optional(),     // e.g. "Images via Amazon" (attribution for licensed photos)
    }).default({ type: 'fallback', images: [] }),
    amazonAsin: z.string().optional(),   // for the licensed-image pull (automation/assets.mjs)

    tags: z.array(z.string()).default([]),
  }),
});

// Editorial collections share the taxonomy; bodies are MDX/MD.
const articles = defineCollection({
  type: 'content',
  schema: z.object({
    urlSlug: z.string(),
    lang,
    counterpart: z.string().optional(),
    title: z.string(),
    description: z.string(),
    pillar,                              // lane: move | build | gear | signal
    type: z.string().default('analysis'), // granular sub-type (founder-story, ai-automation, method, market-data…)
    format: z.enum(['analysis', 'field-note', 'report', 'index', 'press']).default('analysis'),
    conversion,
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.string().default('sqwod.life'),
    gated: z.boolean().default(false),
    sourceIds: z.array(z.string()).default([]), // provenance → living wiki
    sources: z.array(z.object({ label: z.string(), url: z.string() })).default([]), // rendered citations
    // Accept a string OR a YAML-parsed date (an unquoted 2026-07-03 becomes a Date) and
    // normalise a Date to a clean ISO day — so a stray unquoted date never fails the build.
    asOf: z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).optional(),
    // Living-report extras (Sqwod Intelligence):
    takeaways: z.array(z.string()).default([]),   // TL;DR — the scannable, citable punchlines up top
    figures: z.array(z.object({ label: z.string(), value: z.string(), note: z.string().optional(), source: z.string().optional(), url: z.string().optional() })).default([]),
    // series.low/high are OPTIONAL estimate bands (firms disagree) — only render when present; never fabricated.
    series: z.object({ label: z.string(), unit: z.string().optional(), points: z.array(z.number()), years: z.array(z.string()).optional(), low: z.array(z.number()).optional(), high: z.array(z.number()).optional() }).optional(),
    playbook: z.array(z.object({ move: z.string(), why: z.string() })).default([]),  // "what this means for you" — operator actions
    // "Where do you stand" benchmark — reader compares their own number vs. sourced bands. Real data only.
    benchmark: z.object({
      label: z.string(),
      unit: z.string().default('%'),
      prompt: z.string().optional(),
      betterIsHigh: z.boolean().default(true),
      min: z.number().default(0),
      max: z.number().default(100),
      median: z.number().optional(),
      medianLabel: z.string().optional(),
      bands: z.array(z.object({ to: z.number(), label: z.string() })),
      source: z.string().optional(),
    }).optional(),
    changelog: z.array(z.object({ date: z.string(), note: z.string() })).default([]),
    // Optional "what's real vs. hype" verdict — powers the opinionated share card (1C).
    // Editorial ✓/✕ split; only rendered when authored. Keep rows short (they're a social card).
    verdict: z.object({
      title: z.string().optional(),                                   // e.g. "MAGNESIUM: WHAT'S REAL?" — defaults from article
      realLabel: z.string().optional(), hypeLabel: z.string().optional(),
      real: z.array(z.object({ value: z.string(), text: z.string() })).default([]),
      hype: z.array(z.object({ value: z.string(), text: z.string() })).default([]),
      note: z.string().optional(),                                    // footer-left, e.g. "Cochrane · BMC — see sources"
    }).optional(),
    // unique per-article animated hero (renders to GIF in production)
    hero: z.object({
      kind: z.enum(['line', 'bars', 'orbit', 'lattice']).default('line'),
      art: z.string().optional(),       // custom hand-drawn illustration, e.g. "/heroes/<slug>.svg" (in site/public/heroes/)
      stat: z.string().optional(),
      statLabel: z.string().optional(),
    }).optional(),
    tags: z.array(z.string()).default([]),
  }),
});

// Sqwod Daily — one issue/day/lang, compiled from cascade-generated items.
// Same pipeline powers the email and this on-site feed.
const daily = defineCollection({
  type: 'content',
  schema: z.object({
    urlSlug: z.string(),          // the issue date, e.g. "2026-06-17"
    lang,
    counterpart: z.string().optional(),
    date: z.coerce.date(),
    edition: z.string().default('Weekday'),
    title: z.string(),
    intro: z.string().optional(),
    summary: z.string().optional(),     // one-line episode headline for the list
    duration: z.string().optional(),    // e.g. "2:51"
    audioScript: z.string().optional(), // spoken-word brief written for the ear (NOT rendered on page) — drives TTS
    status: z.enum(['draft', 'review', 'published']).default('draft'),
    // Richer "teaching" newsletter sections (optional; degrade gracefully):
    connectDots: z.object({ title: z.string(), body: z.string(), image: z.string().optional(), credit: z.string().optional() }).optional(), // the synthesis lead w/ hero image
    moneyMoves: z.array(z.object({         // "Money Movement" — raises / acquisitions / valuations
      entity: z.string(),
      kind: z.enum(['raise', 'acquisition', 'valuation', 'ipo', 'shutdown']).default('raise'),
      amount: z.string().optional(),
      note: z.string().optional(),
      url: z.string().optional(),
    })).default([]),
    policyWatch: z.object({ title: z.string(), body: z.string(), url: z.string().optional() }).optional(),
    stat: z.object({ number: z.string(), label: z.string(), body: z.string().optional(), url: z.string().optional() }).optional(),
    recs: z.array(z.object({ label: z.string(), text: z.string(), url: z.string().optional(), affiliate: z.boolean().default(false) })).default([]), // curated actionable; >=1 affiliate
    play: z.object({ title: z.string(), prompt: z.string(), url: z.string().optional() }).optional(),
    move: z.object({                     // "Move of the Day" — a curated coach clip (link + credit, never re-hosted)
      url: z.string(),
      note: z.string().optional(),       // the client problem it solves / why it made the cut
      platform: z.string().optional(),   // Instagram | YouTube | TikTok | X
      handle: z.string().optional(),     // @coach credit
    }).optional(),
    meanwhile: z.string().optional(),    // entertainment / viral nugget
    meanwhileUrl: z.string().optional(),
    doThis: z.string().optional(),       // kept for back-compat
    sponsor: z.object({                 // daily-brief ad unit (web + email + audio read)
      name: z.string(),
      blurb: z.string().optional(),     // one-line ad copy
      url: z.string().optional(),       // click-through (tracked)
      cta: z.string().optional(),       // button label, e.g. "Try it free"
    }).optional(),
    items: z.array(z.object({
      headline: z.string(),
      dek: z.string(),
      pillar: z.string(),   // lane (new issues) — loose to keep historical issues valid
      conversion,
      sourceId: z.string().optional(),  // provenance → living wiki
      readMore: z.string().optional(),
      source: z.string().optional(),    // outlet name for the source link
      image: z.string().optional(),     // optional story image
    })),
  }),
});

// Press releases — third-party submitted content (free + premium tiers).
// Clearly labeled as company-submitted; NOT Sqwod editorial.
const press = defineCollection({
  type: 'content',
  schema: z.object({
    urlSlug: z.string(),
    lang,
    counterpart: z.string().optional(),
    company: z.string(),
    headline: z.string(),
    dek: z.string().optional(),
    tier: z.enum(['standard', 'premium']).default('standard'),
    status: z.enum(['submitted', 'approved', 'paid', 'published', 'rejected']).default('published'),
    submittedAt: z.coerce.date().optional(),
    publishedAt: z.coerce.date(),
    contactEmail: z.string().optional(),     // not rendered; provenance only
    companyUrl: z.string().optional(),
    logo: z.string().optional(),
    pillar: z.string().default('signal'),   // loose: keeps historical press valid
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    boilerplate: z.string().optional(),      // "About <company>"
    translated: z.boolean().default(false),  // machine-produced counterpart
  }),
});

// Corrections & Clarifications — the public "retractions" ledger, one entry per
// language. Filed by automation/corrections.mjs (by hand, or by the Intelligence
// refresh when it corrects an error) and rendered at /[lang]/corrections.
// A correction = we published something WRONG; a clarification = we sharpened a
// loosely-worded claim. Either way it's logged in public and emailed to the desk.
const corrections = defineCollection({
  type: 'content',
  schema: z.object({
    lang,
    date: z.coerce.date(),
    report: z.string(),               // slug of the corrected article/report
    reportTitle: z.string(),
    reportUrl: z.string(),
    kind: z.enum(['correction', 'clarification']).default('correction'),
    was: z.string(),                  // what we previously published
    now: z.string(),                  // what it says now
    reason: z.string(),               // why the original was wrong/loose
    source: z.string().optional(),    // named source for the corrected figure
    sourceUrl: z.string().optional(),
  }),
});

export const collections = { reviews, articles, daily, press, corrections };
