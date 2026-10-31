// Sqwod Deal Tracker: which deals are live, read at build time.
// site/src/data/deals.json is written by automation/deals.mjs. A deal is shown when it is
// approved, either in automation/deals-overrides.json or because Tee tapped Publish in the
// email (the pr-intake Worker flips automation/intel-queue/deal-<id>.json to "approved" and
// that commit triggers a deploy). Pending and skipped deals never render.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import data from '../data/deals.json';

export interface Deal {
  id: string; date: string; entity: string; kind: 'raise' | 'acquisition' | 'valuation' | 'ipo' | 'shutdown';
  amount: string; amountUsd: number | null; currency: string | null; approx?: boolean;
  note: string; noteDe?: string; url: string; source: string; issue: string;
  region: string; country?: string; category: string; status: string; checked?: string;
  investors?: string[]; leads?: string[]; acquirer?: string;   // lead investors are a subset of investors; acquirer for M&A
  reports: { date: string; url: string; issue: string }[];
}

const AUTOMATION = join(process.cwd(), '..', 'automation');
const readJson = (p: string) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };

/** Every approved entry, closures included (the table, the downloads). */
export function liveAll(): Deal[] {
  const overrides = readJson(join(AUTOMATION, 'deals-overrides.json')) || { deals: {} };
  return (data.deals as Deal[]).filter((d) => {
    const o = overrides.deals?.[d.id]?.status;
    if (o) return o === 'approved';
    if (d.status === 'approved') return true;
    if (d.status === 'hidden') return false;
    const q = readJson(join(AUTOMATION, 'intel-queue', `deal-${d.id}.json`));
    return q?.status === 'approved';
  });
}
/** Money deals only: raises, acquisitions, valuations, IPOs (headline counts, cards). */
export const liveDeals = (): Deal[] => liveAll().filter((d) => d.kind !== 'shutdown');
/** Closures, bankruptcies, insolvencies and administrations. */
export const liveClosures = (): Deal[] => liveAll().filter((d) => d.kind === 'shutdown');
export const FX: Record<string, number> = data.fx;
export const generatedAt: string = data.generatedAt;
