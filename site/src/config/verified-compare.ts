// Sqwod Verified — side-by-side comparison spec rows.
// Kept here (not in the review frontmatter) so the comparison table stays a pure,
// build-safe config: each row is a normalized attribute with a value per reviewed
// product (by reviewSlug). The table pulls the Sqwod Score + price live from the
// reviews collection; these rows add the comparable feature specs.
//
// Facts are stable published specs — keep them accurate + dated in the review body.
import type { Lang } from '../i18n/ui';

export interface CompareRow {
  label: Record<Lang, string>;
  values: Record<string, Record<Lang, string>>; // reviewSlug → { en, de }
}

const compareBy: Record<string, CompareRow[]> = {
  wearables: [
    { label: { en: 'Form factor', de: 'Bauform' }, values: {
      'oura-ring-gen3':        { en: 'Ring', de: 'Ring' },
      'whoop-4':               { en: 'Band (screenless)', de: 'Band (ohne Display)' },
      'apple-watch-9':         { en: 'Watch', de: 'Uhr' },
      'garmin-forerunner-165': { en: 'Watch (running)', de: 'Uhr (Running)' },
      'fitbit-charge-6':       { en: 'Band', de: 'Band' },
    } },
    { label: { en: 'Battery life', de: 'Akkulaufzeit' }, values: {
      'oura-ring-gen3':        { en: '~7 days', de: '~7 Tage' },
      'whoop-4':               { en: '~5 days', de: '~5 Tage' },
      'apple-watch-9':         { en: '~18 h (36 h low-power)', de: '~18 Std. (36 Std. Sparmodus)' },
      'garmin-forerunner-165': { en: '~11 days', de: '~11 Tage' },
      'fitbit-charge-6':       { en: '~7 days', de: '~7 Tage' },
    } },
    { label: { en: 'Screen', de: 'Display' }, values: {
      'oura-ring-gen3':        { en: 'None', de: 'Keins' },
      'whoop-4':               { en: 'None', de: 'Keins' },
      'apple-watch-9':         { en: 'Always-on OLED', de: 'Always-on-OLED' },
      'garmin-forerunner-165': { en: 'AMOLED', de: 'AMOLED' },
      'fitbit-charge-6':       { en: 'AMOLED', de: 'AMOLED' },
    } },
    { label: { en: 'Sleep tracking', de: 'Schlaf-Tracking' }, values: {
      'oura-ring-gen3':        { en: 'Best-in-class', de: 'Spitzenklasse' },
      'whoop-4':               { en: 'Detailed', de: 'Detailliert' },
      'apple-watch-9':         { en: 'Basic', de: 'Einfach' },
      'garmin-forerunner-165': { en: 'Yes', de: 'Ja' },
      'fitbit-charge-6':       { en: 'Yes', de: 'Ja' },
    } },
    { label: { en: 'Recovery / HRV', de: 'Recovery / HRV' }, values: {
      'oura-ring-gen3':        { en: 'Readiness score', de: 'Readiness-Score' },
      'whoop-4':               { en: 'Strain + Recovery', de: 'Strain + Recovery' },
      'apple-watch-9':         { en: 'HRV metrics', de: 'HRV-Werte' },
      'garmin-forerunner-165': { en: 'Body Battery', de: 'Body Battery' },
      'fitbit-charge-6':       { en: 'Daily Readiness (Premium)', de: 'Daily Readiness (Premium)' },
    } },
    { label: { en: 'Subscription', de: 'Abo' }, values: {
      'oura-ring-gen3':        { en: 'Required (~€6/mo)', de: 'Nötig (~6 €/Mon.)' },
      'whoop-4':               { en: 'Required (membership)', de: 'Nötig (Mitgliedschaft)' },
      'apple-watch-9':         { en: 'None (Fitness+ optional)', de: 'Keins (Fitness+ optional)' },
      'garmin-forerunner-165': { en: 'None', de: 'Keins' },
      'fitbit-charge-6':       { en: 'Optional (Premium)', de: 'Optional (Premium)' },
    } },
    { label: { en: 'Water resistance', de: 'Wasserdicht' }, values: {
      'oura-ring-gen3':        { en: '100 m', de: '100 m' },
      'whoop-4':               { en: '~10 m', de: '~10 m' },
      'apple-watch-9':         { en: '50 m', de: '50 m' },
      'garmin-forerunner-165': { en: '50 m (5 ATM)', de: '50 m (5 ATM)' },
      'fitbit-charge-6':       { en: '50 m', de: '50 m' },
    } },
  ],
};

export const hasCompare = (slug: string) => !!compareBy[slug]?.length;
export const compareRows = (slug: string): CompareRow[] => compareBy[slug] ?? [];
