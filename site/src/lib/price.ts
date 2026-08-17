// Single source of truth for rendering a Sqwod Verified price.
//
// WHY THIS EXISTS
// value.bestPrice means two different things depending on the product: a
// one-off purchase for a EUR 299 ring, a recurring fee for Whoop (EUR 30 per
// month), TrainingPeaks (USD 19.95 per month) or AG1. Price was previously
// rendered in five separate places — the roundups, the category comparison
// table, the head-to-head pages, the review scorecard — each formatting a bare
// number. In a ranked table or a head-to-head that makes the most expensive
// product in a category read as the cheapest.
//
// The cadence is now DECLARED on the review (value.priceType) and enforced by
// a superRefine in content/config.ts, so it can't be silently omitted. This
// module turns that declaration into display text, once, for every caller.
import type { Lang } from '../i18n/ui';

export type PriceType = 'oneoff' | 'monthly' | 'yearly';

export interface PriceValue {
  bestPrice?: number;
  currency?: string;
  priceType?: PriceType;
  low?: number;
  subscription?: string;
}

const CADENCE: Record<Lang, Record<PriceType, string>> = {
  en: { oneoff: '', monthly: '/mo', yearly: '/yr' },
  de: { oneoff: '', monthly: '/Mon.', yearly: '/Jahr' },
};

export const isRecurring = (t?: PriceType) => t === 'monthly' || t === 'yearly';

/** "/mo", "/Jahr", or "" for a one-off purchase. */
export const cadence = (lang: Lang, t: PriceType = 'oneoff') => CADENCE[lang][t] ?? '';

/**
 * Formatted amount with its cadence — "€299", "€30/mo", "$19.95/mo".
 * Fractional amounts keep their decimals (TrainingPeaks is 19.95, not 20);
 * whole amounts drop them.
 */
export function formatPrice(
  amount: number,
  currency = 'EUR',
  lang: Lang = 'en',
  priceType: PriceType = 'oneoff',
): string {
  const hasDecimals = Math.abs(amount % 1) > 0.001;
  const n = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
  return n + cadence(lang, priceType);
}

/** Convenience: format a review's whole value block. Returns null when unpriced. */
export const priceOf = (v: PriceValue | undefined, lang: Lang) =>
  typeof v?.bestPrice === 'number'
    ? formatPrice(v.bestPrice, v.currency ?? 'EUR', lang, v.priceType ?? 'oneoff')
    : null;

/** Same for the 90-day low, which shares the cadence of the headline price. */
export const lowOf = (v: PriceValue | undefined, lang: Lang) =>
  typeof v?.low === 'number'
    ? formatPrice(v.low, v.currency ?? 'EUR', lang, v.priceType ?? 'oneoff')
    : null;

/** True when a subscription line is worth printing (i.e. exists and isn't "none"). */
export const hasSubscription = (v?: PriceValue) =>
  !!v?.subscription && !/^\s*(none|keine)\b/i.test(v.subscription);
