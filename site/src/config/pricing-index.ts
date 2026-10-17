// Sqwod Coach Pricing Index: where the calculator posts anonymous rates and
// where the build reads the aggregate numbers (infrastructure/pricing-index).
export const PRICING_INDEX = {
  endpoint: 'https://sqwod-pricing-index.sqwodlife.workers.dev',
  minCell: 30,         // medians publish only for groups with this many rates
  minPercentile: 100,  // the calculator shows a percentile once this many rates exist
};

export type IndexDist = { n: number; p10?: number; p25?: number; p50?: number; p75?: number; p90?: number };
export type IndexStats = {
  ok: boolean; live: boolean; n: number;
  byFormat: Record<string, number>;
  session: IndexDist; online: IndexDist;
  states: Record<string, { n: number; session: IndexDist }>;
};

const EMPTY: IndexStats = { ok: true, live: false, n: 0, byFormat: {}, session: { n: 0 }, online: { n: 0 }, states: {} };

// Read once per build. A missing or slow Worker must never break the site
// build, so any failure falls back to "0 rates so far".
let cached: Promise<IndexStats> | null = null;
export function loadIndexStats(): Promise<IndexStats> {
  cached ||= (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${PRICING_INDEX.endpoint}/stats`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return EMPTY;
      const d = await r.json();
      return d && d.ok ? { ...EMPTY, ...d, live: true } : EMPTY;
    } catch {
      return EMPTY;
    }
  })();
  return cached;
}
