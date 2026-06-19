import { type Lang } from './ui';

// Articles taxonomy (2026-06-19). Built for coaches, founders & investors.
export const PILLARS = [
  'business-strategy',
  'marketing-visibility',
  'operations-technology',
  'industry-trends',
  'founder-stories',
  'ai-automation',
] as const;
export type Pillar = (typeof PILLARS)[number];

export const pillarMeta: Record<Pillar, {
  label: Record<Lang, string>;
  desc: Record<Lang, string>;
  routesTo: string;
}> = {
  'business-strategy': {
    label: { en: 'Business Strategy & Scaling', de: 'Business-Strategie & Skalierung' },
    desc: { en: 'Profit models, pricing, expansion, hiring, SOPs — solo coach to multi-location.', de: 'Profitmodelle, Pricing, Expansion, Hiring, SOPs — vom Solo-Coach zum Multi-Standort.' },
    routesTo: 'Sqwod Pods · Sqwod OS',
  },
  'marketing-visibility': {
    label: { en: 'Marketing & Visibility', de: 'Marketing & Sichtbarkeit' },
    desc: { en: 'Client acquisition funnels, social, email, partnerships, PR — without burning out.', de: 'Akquise-Funnels, Social, E-Mail, Partnerschaften, PR — ohne auszubrennen.' },
    routesTo: 'Sqwod OS',
  },
  'operations-technology': {
    label: { en: 'Operations & Technology', de: 'Betrieb & Technologie' },
    desc: { en: 'Booking platforms, automation workflows, smart locks, API integrations.', de: 'Buchungsplattformen, Automatisierung, Smart Locks, API-Integrationen.' },
    routesTo: 'Sqwod OS · Sqwod AI',
  },
  'industry-trends': {
    label: { en: 'Industry Trends & Investment', de: 'Branchentrends & Investment' },
    desc: { en: 'Market size, sector breakdowns, Berlin insights, M&A — what investors track.', de: 'Marktgröße, Sektor-Analysen, Berlin-Insights, M&A — was Investoren verfolgen.' },
    routesTo: 'Intelligence · Ventures',
  },
  'founder-stories': {
    label: { en: 'Founder Stories & Case Studies', de: 'Gründer-Stories & Case Studies' },
    desc: { en: 'Coach-to-founder journeys, scaling stories, revenue breakdowns, lessons from failure.', de: 'Coach-zu-Gründer-Wege, Skalierungs-Stories, Umsatz-Breakdowns, Lehren aus dem Scheitern.' },
    routesTo: 'Sqwod Pods',
  },
  'ai-automation': {
    label: { en: 'AI & Automation', de: 'KI & Automatisierung' },
    desc: { en: 'Prompts, playbooks and actionable how-tos to put AI to work in your practice.', de: 'Prompts, Playbooks und umsetzbare How-tos, um KI in deiner Praxis einzusetzen.' },
    routesTo: 'Sqwod AI',
  },
};

// Topical glyph (animated content thumbnail) per pillar — Glyph-supported kinds.
export function pillarGlyph(pillar: string): string {
  switch (pillar) {
    case 'business-strategy': return 'line';
    case 'marketing-visibility': return 'bars';
    case 'operations-technology': return 'ring';
    case 'industry-trends': return 'bars';
    case 'founder-stories': return 'seed';
    case 'ai-automation': return 'ring';
    default: return 'seed';
  }
}
