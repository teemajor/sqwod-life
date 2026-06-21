import { defineCollection, z } from 'astro:content';

// Shared taxonomy (Phase 3): every content object is tagged on 4 axes.
const pillar = z.enum([
  'business-strategy',
  'marketing-visibility',
  'operations-technology',
  'industry-trends',
  'founder-stories',
  'ai-automation',
]);
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
    pillar: pillar.default('operations-technology'),
    conversion: conversion.default('verified'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.string().default('Sqwod Verified'),
    affiliate: z.boolean().default(true),
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
    pillar,
    format: z.enum(['analysis', 'field-note', 'report', 'index', 'press']).default('analysis'),
    conversion,
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.string().default('sqwod.life'),
    gated: z.boolean().default(false),
    sourceIds: z.array(z.string()).default([]), // provenance → living wiki
    // unique per-article animated hero (renders to GIF in production)
    hero: z.object({
      kind: z.enum(['line', 'bars', 'orbit']).default('line'),
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
      pillar,
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
    pillar: pillar.default('industry-trends'),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    boilerplate: z.string().optional(),      // "About <company>"
    translated: z.boolean().default(false),  // machine-produced counterpart
  }),
});

export const collections = { reviews, articles, daily, press };
