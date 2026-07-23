import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';

export interface RelatedItem { title: string; href: string; kind: string; desc: string }

// Intelligent internal linking: rank other articles AND Verified reviews by how
// many tags they share with the current piece, then by recency. Cross-links
// reports ↔ analyses ↔ product reviews so every page feeds the next.
export async function getRelated(lang: Lang, entry: CollectionEntry<'articles'>, max = 4): Promise<RelatedItem[]> {
  const tags = new Set(entry.data.tags ?? []);
  if (tags.size === 0) return [];

  const arts = await getCollection('articles', (a) => a.data.lang === lang && a.data.urlSlug !== entry.data.urlSlug);
  const reviews = await getCollection('reviews', (r) => r.data.lang === lang && !r.data.draft);

  const cand = [
    ...arts.map((a) => ({
      title: a.data.title,
      href: `/${lang}/${a.data.format === 'report' || a.data.format === 'index' ? 'intelligence' : 'analysis'}/${a.data.urlSlug}`,
      kind: a.data.format === 'report' ? 'Report' : a.data.format === 'index' ? 'Index' : a.data.format === 'field-note' ? 'Field Note' : 'Analysis',
      desc: a.data.description,
      tags: a.data.tags ?? [],
      date: a.data.publishedAt.getTime(),
    })),
    ...reviews.map((r) => ({
      title: r.data.productName,
      href: `/${lang}/verified/${r.data.urlSlug}`,
      kind: 'Verified',
      desc: r.data.verdict,
      tags: r.data.tags ?? [],
      date: r.data.publishedAt.getTime(),
    })),
  ];

  return cand
    .map((c) => ({ ...c, score: c.tags.filter((t) => tags.has(t)).length }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.date - a.date)
    .slice(0, max)
    .map(({ title, href, kind, desc }) => ({ title, href, kind, desc }));
}
