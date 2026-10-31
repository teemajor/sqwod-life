// Build-time data for the Investor Globe (shared by the full page and the hero banner on the list page).
import { investors, STAGES, STAGE_LABEL, FOCUS_LABEL, type Investor, type FocusKey } from './investors';
import { locate, countryCentre } from './geo';
import { flagCode } from './flags';
import { generatedAt } from './deals';
import type { Lang } from '../i18n/ui';

export const GLOBE_COLORS: Record<string, string> = { vc: '#7FB58C', corporate: '#E3B65C', accelerator: '#6FB6E8', competition: '#D08BE0', grant: '#F2EFE8', buyer: '#E57A7A' };

export interface GlobePoint {
  id: string; n: string; t: string; c: string; cc: string; city: string; lat: number; lng: number; precise: number; r: string; f: string[];
  ck: string;   // city key: points with the same key share a spot and get clustered
  st: string; chk: string; a12: number; tot: number; last: string; open: number; lead: number;
  deals: { id: string; e: string; amt: string; c: string; kind: string; lead: number; role: string }[];
  port: [string, string, number | null][]; focus: string; url: string; cbi: string; cb: string;
}
export interface GlobeArc { id: string; t: string; sLat: number; sLng: number; eLat: number; eLng: number; e: string; c: string }

const isOpen = (i: Investor, today: string) => !!i.apply && (i.apply.status === 'rolling' || (i.apply.status === 'open' && (!i.apply.deadline || i.apply.deadline >= today)));
const stageLine = (i: Investor, lang: Lang) => i.stage || (i.stages.length ? (i.stages.length === STAGES.length ? (lang === 'de' ? 'alle Phasen' : 'any stage') : `${STAGE_LABEL[lang][i.stages[0]]}${i.stages.length > 1 ? ` – ${STAGE_LABEL[lang][i.stages[i.stages.length - 1]]}` : ''}`) : '');

/** Points (one per placed investor at its city centre; the client clusters and spreads same-city dots) and arcs (HQ → country of a tracker deal elsewhere). */
export function globeData(lang: Lang, all = investors()) {
  const today = generatedAt;
  const points: GlobePoint[] = all.flatMap((i) => {
    if (!i.country) return [];
    const loc = locate(i.city, i.country); if (!loc) return [];
    return [{ id: i.id, n: i.name, t: i.type, c: i.country, cc: flagCode(i.country), city: i.city || '', lat: loc[0], lng: loc[1], precise: loc[2] ? 1 : 0, r: i.region, f: i.focusTags, ck: `${loc[0]},${loc[1]}`,
      st: stageLine(i, lang), chk: i.check || '', a12: i.active12m, tot: i.dealsTotal, last: i.lastDeal, open: isOpen(i, today) ? 1 : 0, lead: i.leadsRounds ? 1 : 0,
      deals: i.deals.map((d) => ({ id: d.id, e: d.entity, amt: d.amount, c: d.country || '', kind: d.kind, lead: d.lead && d.role === 'investor' ? 1 : 0, role: d.role })),
      port: i.portfolio.map((p) => [p[1], p[2], p[3]] as [string, string, number | null]), focus: lang === 'de' ? i.focusDe || i.focus : i.focus, url: i.url, cbi: i.enrich?.cbi?.url || '', cb: i.enrich?.cb?.permalink ? `https://www.crunchbase.com/organization/${i.enrich.cb.permalink}` : '' }];
  });
  const arcs: GlobeArc[] = points.flatMap((p) => p.deals.filter((d) => d.c && d.c !== p.c).flatMap((d) => { const c = countryCentre(d.c); return c ? [{ id: p.id, t: p.t, sLat: p.lat, sLng: p.lng, eLat: c[0], eLng: c[1], e: d.e, c: d.c }] : []; }));
  return { points, arcs, unplaced: all.length - points.length };
}

/** Per tour stop: how many investors, open calls and deal arcs, the most active names and the dominant focus. */
export interface TourStat { n: number; open: number; arcs: number; top: { n: string; a12: number }[]; focus: string[] }
export const TOUR_REGIONS: Record<string, string[]> = { eu: ['DACH', 'Europe'], uk: ['UK'], na: ['North America'], apac: ['Asia-Pacific'], me: ['Middle East'] };
export function tourStats(points: GlobePoint[], arcs: GlobeArc[], lang: Lang): Record<string, TourStat> {
  const out: Record<string, TourStat> = {};
  for (const [key, regions] of Object.entries(TOUR_REGIONS)) {
    const pts = points.filter((p) => regions.includes(p.r)); const ids = new Set(pts.map((p) => p.id));
    const tally = new Map<string, number>(); for (const p of pts) for (const f of p.f) tally.set(f, (tally.get(f) || 0) + 1);
    out[key] = { n: pts.length, open: pts.filter((p) => p.open).length, arcs: arcs.filter((a) => ids.has(a.id)).length,
      top: [...pts].sort((a, b) => b.a12 - a.a12 || b.tot - a.tot).slice(0, 3).filter((p) => p.a12 > 0).map((p) => ({ n: p.n, a12: p.a12 })),
      focus: [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => FOCUS_LABEL[lang][f as FocusKey]) };
  }
  return out;
}
