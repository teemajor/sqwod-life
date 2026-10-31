// Sqwod Investor Map: who funds, buys and supports fitness and wellness companies.
// Two sources, merged by name: the researched directory (automation/investors.json, Tee-reviewed)
// and every investor or buyer named on a live Deal Tracker entry (site/src/data/deals.json).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveAll, type Deal } from './deals';
import type { Lang } from '../i18n/ui';

export type InvestorType = 'vc' | 'corporate' | 'accelerator' | 'competition' | 'grant' | 'buyer';
export interface DirectoryEntry {
  id: string; name: string; type: InvestorType; country: string; city?: string;
  focus: string; focusDe: string; stage?: string; check?: string; url: string;
  apply?: { status: 'open' | 'closed' | 'rolling' | 'tba'; deadline?: string; note?: string; noteDe?: string };
  source: string; confidence: 'Certain' | 'Likely'; checked: string; aliases?: string[];
}
export interface DealRef { id: string; entity: string; kind: Deal['kind']; date: string; amount: string; amountUsd: number | null; lead: boolean; role: 'investor' | 'buyer' }
export interface Investor extends Omit<DirectoryEntry, 'type' | 'country' | 'focus' | 'focusDe' | 'url' | 'source' | 'confidence' | 'checked'> {
  type: InvestorType; country: string; region: string; focus: string; focusDe: string; url: string;
  source: string; confidence: DirectoryEntry['confidence'] | 'From deals'; checked: string;
  deals: DealRef[]; inDirectory: boolean; ledCount: number;
}

const COUNTRY_REGION: [string, RegExp][] = [
  ['DACH', /^(germany|austria|switzerland|liechtenstein)$/i], ['UK', /^(united kingdom|uk)$/i],
  ['Europe', /^(france|spain|italy|portugal|netherlands|belgium|luxembourg|ireland|denmark|sweden|norway|finland|iceland|poland|czechia|romania|greece|estonia|latvia|lithuania|european union)$/i],
  ['North America', /^(united states|canada)$/i], ['Asia-Pacific', /^(japan|china|hong kong|taiwan|south korea|india|singapore|australia|new zealand|indonesia|malaysia|thailand|vietnam|philippines)$/i],
  ['Middle East', /^(united arab emirates|saudi arabia|qatar|israel|kuwait|bahrain|oman)$/i],
];
export const regionOf = (country: string): string => (COUNTRY_REGION.find(([, rx]) => rx.test(country.trim())) || ['Other'])[0];

/** Stable anchor for an investor name: "General Catalyst" -> "general-catalyst". */
export const investorSlug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s: string) => investorSlug(s).replace(/-(ventures?|partners|capital|fund|vc|group|inc|ltd|llc)$/g, '');

export function directory(): DirectoryEntry[] {
  const p = join(process.cwd(), '..', 'automation', 'investors.json');
  return (JSON.parse(readFileSync(p, 'utf8')).entries as DirectoryEntry[]);
}

/** Directory + deal-derived investors, each with the deals it appears on. */
export function investors(): Investor[] {
  const byKey = new Map<string, Investor>();
  for (const e of directory()) {
    const inv: Investor = { ...e, region: regionOf(e.country), deals: [], inDirectory: true, ledCount: 0 };
    byKey.set(norm(e.name), inv);
    for (const a of e.aliases || []) byKey.set(norm(a), inv);
  }
  const add = (name: string, d: Deal, role: DealRef['role'], lead: boolean) => {
    const key = norm(name);
    let inv = byKey.get(key);
    if (!inv) {
      inv = { id: investorSlug(name), name, type: role === 'buyer' ? 'buyer' : 'vc', country: '', region: 'Other', focus: '', focusDe: '', url: '',
        source: '', confidence: 'From deals', checked: '', deals: [], inDirectory: false, ledCount: 0 };
      byKey.set(key, inv);
    }
    if (role === 'buyer' && !inv.inDirectory) inv.type = 'buyer';
    if (!inv.deals.some((x) => x.id === d.id)) inv.deals.push({ id: d.id, entity: d.entity, kind: d.kind, date: d.date, amount: d.amount, amountUsd: d.amountUsd, lead, role });
    if (lead) inv.ledCount++;
  };
  for (const d of liveAll()) {
    for (const n of d.investors || []) add(n, d, 'investor', (d.leads || []).includes(n));
    if (d.acquirer) add(d.acquirer, d, 'buyer', true);
  }
  const all = [...new Set(byKey.values())];
  for (const inv of all) inv.deals.sort((a, b) => b.date.localeCompare(a.date));
  // directory entries first by deal count, then the rest alphabetically
  return all.sort((a, b) => b.deals.length - a.deals.length || Number(b.inDirectory) - Number(a.inDirectory) || a.name.localeCompare(b.name));
}

export const TYPE_LABEL: Record<Lang, Record<InvestorType, string>> = {
  en: { vc: 'Fund', corporate: 'Corporate', accelerator: 'Accelerator', competition: 'Competition', grant: 'Grant', buyer: 'Buyer' },
  de: { vc: 'Fonds', corporate: 'Corporate', accelerator: 'Accelerator', competition: 'Wettbewerb', grant: 'Förderung', buyer: 'Käufer' },
};
