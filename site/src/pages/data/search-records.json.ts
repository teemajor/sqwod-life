// Search records for rows that have no page of their own (jobs, deals, investors).
// scripts/search-index.mjs reads this file from dist/ after the build and adds each
// record to the Pagefind index with an anchor URL into the list page. Both languages.
import type { APIRoute } from 'astro';
import { liveJobs, brandOf, payMonthly } from '../../lib/jobs';
import { liveAll } from '../../lib/deals';
import { investors, TYPE_LABEL } from '../../lib/investors';

const KIND = { en: { job: 'Job', deal: 'Deal', investor: 'Investor' }, de: { job: 'Job', deal: 'Deal', investor: 'Investor' } };
const DEAL_KIND = {
  en: { raise: 'raised', acquisition: 'acquired', valuation: 'valued at', ipo: 'IPO', shutdown: 'closed' },
  de: { raise: 'sammelt ein', acquisition: 'übernommen', valuation: 'bewertet mit', ipo: 'Börsengang', shutdown: 'geschlossen' },
};

export const GET: APIRoute = () => {
  const out: { url: string; lang: 'en' | 'de'; kind: string; title: string; sub?: string; content: string; date?: string }[] = [];
  for (const lang of ['en', 'de'] as const) {
    for (const j of liveJobs()) {
      const b = brandOf(j);
      const sum = (lang === 'de' ? j.summaryDe : j.summaryEn) || '';
      const pay = payMonthly(j);
      out.push({
        url: `/${lang}/jobs/#job-${j.id}`, lang, kind: KIND[lang].job,
        title: j.title, sub: [b.short, j.city || j.region, j.payText || (pay ? `${Math.round(pay)} €/month` : '')].filter(Boolean).join(' · '),
        content: [j.title, b.name, b.short, j.city, j.region, j.type, j.employment, j.payText, sum].filter(Boolean).join('. '),
        date: j.postedAt || j.seenAt,
      });
    }
    for (const d of liveAll()) {
      const note = (lang === 'de' ? d.noteDe : d.note) || d.note || '';
      const verb = DEAL_KIND[lang][d.kind] || d.kind;
      out.push({
        url: `/${lang}/intelligence/deals/#deal-${d.id}`, lang, kind: KIND[lang].deal,
        title: `${d.entity} ${verb}${d.amount ? ` ${d.amount}` : ''}`.trim(), sub: [d.category, d.region, d.date].filter(Boolean).join(' · '),
        content: [d.entity, verb, d.amount, note, (d.investors || []).join(', '), d.acquirer, d.region, d.country, d.category].filter(Boolean).join('. '),
        date: d.date,
      });
    }
    for (const i of investors()) {
      out.push({
        url: `/${lang}/intelligence/investors/#${i.id}`, lang, kind: KIND[lang].investor,
        title: i.name, sub: [TYPE_LABEL[lang][i.type], i.city, i.country, i.check].filter(Boolean).join(' · '),
        content: [i.name, TYPE_LABEL[lang][i.type], i.country, i.city, lang === 'de' ? i.focusDe : i.focus, i.stage, i.check, (i.aliases || []).join(', ')].filter(Boolean).join('. '),
      });
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
