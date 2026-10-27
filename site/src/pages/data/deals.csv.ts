// Sqwod Deal Tracker download (approved deals only). Built statically at /data/deals.csv.
import type { APIRoute } from 'astro';
import { liveDeals } from '../../lib/deals';

const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const GET: APIRoute = () => {
  const cols = ['date', 'company', 'type', 'amount', 'currency', 'amount_usd_approx', 'country', 'region', 'category', 'summary', 'source_url', 'sqwod_daily'];
  const rows = liveDeals().sort((a, b) => b.date.localeCompare(a.date)).map((d) => [d.date, d.entity, d.kind, d.amount, d.currency, d.amountUsd, d.country, d.region, d.category, d.note, d.url, `https://sqwod.life${d.issue}`].map(cell).join(','));
  return new Response([cols.join(','), ...rows].join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
