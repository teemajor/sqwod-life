// Sqwod Investor Map: who funds, buys and supports fitness and wellness companies.
// Three sources, merged by name: the researched directory (automation/investors.json, Tee-reviewed),
// every investor or buyer named on a live Deal Tracker entry (site/src/data/deals.json), and the
// CB Insights / Crunchbase enrichment cache (automation/investors-enrich.json). From those it derives
// the facets the filter and the matcher use: stages, cheque range, focus tags, activity.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { liveAll, generatedAt, type Deal } from './deals';
import { flagCode } from './flags';
import type { Lang } from '../i18n/ui';

export type InvestorType = 'vc' | 'corporate' | 'accelerator' | 'competition' | 'grant' | 'buyer';
export type StageKey = 'idea' | 'preseed' | 'seed' | 'a' | 'b' | 'growth';
export type FocusKey = 'gyms' | 'wearables' | 'nutrition' | 'longevity' | 'womens' | 'software' | 'consumer' | 'sports';
export const STAGES: StageKey[] = ['idea', 'preseed', 'seed', 'a', 'b', 'growth'];
export const FOCUS: FocusKey[] = ['gyms', 'wearables', 'nutrition', 'longevity', 'womens', 'software', 'consumer', 'sports'];
/** Cheque bands in USD: [min, max). */
export const BANDS: [number, number][] = [[0, 1e5], [1e5, 1e6], [1e6, 5e6], [5e6, 25e6], [25e6, Infinity]];

export interface DirectoryEntry {
  id: string; name: string; type: InvestorType; country: string; city?: string;
  focus: string; focusDe: string; stage?: string; check?: string; url: string;
  apply?: { status: 'open' | 'closed' | 'rolling' | 'tba'; deadline?: string; note?: string; noteDe?: string };
  source: string; confidence: 'Certain' | 'Likely'; checked: string; aliases?: string[];
}
export interface DealRef { id: string; entity: string; kind: Deal['kind']; date: string; amount: string; amountUsd: number | null; lead: boolean; role: 'investor' | 'buyer'; country?: string; category: string }
/** One portfolio row from CB Insights: [date, company, round, amount USD or null]. */
export type PortfolioRow = [string, string, string, number | null];
export interface Enrichment {
  cbi?: { id: number; url: string; site?: string; city?: string; country?: string; founded?: number; type?: string; check?: string; note?: string; desc?: string };
  cb?: { permalink?: string; founded?: number; stages?: string[]; types?: string[]; city?: string; country?: string; desc?: string; note?: string };
  deals: PortfolioRow[];
}
export interface Investor extends Omit<DirectoryEntry, 'type' | 'country' | 'focus' | 'focusDe' | 'url' | 'source' | 'confidence' | 'checked'> {
  type: InvestorType; country: string; region: string; focus: string; focusDe: string; url: string;
  source: string; confidence: DirectoryEntry['confidence'] | 'From deals'; checked: string;
  deals: DealRef[]; inDirectory: boolean; ledCount: number;
  // derived (filters + matcher)
  enrich?: Enrichment; founded?: number;
  stages: StageKey[]; stagesFrom: 'directory' | 'crunchbase' | 'portfolio' | '';
  checkMin: number | null; checkMax: number | null; typicalRound: number | null; bands: number[];
  focusTags: FocusKey[]; portfolio: PortfolioRow[];
  dealsTotal: number; active12m: number; lastDeal: string; leadsRounds: boolean; abroad: boolean;
}

const COUNTRY_REGION: [string, RegExp][] = [
  ['DACH', /^(germany|austria|switzerland|liechtenstein)$/i], ['UK', /^(united kingdom|uk)$/i],
  ['Europe', /^(france|spain|italy|portugal|netherlands|belgium|luxembourg|ireland|denmark|sweden|norway|finland|iceland|poland|czechia|romania|greece|estonia|latvia|lithuania|monaco|european union)$/i],
  ['North America', /^(united states|canada)$/i], ['Asia-Pacific', /^(japan|china|hong kong|taiwan|south korea|india|singapore|australia|new zealand|indonesia|malaysia|thailand|vietnam|philippines)$/i],
  ['Middle East', /^(united arab emirates|saudi arabia|qatar|israel|kuwait|bahrain|oman)$/i],
  ['Latin America', /^(brazil|mexico|argentina|chile|colombia|costa rica|peru)$/i],
];
export const regionOf = (country: string): string => (COUNTRY_REGION.find(([, rx]) => rx.test(country.trim())) || ['Other'])[0];

/** Stable anchor for an investor name: "General Catalyst" -> "general-catalyst". */
export const investorSlug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s: string) => investorSlug(s).replace(/-(ventures?|partners|capital|fund|vc|group|inc|ltd|llc)$/g, '');

const AUTOMATION = join(process.cwd(), '..', 'automation');
export function directory(): DirectoryEntry[] {
  return (JSON.parse(readFileSync(join(AUTOMATION, 'investors.json'), 'utf8')).entries as DirectoryEntry[]);
}
function enrichment(): Record<string, Enrichment> {
  const p = join(AUTOMATION, 'investors-enrich.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).items as Record<string, Enrichment>) : {};
}

// ---- derivations ------------------------------------------------------------------------------
const FX: Record<string, number> = { $: 1, '€': 1.08, '£': 1.27, CHF: 1.12, CAD: 0.72 };   // rough, for banding only
const MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
/** "$500K to $100M" -> [5e5, 1e8]; "Up to €2.5M" -> [0, 2.7e6]; "$10,000 prize pool" -> [1e4, 1e4]. */
export function parseCheck(s?: string): [number | null, number | null] {
  if (!s) return [null, null];
  const rx = /(\$|€|£|CHF|CAD)\s?([\d.,]+)\s?([kmb])?/gi;
  const vals: number[] = [];
  for (const m of s.matchAll(rx)) {
    const n = parseFloat(m[2].replace(/,/g, ''));
    if (!isFinite(n)) continue;
    vals.push(n * (MULT[(m[3] || '').toLowerCase()] || 1) * (FX[m[1].toUpperCase() === 'CHF' ? 'CHF' : m[1]] || 1));
  }
  if (!vals.length) return [null, null];
  if (/up to|bis zu|max/i.test(s) && vals.length === 1) return [0, vals[0]];
  return [Math.min(...vals), Math.max(...vals)];
}
const bandsFor = (min: number | null, max: number | null): number[] => {
  if (min == null || max == null) return [];
  return BANDS.map((b, i) => (min < b[1] && max >= b[0] ? i : -1)).filter((i) => i >= 0);
};
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const STAGE_WORD: [RegExp, StageKey][] = [[/idea|research|concept/i, 'idea'], [/pre-?seed/i, 'preseed'], [/\bseed\b/i, 'seed'], [/series a|early/i, 'a'], [/series b/i, 'b'], [/growth|late|series c|pre-ipo|scale/i, 'growth']];
/** "Pre-seed to Series A" -> preseed, seed, a (a range fills the stages in between). */
export function parseStage(s?: string): StageKey[] {
  if (!s) return [];
  if (/^any$/i.test(s)) return [...STAGES];
  if (/strategic/i.test(s)) return [];
  const hits = STAGE_WORD.filter(([rx]) => rx.test(s)).map(([, k]) => STAGES.indexOf(k));
  if (!hits.length) return [];
  if (/\bto\b|-|–/.test(s) && hits.length >= 2) { const lo = Math.min(...hits), hi = Math.max(...hits); return STAGES.slice(lo, hi + 1); }
  return [...new Set(hits)].sort().map((i) => STAGES[i]);
}
const ROUND_STAGE: [RegExp, StageKey][] = [[/pre-?seed|accelerator|competition|grant|angel/i, 'preseed'], [/^seed|convertible/i, 'seed'], [/series a/i, 'a'], [/series b/i, 'b'], [/series [c-h]|growth|private equity|late|secondary|recap/i, 'growth']];
const CB_STAGE: Record<string, StageKey[]> = { seed: ['preseed', 'seed'], early: ['a'], late: ['b', 'growth'], pe: ['growth'], venture: ['seed', 'a', 'b'] };

const FOCUS_RX: Record<FocusKey, RegExp> = {
  gyms: /\bgym|studio|boutique|club|fitness operator|franchise|operator|facilit/i,
  wearables: /wearable|device|hardware|sensor|ring|watch|smart (?:mirror|bike)|equipment|connected fitness|sleep tech/i,
  nutrition: /nutrition|supplement|food|beverage|drink|snack|protein|cpg|packaged goods|better-for-you/i,
  longevity: /longevity|ageing|aging|health ?span|biotech|diagnostic|clinic|medical|therap|precision|life science|healthtech|health tech|digital health|preventive|prevention/i,
  womens: /women|femtech|fertility|menopause|sexual health|maternal|pregnan/i,
  software: /software|saas|\bai\b|app\b|apps\b|platform|digital|data|tech-enabled|marketplace|coaching app/i,
  consumer: /consumer brand|d2c|dtc|direct-to-consumer|lifestyle brand|personal care|beauty|skincare|consumer goods|brands?\b|retail/i,
  sports: /\bsport|athlete|league|team|fan\b|esport|gaming|outdoor|cycling|running/i,
};
const CATEGORY_FOCUS: Record<string, FocusKey[]> = { 'Gyms & studios': ['gyms'], 'Wearables & devices': ['wearables'], 'Health & longevity': ['longevity'], 'Nutrition & supplements': ['nutrition', 'consumer'], 'Software & AI': ['software'] };
/** Focus tags from the directory text, the Crunchbase description and the categories of tracker deals. */
export function focusTagsOf(text: string, deals: DealRef[]): FocusKey[] {
  const set = new Set<FocusKey>();
  for (const k of FOCUS) if (FOCUS_RX[k].test(text)) set.add(k);
  for (const d of deals) for (const k of CATEGORY_FOCUS[d.category] || []) set.add(k);
  return FOCUS.filter((k) => set.has(k));
}

const monthsAgo = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };

function derive(inv: Investor, en: Enrichment | undefined, today: string) {
  inv.enrich = en;
  // 1. fill gaps for deal-derived investors from the enrichment profiles
  const prof = en?.cb && en.cb.country ? en.cb : en?.cbi;
  if (!inv.country && prof?.country) { inv.country = prof.country; inv.city = prof.city; inv.region = regionOf(prof.country); }
  if (!inv.city && prof?.city) inv.city = prof.city;
  if (!inv.url && en?.cbi?.site) inv.url = 'https://' + en.cbi.site.replace(/^https?:\/\//, '');
  inv.founded = en?.cb?.founded || en?.cbi?.founded;
  if (!inv.focus && (en?.cb?.desc || en?.cbi?.desc)) { inv.focus = en!.cb?.desc || en!.cbi!.desc!; inv.focusDe = inv.focus; }
  if (!inv.check && en?.cbi?.check) inv.check = en.cbi.check;
  if (!inv.inDirectory && en?.cbi?.type && /incubator|accelerator/i.test(en.cbi.type)) inv.type = 'accelerator';
  if (!inv.inDirectory && en?.cbi?.type && /corporat|holding/i.test(en.cbi.type) && inv.type !== 'buyer') inv.type = 'corporate';
  // 2. stages: directory text, else Crunchbase buckets, else the rounds in the portfolio
  const portfolio = en?.deals || [];
  let stages = parseStage(inv.stage); let from: Investor['stagesFrom'] = stages.length ? 'directory' : '';
  if (!stages.length && en?.cb?.stages?.length) { stages = [...new Set(en.cb.stages.flatMap((s) => CB_STAGE[s] || []))]; from = 'crunchbase'; }
  if (!stages.length && portfolio.length) {
    const set = new Set<StageKey>();
    for (const [, , round] of portfolio) for (const [rx, k] of ROUND_STAGE) if (rx.test(round)) { set.add(k); break; }
    stages = STAGES.filter((k) => set.has(k)); from = stages.length ? 'portfolio' : '';
  }
  inv.stages = STAGES.filter((k) => stages.includes(k)); inv.stagesFrom = from;
  // 3. cheque range and the typical round size it joins (portfolio + tracker amounts)
  [inv.checkMin, inv.checkMax] = parseCheck(inv.check);
  const amounts = [...portfolio.map((r) => r[3]), ...inv.deals.filter((d) => d.role === 'investor').map((d) => d.amountUsd)].filter((n): n is number => !!n && n > 0);
  inv.typicalRound = median(amounts);
  inv.bands = bandsFor(inv.checkMin, inv.checkMax);
  if (!inv.bands.length && inv.typicalRound) inv.bands = bandsFor(inv.typicalRound / 4, inv.typicalRound);   // a backer usually writes a slice of the round
  // 4. focus tags
  inv.focusTags = focusTagsOf(`${inv.focus} ${en?.cb?.desc || ''} ${en?.cbi?.desc || ''}`, inv.deals);
  inv.portfolio = portfolio.slice(0, 4);
  // 5. activity
  const seen = new Set(portfolio.map((r) => r[1].toLowerCase()));
  const extra = inv.deals.filter((d) => !seen.has(d.entity.toLowerCase()));
  inv.dealsTotal = portfolio.length + extra.length;
  const cutoff = monthsAgo(today, 12);
  inv.active12m = portfolio.filter((r) => r[0] >= cutoff).length + extra.filter((d) => d.date >= cutoff).length;
  inv.lastDeal = [...portfolio.map((r) => r[0]), ...inv.deals.map((d) => d.date)].sort().pop() || '';
  inv.leadsRounds = inv.ledCount > 0 || /\blead(s|ing)? (rounds|investor|seed|series)|lead-investor|leads? rounds/i.test(inv.focus);
  const home = inv.region;
  inv.abroad = /global|international|worldwide|pan-europe|across europe|europe and|us and europe|emea|north america and|transatlantic/i.test(inv.focus)
    || inv.deals.some((d) => d.country && regionOf(d.country) !== home && home !== 'Other');
}

/** Directory + deal-derived investors, each with the deals it appears on and the derived facets. */
export function investors(): Investor[] {
  const byKey = new Map<string, Investor>();
  const blank = (): Pick<Investor, 'stages' | 'stagesFrom' | 'checkMin' | 'checkMax' | 'typicalRound' | 'bands' | 'focusTags' | 'portfolio' | 'dealsTotal' | 'active12m' | 'lastDeal' | 'leadsRounds' | 'abroad'> =>
    ({ stages: [], stagesFrom: '', checkMin: null, checkMax: null, typicalRound: null, bands: [], focusTags: [], portfolio: [], dealsTotal: 0, active12m: 0, lastDeal: '', leadsRounds: false, abroad: false });
  for (const e of directory()) {
    const inv: Investor = { ...e, region: regionOf(e.country), deals: [], inDirectory: true, ledCount: 0, ...blank() };
    byKey.set(norm(e.name), inv);
    for (const a of e.aliases || []) byKey.set(norm(a), inv);
  }
  const add = (name: string, d: Deal, role: DealRef['role'], lead: boolean) => {
    const key = norm(name);
    let inv = byKey.get(key);
    if (!inv) {
      inv = { id: investorSlug(name), name, type: role === 'buyer' ? 'buyer' : 'vc', country: '', region: 'Other', focus: '', focusDe: '', url: '',
        source: '', confidence: 'From deals', checked: '', deals: [], inDirectory: false, ledCount: 0, ...blank() };
      byKey.set(key, inv);
    }
    if (role === 'buyer' && !inv.inDirectory) inv.type = 'buyer';
    if (!inv.deals.some((x) => x.id === d.id)) inv.deals.push({ id: d.id, entity: d.entity, kind: d.kind, date: d.date, amount: d.amount, amountUsd: d.amountUsd, lead, role, country: d.country, category: d.category });
    if (lead) inv.ledCount++;
  };
  for (const d of liveAll()) {
    for (const n of d.investors || []) add(n, d, 'investor', (d.leads || []).includes(n));
    if (d.acquirer) add(d.acquirer, d, 'buyer', true);
  }
  const all = [...new Set(byKey.values())];
  const en = enrichment();
  const enByKey = new Map<string, Enrichment>();
  for (const [k, v] of Object.entries(en)) { enByKey.set(k, v); enByKey.set(norm(k), v); }
  for (const inv of all) {
    inv.deals.sort((a, b) => b.date.localeCompare(a.date));
    derive(inv, enByKey.get(inv.id) || enByKey.get(norm(inv.name)) || enByKey.get(inv.name), generatedAt);
  }
  // directory entries first by deal count, then the rest alphabetically
  return all.sort((a, b) => b.deals.length - a.deals.length || Number(b.inDirectory) - Number(a.inDirectory) || a.name.localeCompare(b.name));
}

/** Countries founders can pick in the matcher: every country with a flag, grouped by region. */
export const countryCode = flagCode;

export const TYPE_LABEL: Record<Lang, Record<InvestorType, string>> = {
  en: { vc: 'Fund', corporate: 'Corporate', accelerator: 'Accelerator', competition: 'Competition', grant: 'Grant', buyer: 'Buyer' },
  de: { vc: 'Fonds', corporate: 'Corporate', accelerator: 'Accelerator', competition: 'Wettbewerb', grant: 'Förderung', buyer: 'Käufer' },
};
export const STAGE_LABEL: Record<Lang, Record<StageKey, string>> = {
  en: { idea: 'Idea', preseed: 'Pre-seed', seed: 'Seed', a: 'Series A', b: 'Series B', growth: 'Growth' },
  de: { idea: 'Idee', preseed: 'Pre-Seed', seed: 'Seed', a: 'Series A', b: 'Series B', growth: 'Growth' },
};
export const FOCUS_LABEL: Record<Lang, Record<FocusKey, string>> = {
  en: { gyms: 'Gyms & studios', wearables: 'Wearables & devices', nutrition: 'Nutrition & supplements', longevity: 'Health & longevity', womens: "Women's health", software: 'Software & AI', consumer: 'Consumer brands', sports: 'Sports tech' },
  de: { gyms: 'Gyms & Studios', wearables: 'Wearables & Geräte', nutrition: 'Ernährung & Supplements', longevity: 'Gesundheit & Longevity', womens: 'Frauengesundheit', software: 'Software & KI', consumer: 'Consumer-Marken', sports: 'Sport-Tech' },
};
export const BAND_LABEL: string[] = ['< $100K', '$100K – $1M', '$1M – $5M', '$5M – $25M', '$25M +'];
