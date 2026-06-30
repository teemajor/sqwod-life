import { type Lang } from './ui';

// Pillar values that may appear in content frontmatter (incl. legacy `gear`,
// still used internally by Sqwod Verified reviews). Keep all four for typing/meta.
export const PILLARS = ['move', 'build', 'gear', 'signal'] as const;
export type Pillar = (typeof PILLARS)[number];

// Reader-facing LANES that actually render in nav/hub/routes (2026-06). `gear`
// is folded into Sqwod Verified — that IS the gear/buying destination — so it's
// no longer a separate lane. Re-add 'gear' here to bring the lane back.
export const LANES = ['move', 'build', 'signal'] as const;

export const pillarMeta: Record<Pillar, {
  label: Record<Lang, string>;
  desc: Record<Lang, string>;
  routesTo: string;
}> = {
  move: {
    label: { en: 'Move', de: 'Move' },
    desc: { en: 'Technique, programming, recovery — solve the body problem.', de: 'Technik, Programming, Recovery — löse das Körperproblem.' },
    routesTo: 'Sqwod products · Sqwod AI',
  },
  build: {
    label: { en: 'Build', de: 'Build' },
    desc: { en: 'Clients, retention, pricing, ops, founder stories, AI workflows — grow the business.', de: 'Kunden, Bindung, Preise, Betrieb, Gründer-Stories, KI-Workflows — bau das Business.' },
    routesTo: 'Sqwod Pods · Sqwod OS',
  },
  gear: {
    label: { en: 'Gear', de: 'Gear' },
    desc: { en: 'What to buy and why — wearables, apps, tools, buyer’s guides.', de: 'Was kaufen — und warum. Wearables, Apps, Tools, Kaufberatung.' },
    routesTo: 'Sqwod Verified · Deals',
  },
  signal: {
    label: { en: 'Signal', de: 'Signal' },
    desc: { en: 'Market data, trends, wellness culture, policy — the intelligence layer.', de: 'Marktdaten, Trends, Wellness-Kultur, Politik — die Intelligence-Ebene.' },
    routesTo: 'Intelligence · Ventures',
  },
};

// Animated content thumbnail per lane (Glyph-supported kinds).
export function pillarGlyph(pillar: string): string {
  switch (pillar) {
    case 'move': return 'seed';
    case 'build': return 'line';
    case 'gear': return 'ring';
    case 'signal': return 'bars';
    default: return 'seed';
  }
}

// Granular sub-type labels (the content types nested under each lane). Falls back
// to a title-cased slug for any type not listed, so nothing ever renders raw.
const typeMeta: Record<string, Record<Lang, string>> = {
  'analysis': { en: 'Analysis', de: 'Analyse' },
  'coaching-business': { en: 'Coaching & Studio Business', de: 'Coaching & Studio-Business' },
  'marketing': { en: 'Marketing & Visibility', de: 'Marketing & Sichtbarkeit' },
  'founder-story': { en: 'Founder Story', de: 'Gründer-Story' },
  'case-study': { en: 'Case Study', de: 'Case Study' },
  'ai-automation': { en: 'AI & Automation', de: 'KI & Automatisierung' },
  'method': { en: 'Method & Programming', de: 'Methode & Programming' },
  'programming': { en: 'Programming', de: 'Programming' },
  'recovery': { en: 'Recovery & Mobility', de: 'Recovery & Mobilität' },
  'technique': { en: 'Technique', de: 'Technik' },
  'wearables': { en: 'Wearables & Tech', de: 'Wearables & Tech' },
  'buyers-guide': { en: 'Buyer’s Guide', de: 'Kaufberatung' },
  'tool-review': { en: 'Tool Review', de: 'Tool-Test' },
  'market-data': { en: 'Market Data', de: 'Marktdaten' },
  'trends': { en: 'Trends & Culture', de: 'Trends & Kultur' },
  'policy': { en: 'Policy Watch', de: 'Politik-Radar' },
};
export function typeLabel(type: string | undefined, lang: Lang): string {
  if (!type) return '';
  const m = typeMeta[type];
  if (m) return m[lang];
  return type.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
