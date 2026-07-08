/**
 * ON-BRAND GUARD — the single definition of what belongs in Sqwod media.
 *
 * Why this exists: on 2026-07-08 a gold/forex story (FXEmpire, XAU/USD) shipped
 * in the Daily. Root cause: the old RELEVANT gate accepted ambiguous words like
 * "recovery" and "trend" on their own, so a "gold mounts a recovery" headline
 * passed. The rule now is a positive gate, not a blocklist-only one:
 *
 *   1) OFFTOPIC match (finance/markets/crypto/commodities/etc.) → ALWAYS dropped.
 *   2) Finance/markets outlets → ALWAYS dropped, whatever the headline says.
 *   3) Everything else must contain at least one STRONG industry term (EN or DE).
 *      Ambiguous words (recovery, trend, gold, strength, sport…) are NOT
 *      sufficient on their own. No strong term → dropped.
 *
 * Used by ingest.mjs (candidate gate) AND cascade.mjs (belt-and-braces on the
 * generated issue), so even a polluted source file can't reach the reader.
 */

// Core fitness/wellness-industry vocabulary (EN + DE). A story must hit one.
export const STRONG_RX = new RegExp('\\b(' + [
  // places & businesses
  'fitness', 'gym\\w*', 'fitnessstudio\\w*', 'health club\\w*', 'boutique (?:fitness|studio)', 'studio\\w*',
  'franchise\\w*', 'classpass', 'wellness', 'wellbeing', 'well-being', 'spa\\b', 'sauna\\w*',
  // people
  'coach\\w*', 'trainer\\w*', 'personal train\\w*', 'athlet\\w*', 'physio\\w*', 'influencer\\w*',
  // training & body
  'workout\\w*', 'training\\w*', 'exercise\\w*', 'übung\\w*', 'muskel\\w*', 'muscle\\w*', 'hypertroph\\w*',
  'mobility', 'crossfit', 'hyrox', 'pilates', 'yoga', 'run(?:ning|ner)\\w*', 'strength training', 'krafttraining',
  // gear & tech
  'wearable\\w*', 'smart ?ring\\w*', 'fitness ?tracker\\w*', 'oura', 'whoop', 'garmin', 'fitbit',
  'apple watch', 'peloton', 'treadmill\\w*', 'laufband\\w*', 'equipment', 'sportswear', 'activewear', 'gymshark',
  // nutrition & recovery
  'supplement\\w*', 'nahrungsergänzung\\w*', 'creatine', 'kreatin', 'protein\\w*', 'nutrition', 'ernährung\\w*',
  'cold plunge\\w*', 'ice bath\\w*', 'eisbad\\w*', 'longevity clinic\\w*',
  // industry & membership
  'membership\\w*', 'mitglied\\w*', 'fitnessbranche', 'fitnesswirtschaft', 'wellness econom\\w*',
  'fitness industry', 'health & fitness', 'sports? med\\w*',
].join('|') + ')\\b', 'i');

// Hard NO: finance/markets/commodities/crypto/macro — never our story.
export const OFFTOPIC_RX = new RegExp('\\b(' + [
  'xau', 'xag', 'usd\\/[a-z]{3}', '[a-z]{3}\\/usd', 'forex', 'fx market\\w*',
  'gold price\\w*', 'silver price\\w*', 'bullion', 'goldpreis\\w*',
  'bitcoin', 'btc', 'crypto\\w*', 'krypto\\w*', 'ethereum', 'altcoin\\w*', 'stablecoin\\w*',
  'stock market', 'stocks to (?:buy|watch)', 'aktienmarkt', 'nasdaq', 's&p ?500', 'dow jones', 'dax\\b',
  'treasur(?:y|ies)', 'bond yield\\w*', 'staatsanleihe\\w*', 'etf\\b',
  'opec', 'crude oil', 'natural gas', 'rohöl',
  'mortgage\\w*', 'housing market', 'immobilienmarkt', 'real estate',
  'earnings per share', 'dividend\\w*', 'zinsentscheid\\w*', 'interest rate decision', 'central bank', 'fed rate',
].join('|') + ')\\b', 'i');

// Outlets whose beat is markets/finance — drop on name alone.
export const FINANCE_OUTLETS_RX = /^(fx ?empire|investing\.com|kitco|coindesk|cointelegraph|marketwatch|benzinga|barchart(\.com)?|seeking alpha|(the )?motley fool|forexlive|dailyfx|yahoo finance|zacks( investment research)?|finanzen\.net|börse online|boerse\.de)$/i;

/** True when a story belongs in Sqwod media. `text` = headline (+ dek/topic). */
export function isOnBrand(text, outlet = '') {
  const s = String(text || '');
  if (OFFTOPIC_RX.test(s)) return false;
  if (FINANCE_OUTLETS_RX.test(String(outlet || '').trim())) return false;
  return STRONG_RX.test(s);
}
