import { type Lang } from '../i18n/ui';

// Topic chips (27 Oct 2026). Replaces the Move / Build / Signal lanes as the way
// readers browse. Nav is format-led (Daily, Articles, Evidence, Reports, Verified);
// topics live INSIDE a section. Every article carries one `topic` slug in its
// frontmatter. Articles topics get their own page at /[lang]/articles/<slug>;
// Evidence topics group the Evidence index. Reports have no topic chips.

export type Section = 'articles' | 'evidence';

export const TOPICS: Record<string, { section: Section; label: Record<Lang, string>; desc: Record<Lang, string> }> = {
  // ---- Articles
  retention: {
    section: 'articles',
    label: { en: 'Retention', de: 'Mitgliederbindung' },
    desc: { en: 'Churn, win-back and keeping members past the first 90 days.', de: 'Kündigungen, Rückgewinnung und Mitglieder über die ersten 90 Tage hinaus halten.' },
  },
  'pricing-revenue': {
    section: 'articles',
    label: { en: 'Pricing & Revenue', de: 'Preise & Umsatz' },
    desc: { en: 'Membership pricing, premium tiers and new revenue lines.', de: 'Mitgliedspreise, Premium-Stufen und neue Umsatzquellen.' },
  },
  'marketing-community': {
    section: 'articles',
    label: { en: 'Marketing & Community', de: 'Marketing & Community' },
    desc: { en: 'Brand, reputation and turning members into your best channel.', de: 'Marke, Ruf und Mitglieder als bester Kanal.' },
  },
  'offer-programming': {
    section: 'articles',
    label: { en: 'Offer & Programming', de: 'Angebot & Programm' },
    desc: { en: 'What studios sell: training formats, recovery and assessments.', de: 'Was Studios verkaufen: Trainingsformate, Recovery und Analysen.' },
  },
  'ai-tools': {
    section: 'articles',
    label: { en: 'AI & Tools', de: 'KI & Tools' },
    desc: { en: 'Software, booking and AI that change how studios run.', de: 'Software, Buchung und KI, die den Studiobetrieb verändern.' },
  },
  strategy: {
    section: 'articles',
    label: { en: 'Strategy', de: 'Strategie' },
    desc: { en: 'Positioning, growth and who to serve.', de: 'Positionierung, Wachstum und Zielgruppe.' },
  },
  'market-moves': {
    section: 'articles',
    label: { en: 'Market Moves', de: 'Marktbewegungen' },
    desc: { en: 'Funding, deals, openings and closures across fitness and wellness.', de: 'Finanzierungen, Deals, Eröffnungen und Schließungen in Fitness und Wellness.' },
  },
  dach: {
    section: 'articles',
    label: { en: 'DACH', de: 'DACH' },
    desc: { en: 'The German-speaking fitness market.', de: 'Der deutschsprachige Fitnessmarkt.' },
  },
  // ---- Evidence
  supplements: {
    section: 'evidence',
    label: { en: 'Supplements', de: 'Supplements' },
    desc: { en: 'What works, for whom, and what to skip.', de: 'Was wirkt, für wen, und was du weglassen kannst.' },
  },
  training: {
    section: 'evidence',
    label: { en: 'Training', de: 'Training' },
    desc: { en: 'Methods and programming, graded by the research.', de: 'Methoden und Programmgestaltung, nach Studienlage bewertet.' },
  },
  'nutrition-metabolism': {
    section: 'evidence',
    label: { en: 'Nutrition & Metabolism', de: 'Ernährung & Stoffwechsel' },
    desc: { en: 'Protein, fats and weight-loss drugs.', de: 'Protein, Fette und Abnehmspritzen.' },
  },
  'recovery-sleep': {
    section: 'evidence',
    label: { en: 'Recovery & Sleep', de: 'Recovery & Schlaf' },
    desc: { en: 'Cold, heat and sleep.', de: 'Kälte, Wärme und Schlaf.' },
  },
  'wearables-devices': {
    section: 'evidence',
    label: { en: 'Wearables & Devices', de: 'Wearables & Geräte' },
    desc: { en: 'Trackers and devices: what the measurements are worth.', de: 'Tracker und Geräte: Was die Messwerte taugen.' },
  },
};

export const ARTICLE_TOPICS = Object.keys(TOPICS).filter((k) => TOPICS[k].section === 'articles');
export const EVIDENCE_TOPICS = Object.keys(TOPICS).filter((k) => TOPICS[k].section === 'evidence');
export const topicLabel = (slug: string | undefined, lang: Lang) => (slug && TOPICS[slug] ? TOPICS[slug].label[lang] : '');

// Old lane pages → where their readers should land now (redirect stubs).
export const LEGACY_LANES: Record<string, string> = { move: '', build: '', signal: 'market-moves' };
