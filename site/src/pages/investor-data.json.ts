// Compact Investor Map rows for the AI pitch Worker (infrastructure/investor-pitch). Rebuilt with the site.
import type { APIRoute } from 'astro';
import { investors } from '../lib/investors';
import { generatedAt } from '../lib/deals';

export const GET: APIRoute = () => {
  const rows = investors().map((i) => ({
    id: i.id, name: i.name, type: i.type, country: i.country || null, city: i.city || null, region: i.region,
    stages: i.stages, check: i.check || null, typicalRoundUsd: i.typicalRound, focus: i.focus.slice(0, 220), tags: i.focusTags,
    portfolio: i.portfolio.map((p) => p[1]), trackerDeals: i.deals.slice(0, 4).map((d) => d.entity), active12m: i.active12m, lastDeal: i.lastDeal || null,
    openCall: !!i.apply && (i.apply.status === 'rolling' || i.apply.status === 'open'), leadsRounds: i.leadsRounds, investsAbroad: i.abroad,
  }));
  return new Response(JSON.stringify({ generatedAt, count: rows.length, investors: rows }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
