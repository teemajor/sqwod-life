// Sqwod Deal Tracker download (approved deals only). Built statically at /data/deals.json.
import type { APIRoute } from 'astro';
import { liveAll, generatedAt, FX } from '../../lib/deals';

export const GET: APIRoute = () => {
  const deals = liveAll().sort((a, b) => b.date.localeCompare(a.date)).map(({ status, reports, ...d }) => ({ ...d, reports: reports.length }));
  const body = { name: 'Sqwod Deal Tracker', url: 'https://sqwod.life/en/intelligence/deals/', license: 'Cite as: Sqwod Intelligence, sqwod.life', asOf: generatedAt, fxToUsd: FX, deals };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
