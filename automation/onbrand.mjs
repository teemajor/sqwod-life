import { readFileSync } from 'node:fs';

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
  // adjacent wellness / longevity / metabolic beat (the "future of health" slice we cover
  // through an operator/coach lens — added 2026-07-23 so Fitt-beat stories qualify without
  // opening the door to finance/markets, which the OFFTOPIC gate still hard-drops).
  'longevity', 'healthspan', 'biohack\\w*', 'blue ?zone\\w*',
  'glp-?1', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'peptide\\w*', 'metabolic health',
  'preventive health', 'preventative health', 'health screening\\w*', 'digital health', 'health ?tech\\w*',
  'wellness ?tech\\w*', 'digital fitness', 'eight sleep', 'sleep ?tech\\w*', 'recovery tech\\w*',
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

// ---- DEAL / MONEY widening (added 2026-07-23) --------------------------------
// Goal: capture the money — a Neko $700M or an IM8 $1B — the way Fitt Insider does,
// WITHOUT reopening the door to gold/forex/crypto (those stay hard-blocked above).
// A story also counts as on-brand when it is a DEAL that sits in OUR health/wellness
// economy, or when it names a player on our watchlist.

// Funding / M&A / IPO / strategic-investment signal.
export const DEAL_RX = new RegExp('\\b(' + [
  'raises?', 'raised', 'raising', 'funding', 'fundraise\\w*', 'seed round', 'series [a-e]\\b',
  'growth capital', 'venture round', 'valuation', 'valued at', 'ipo', 'goes public', 'spac',
  'acqui\\w*', 'buys', 'buyout', 'merger', 'merges', 'takeover', 'stake', 'invests?', 'investment', 'backs',
].join('|') + ')\\b|[$€£]\\s?\\d|\\b\\d[\\d.,]*\\s?(?:m|bn|million|billion)\\b', 'i');

// Consumer health / wellness context — broad enough to place a deal in our world
// (health, longevity, metabolic, wearables, recovery, nutrition…). Applied ONLY together
// with a DEAL signal, so "health" alone never qualifies a random story.
export const HEALTH_CTX_RX = new RegExp('\\b(' + [
  'health\\w*', 'wellness', 'wellbeing', 'well-being', 'fitness', 'gym\\w*', 'wearable\\w*',
  'longevity', 'healthspan', 'metabolic', 'glp-?1', 'ozempic', 'wegovy', 'mounjaro', 'peptide\\w*',
  'obesity', 'weight[- ]loss', 'weight management', 'nutrition', 'supplement\\w*', 'protein\\w*', 'creatine',
  'recovery', 'sleep', 'mental health', 'meditation', 'mindfulness', 'telehealth', 'diagnostic\\w*',
  'screening', 'preventive', 'preventative', 'biotech', 'therapeutic\\w*', 'coach\\w*', 'workout\\w*',
  'clinic\\w*', 'medical device\\w*', 'biohack\\w*', 'supplements?', 'recovery tech\\w*',
].join('|') + ')\\b', 'i');

// …but NOT enterprise/provider/insurer/pharma-supply plays — not our reader's world.
export const HEALTH_EXCLUDE_RX = new RegExp('\\b(' + [
  'hospital\\w*', 'health system\\w*', 'unitedhealth\\w*', 'insurer\\w*', 'insurance', 'payer\\w*',
  'medicaid', 'medicare', 'ehr\\b', 'electronic health record\\w*', 'pharmacy benefit\\w*',
  'drug pricing', 'health insurance', 'claims processing', 'revenue cycle', 'health plan\\w*',
].join('|') + ')\\b', 'i');

// Named players we ALWAYS want — so a bare "IM8 Lands $1B" (no category word in the
// headline) still qualifies. Small built-in default keeps this file self-contained; the
// authoritative, editable list lives in automation/watchlist.json (merged at load).
const WATCHLIST_DEFAULT = [
  'Oura', 'Whoop', 'Eight Sleep', 'Ultrahuman', 'Garmin', 'Fitbit', 'Coros', 'Amazfit',
  'Peloton', 'Tonal', 'Hydrow', 'Zwift', 'iFit', 'Hyrox', 'CrossFit', 'Gymshark', 'Lululemon',
  'Neko Health', 'Neko', 'Function Health', 'Superpower', 'Levels Health', 'Zoe', 'IM8',
  'Hims', 'Noom', 'WeightWatchers', 'Weight Watchers', 'Headspace', 'Strava',
  'Eli Lilly', 'Novo Nordisk', 'ClassPass', 'Mindbody', 'Momence', 'EGYM', 'Technogym',
  'Basic-Fit', 'PureGym', 'RSG Group', 'Gympass', 'Wellhub', 'Pvolve', 'Xponential',
  'Life Time', 'Planet Fitness', 'F45', 'Orangetheory', 'Equinox', 'Barry\'s', 'AG1',
  'Athletic Greens', 'Huel', 'Momentous', 'Alo Yoga', 'Vuori',
];
let WATCHLIST = WATCHLIST_DEFAULT;
try {
  const raw = JSON.parse(readFileSync(new URL('./watchlist.json', import.meta.url), 'utf8'));
  const extra = Array.isArray(raw) ? raw : (raw.entities || []);
  if (extra.length) WATCHLIST = [...new Set([...WATCHLIST_DEFAULT, ...extra])];
} catch { /* no override file — built-in default is fine */ }
const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
export const WATCHLIST_RX = new RegExp('\\b(' + WATCHLIST.map(esc).join('|') + ')\\b', 'i');

/** True when a story belongs in Sqwod media. `text` = headline (+ dek/topic). */
export function isOnBrand(text, outlet = '') {
  const s = String(text || '');
  // 1) Hard blocks first — gold/forex/crypto/markets can NEVER pass, even for a
  //    watchlisted name or a "deal" (this is what keeps the gold-price story out).
  if (OFFTOPIC_RX.test(s)) return false;
  if (FINANCE_OUTLETS_RX.test(String(outlet || '').trim())) return false;
  // 2) Core fitness/wellness vocabulary → in.
  if (STRONG_RX.test(s)) return true;
  // 3) A named health/wellness/fitness player → in (captures IM8, Neko, Function Health…).
  if (WATCHLIST_RX.test(s)) return true;
  // 4) A funding/M&A/IPO deal sitting in our health-wellness economy → in — but not the
  //    enterprise/insurer/hospital/pharma-supply slice.
  if (DEAL_RX.test(s) && HEALTH_CTX_RX.test(s) && !HEALTH_EXCLUDE_RX.test(s)) return true;
  return false;
}
