// Build-time data for the Investor Globe (shared by the full page and the hero banner on the list page).
import { investors, STAGES, STAGE_LABEL, type Investor } from './investors';
import { locate, countryCentre } from './geo';
import { flagCode } from './flags';
import { generatedAt } from './deals';
import type { Lang } from '../i18n/ui';

export const GLOBE_COLORS: Record<string, string> = { vc: '#7FB58C', corporate: '#E3B65C', accelerator: '#6FB6E8', competition: '#D08BE0', grant: '#F2EFE8', buyer: '#E57A7A' };

export interface GlobePoint {
  id: string; n: string; t: string; c: string; cc: string; city: string; lat: number; lng: number; precise: number; r: string; f: string[];
  st: string; chk: string; a12: number; tot: number; last: string; open: number; lead: number;
  deals: { id: string; e: string; amt: string; c: string; kind: string; lead: number; role: string }[];
  port: [string, string, number | null][]; focus: string; url: string; cbi: string; cb: string;
}
export interface GlobeArc { id: string; t: string; sLat: number; sLng: number; eLat: number; eLng: number; e: string; c: string }

const isOpen = (i: Investor, today: string) => !!i.apply && (i.apply.status === 'rolling' || (i.apply.status === 'open' && (!i.apply.deadline || i.apply.deadline >= today)));
const stageLine = (i: Investor, lang: Lang) => i.stage || (i.stages.length ? (i.stages.length === STAGES.length ? (lang === 'de' ? 'alle Phasen' : 'any stage') : `${STAGE_LABEL[lang][i.stages[0]]}${i.stages.length > 1 ? ` – ${STAGE_LABEL[lang][i.stages[i.stages.length - 1]]}` : ''}`) : '');

/** Points (one per placed investor, same-city dots spread on a tiny spiral) and arcs (HQ → country of a tracker deal elsewhere). */
export function globeData(lang: Lang, all = investors()) {
  const today = generatedAt;
  const perCity = new Map<string, number>();
  const points: GlobePoint[] = all.flatMap((i) => {
    if (!i.country) return [];
    const loc = locate(i.city, i.country); if (!loc) return [];
    const key = `${loc[0]},${loc[1]}`; const k = perCity.get(key) || 0; perCity.set(key, k + 1);
    const r = 0.28 * Math.sqrt(k), a = k * 2.4;
    return [{ id: i.id, n: i.name, t: i.type, c: i.country, cc: flagCode(i.country), city: i.city || '', lat: loc[0] + r * Math.cos(a), lng: loc[1] + r * Math.sin(a) / Math.max(0.3, Math.cos(loc[0] * Math.PI / 180)), precise: loc[2] ? 1 : 0, r: i.region, f: i.focusTags,
      st: stageLine(i, lang), chk: i.check || '', a12: i.active12m, tot: i.dealsTotal, last: i.lastDeal, open: isOpen(i, today) ? 1 : 0, lead: i.leadsRounds ? 1 : 0,
      deals: i.deals.map((d) => ({ id: d.id, e: d.entity, amt: d.amount, c: d.country || '', kind: d.kind, lead: d.lead && d.role === 'investor' ? 1 : 0, role: d.role })),
      port: i.portfolio.map((p) => [p[1], p[2], p[3]] as [string, string, number | null]), focus: lang === 'de' ? i.focusDe || i.focus : i.focus, url: i.url, cbi: i.enrich?.cbi?.url || '', cb: i.enrich?.cb?.permalink ? `https://www.crunchbase.com/organization/${i.enrich.cb.permalink}` : '' }];
  });
  const arcs: GlobeArc[] = points.flatMap((p) => p.deals.filter((d) => d.c && d.c !== p.c).flatMap((d) => { const c = countryCentre(d.c); return c ? [{ id: p.id, t: p.t, sLat: p.lat, sLng: p.lng, eLat: c[0], eLng: c[1], e: d.e, c: d.c }] : []; }));
  return { points, arcs, unplaced: all.length - points.length };
}
