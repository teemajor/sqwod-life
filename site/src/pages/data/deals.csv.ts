// Sqwod Deal Tracker download (approved deals only). Built statically at /data/deals.csv.
// The tracker page builds a filtered copy in the browser from the same csvRow().
import type { APIRoute } from 'astro';
import { liveAll, CSV_HEADER, csvRow } from '../../lib/deals';

export const GET: APIRoute = () => {
  const rows = liveAll().sort((a, b) => b.date.localeCompare(a.date)).map(csvRow);
  return new Response([CSV_HEADER, ...rows].join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
