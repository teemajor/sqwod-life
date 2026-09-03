// Loads every candidate the weekly social run can choose from, normalised to one shape.
//
// Streams:
//   verified — Sqwod Verified reviews (score card)
//   intel    — articles with format: analysis | field-note | index
//   report   — articles with format: report (Statista-backed flagships)
//   daily    — Sqwod Daily issues (the week's stat/hook)
//   pod      — Sqwod Pod Journal posts, pulled from the public Shopify Atom feed
//
// Every candidate carries what a card needs to render without going back to disk.

import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, scalar, num, bool, nested, list, flowMaps } from './lib/frontmatter.mjs';

const CONTENT = (root) => path.join(root, 'site', 'src', 'content');

const readAll = (dir, lang) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(`.${lang}.md`) || f.endsWith(`.${lang}.mdx`))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      return { file: f, ...splitFrontmatter(raw) };
    });
};

const iso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const firstSentence = (s, max = 190) => {
  if (!s) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  const cut = t.match(/^(.{40,}?[.!?])(\s|$)/);
  const out = cut ? cut[1] : t;
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out;
};

export function loadVerified(root, { lang = 'en', site }) {
  return readAll(path.join(CONTENT(root), 'reviews'), lang)
    .filter(({ fm }) => bool(fm, 'draft') !== true)
    .map(({ fm }) => {
      const slug = scalar(fm, 'urlSlug');
      const score = num(fm, 'sqwodScore');
      if (!slug || score === undefined) return null;
      const priceType = nested(fm, 'value', 'priceType') || 'oneoff';
      const price = nested(fm, 'value', 'bestPrice');
      const currency = nested(fm, 'value', 'currency') || 'EUR';
      const cadence = priceType === 'monthly' ? '/mo' : priceType === 'yearly' ? '/yr' : '';
      return {
        id: `verified:${slug}`,
        stream: 'verified',
        kicker: 'SQWOD VERIFIED',
        title: scalar(fm, 'productName') || scalar(fm, 'title'),
        subtitle: scalar(fm, 'category'),
        headline: firstSentence(scalar(fm, 'verdict')),
        score: { value: Math.round(score), confidence: scalar(fm, 'confidence') || 'Medium' },
        price: price ? `${currency === 'EUR' ? '€' : currency + ' '}${price}${cadence}` : null,
        testStatus: scalar(fm, 'testStatus') || 'desk-researched',
        pros: list(fm, 'pros').slice(0, 3),
        cons: list(fm, 'cons').slice(0, 2),
        affiliate: bool(fm, 'affiliate') !== false,
        date: iso(scalar(fm, 'updatedAt') || scalar(fm, 'publishedAt')),
        url: `${site}/${lang}/verified/${slug}`,
      };
    })
    .filter(Boolean);
}

export function loadArticles(root, { lang = 'en', site }) {
  return readAll(path.join(CONTENT(root), 'articles'), lang)
    .map(({ fm }) => {
      const slug = scalar(fm, 'urlSlug');
      if (!slug) return null;
      const format = scalar(fm, 'format') || 'analysis';
      const figures = flowMaps(fm, 'figures');
      const takeaways = list(fm, 'takeaways');
      const fig = figures[0];
      return {
        id: `${format === 'report' ? 'report' : 'intel'}:${slug}`,
        stream: format === 'report' ? 'report' : 'intel',
        kicker: (scalar(fm, 'pillar') || 'signal').toUpperCase(),
        title: scalar(fm, 'title'),
        subtitle: format === 'report' ? 'SQWOD REPORT' : null,
        headline: firstSentence(takeaways[0] || scalar(fm, 'description')),
        stat: fig ? { value: fig.value, label: fig.label, note: fig.note || null } : null,
        figures: figures.slice(0, 6).map((f) => ({ value: f.value, label: f.label })),
        takeaways: takeaways.slice(0, 3),
        gated: bool(fm, 'gated') === true,
        date: iso(scalar(fm, 'publishedAt')),
        url: `${site}/${lang}/${format === 'report' ? 'reports' : 'articles'}/${slug}`,
      };
    })
    .filter((c) => c && c.title);
}

export function loadDaily(root, { lang = 'en', site, days = 10 }) {
  const cutoff = Date.now() - days * 864e5;
  return readAll(path.join(CONTENT(root), 'daily'), lang)
    .map(({ fm }) => {
      const slug = scalar(fm, 'urlSlug');
      const status = scalar(fm, 'status');
      if (!slug || status !== 'published') return null;
      const number = nested(fm, 'stat', 'number');
      const label = nested(fm, 'stat', 'label');
      if (!number) return null;
      return {
        id: `daily:${slug}`,
        stream: 'daily',
        kicker: 'SQWOD DAILY',
        title: scalar(fm, 'summary') || scalar(fm, 'title'),
        subtitle: slug,
        headline: firstSentence(scalar(fm, 'intro')),
        stat: { value: number, label, note: nested(fm, 'stat', 'body') || null },
        doThis: scalar(fm, 'doThis') || null,
        date: iso(scalar(fm, 'date') || slug),
        url: `${site}/${lang}/daily/${slug}`,
      };
    })
    .filter((c) => c && c.date && new Date(c.date).getTime() >= cutoff);
}

// Sqwod Pod Journal — public Atom feed, no auth needed from the runner.
export async function loadPod({ feed, limit = 12 }) {
  try {
    const res = await fetch(feed, { headers: { 'user-agent': 'sqwod-social/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.split(/<entry[\s>]/).slice(1, limit + 1);
    return entries
      .map((e) => {
        const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
        const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1];
        const date = (e.match(/<(?:published|updated)>([^<]+)<\/(?:published|updated)>/) || [])[1];
        const summary = (e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1];
        if (!title || !link) return null;
        const clean = (s) =>
          String(s || '')
            .replace(/<!\[CDATA\[|\]\]>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
        return {
          id: `pod:${link.split('/').pop()}`,
          stream: 'pod',
          kicker: 'THE SQWOD JOURNAL',
          title: clean(title),
          subtitle: 'Sqwod Pod',
          headline: firstSentence(clean(summary)),
          date: iso(date),
          url: link.split('?')[0],
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadAll(root, cfg) {
  const opts = { lang: cfg.lang, site: cfg.site };
  const [pod] = await Promise.all([loadPod({ feed: cfg.podFeed })]);
  return [
    ...loadVerified(root, opts),
    ...loadArticles(root, opts),
    ...loadDaily(root, { ...opts, days: cfg.dailyWindowDays ?? 10 }),
    ...pod,
  ];
}
