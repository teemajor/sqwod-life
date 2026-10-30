// Sqwod Tools (/[lang]/tools/): every free calculator and database in one list.
// The Tools page renders its cards from this array, in this order. A tool flips from
// "coming" to "live" by changing `status` (Jobs does it on its own: see jobsLive()).
// Live numbers are read on the page itself from the site's data files, never typed here.
import type { Lang } from '../i18n/ui';

export type ToolStatus = 'live' | 'coming';
type L10n = { en: string; de: string };

export interface Tool {
  slug: string;
  status: ToolStatus;
  name: L10n;
  type: L10n;           // shown in the tag: "Live · <type>" / "Coming · <type>"
  answers: L10n;        // one line: the question the tool answers
  href?: (lang: Lang) => string;
  cta?: L10n;
  enOnly?: boolean;     // the tool exists in English only (DE card says so and links to EN)
}

// The Tools nav item carries a small green "new" dot until this date (30 days after launch).
export const TOOLS_NEW_UNTIL = '2026-11-29';
export const toolsIsNew = (now = Date.now()) => now < Date.parse(TOOLS_NEW_UNTIL + 'T23:59:59Z');

export const TOOLS: Tool[] = [
  {
    slug: 'deal-tracker', status: 'live',
    name: { en: 'Deal Tracker', de: 'Deal Tracker' },
    type: { en: 'Database · updated daily', de: 'Datenbank · täglich aktualisiert' },
    answers: { en: 'Who raised, bought, listed or closed in fitness and wellness, with the source.', de: 'Wer in Fitness und Wellness Geld bekommen, gekauft, an die Börse gebracht oder geschlossen hat, mit Quelle.' },
    href: (lang) => `/${lang}/intelligence/deals/`,
    cta: { en: 'See the deals →', de: 'Deals ansehen →' },
  },
  {
    slug: 'pricing-index', status: 'live', enOnly: true,
    name: { en: 'Coach Pricing Index', de: 'Coach Pricing Index' },
    type: { en: 'Calculator · US', de: 'Rechner · nur auf Englisch · US' },
    answers: { en: 'What should I charge per session? Your floor rate in five steps, with trainer pay by state.', de: 'Was sollte ich pro Einheit verlangen? Dein Mindestpreis in fünf Schritten, mit Trainer-Gehältern nach US-Bundesstaat.' },
    href: () => '/en/intelligence/pricing-index/',
    cta: { en: 'Find your floor rate →', de: 'Mindestpreis berechnen →' },
  },
  {
    slug: 'studio-break-even', status: 'coming',
    name: { en: 'Studio Break-Even', de: 'Studio Break-Even' },
    type: { en: 'calculator', de: 'Rechner' },
    answers: { en: 'How many members does my studio need to cover rent, staff and loans?', de: 'Wie viele Mitglieder braucht mein Studio, um Miete, Personal und Kredite zu decken?' },
  },
  {
    slug: 'churn-cost', status: 'coming',
    name: { en: 'Churn Cost', de: 'Churn Cost' },
    type: { en: 'calculator', de: 'Rechner' },
    answers: { en: 'What does every cancelled membership cost me over a year?', de: 'Was kostet mich jede gekündigte Mitgliedschaft über ein Jahr?' },
  },
  {
    slug: 'market-numbers', status: 'coming',
    name: { en: 'Market Numbers', de: 'Marktzahlen' },
    type: { en: 'database · DACH', de: 'Datenbank · DACH' },
    answers: { en: 'How big is the fitness market in Germany, Austria and Switzerland, and who leads it?', de: 'Wie groß ist der Fitnessmarkt in Deutschland, Österreich und der Schweiz, und wer führt ihn an?' },
  },
  {
    slug: 'jobs', status: 'coming',
    name: { en: 'Sqwod Jobs', de: 'Sqwod Jobs' },
    type: { en: 'jobs · Germany', de: 'Jobs · Deutschland' },
    answers: { en: 'Who is hiring trainers, coaches and studio managers in Germany, and what do they pay?', de: 'Wer stellt in Deutschland Trainer:innen, Coaches und Studioleitungen ein, und was zahlen sie?' },
  },
];
