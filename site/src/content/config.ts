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
    glyph: z.enum(['ring', 'watch', 'band', 'tracker']).default('ring'),
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
      sources: z.array(z.object({ name: z.string(), value: z.string() })),
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
    asset: z.object({
      type: z.enum(['glb', 'spin360', 'images', 'fallback']).default('fallback'),
      glb: z.string().optional(),
      images: z.array(z.string()).default([]),
    }).default({ type: 'fallback', images: [] }),

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
    sponsor: z.string().optional(),     // daily-brief ad attribution
    items: z.array(z.object({
      headline: z.string(),
      dek: z.string(),
      pillar,
      conversion,
      sourceId: z.string().optional(),  // provenance → living wiki
      readMore: z.string().optional(),
    })),
  }),
});

export const collections = { reviews, articles, daily };
