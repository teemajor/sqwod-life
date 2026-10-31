// Build-time social preview cards: /og/<lang>/<kind>/<slug>.png (see src/lib/og.ts).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type OgCard } from '../../../../lib/og';
import { liveDeals } from '../../../../lib/deals';
import { investors } from '../../../../lib/investors';

const fmtDay = (d: string | Date, lang: string) => (d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T12:00:00Z')).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export async function getStaticPaths() {
  const out: { params: { lang: string; kind: string; slug: string }; props: { card: OgCard } }[] = [];
  for (const a of await getCollection('articles')) {
    const d = a.data; const de = d.lang === 'de';
    const report = d.format === 'report' || d.format === 'index';
    if (!report && d.format !== 'analysis' && d.format !== 'field-note') continue;
    const evidence = d.type === 'evidence';
    const stat = d.hero?.stat ?? d.figures?.[0]?.value;
    const statLabel = d.hero?.statLabel ?? d.figures?.[0]?.label;
    out.push({
      params: { lang: d.lang, kind: report ? 'intelligence' : 'analysis', slug: d.urlSlug },
      props: { card: {
        kicker: report ? (de ? 'Sqwod Intelligence · Report' : 'Sqwod Intelligence · Report') : evidence ? 'Sqwod Evidence' : (de ? 'Sqwod Analyse' : 'Sqwod Analysis'),
        title: d.title, stat: stat ? String(stat) : undefined, statLabel: statLabel ? String(statLabel) : undefined, byline: true,
        footer: `sqwod.life/${d.lang}/${report ? 'intelligence' : evidence ? 'evidence' : 'articles'}`,
      } },
    });
  }
  for (const i of await getCollection('daily')) {
    const d: any = i.data;
    if (d.status && d.status !== 'published') continue;
    out.push({
      params: { lang: d.lang, kind: 'daily', slug: d.urlSlug },
      props: { card: {
        kicker: `Sqwod Daily · ${fmtDay(d.date || d.urlSlug, d.lang)}`,
        title: d.summary || d.title,
        bullets: (d.items || []).map((x: any) => x.headline).filter(Boolean),
        footer: d.lang === 'de' ? 'Jeden Werktag · 5 Minuten' : 'Every weekday · 5 minutes',
      } },
    });
  }
  const n = liveDeals().length;
  for (const lang of ['en', 'de']) out.push({
    params: { lang, kind: 'deals', slug: 'index' },
    props: { card: {
      kicker: 'Sqwod Deal Tracker',
      title: lang === 'de' ? 'Jede Finanzierung, Übernahme und jeder Börsengang in Fitness und Wellness' : 'Every raise, acquisition and IPO in fitness and wellness',
      stat: n >= 10 ? String(n) : undefined, statLabel: lang === 'de' ? 'Deals erfasst, von Hand geprüft' : 'deals tracked, checked by hand',
      footer: `sqwod.life/${lang}/intelligence/deals`,
    } },
  });
  const ni = investors().length;
  for (const lang of ['en', 'de']) out.push({
    params: { lang, kind: 'investors', slug: 'index' },
    props: { card: {
      kicker: 'Sqwod Investor Map',
      title: lang === 'de' ? 'Wer Fitness und Wellness finanziert: Fonds, Accelerators, Wettbewerbe und Käufer' : 'Who funds fitness and wellness: funds, accelerators, competitions and buyers',
      stat: ni >= 20 ? String(ni) : undefined, statLabel: lang === 'de' ? 'Investoren und Programme, mit Quelle' : 'investors and programmes, with the source',
      footer: `sqwod.life/${lang}/intelligence/investors`,
    } },
  });
  // Join landing page (/[lang]/join): the card social posts unfurl to.
  for (const lang of ['en', 'de']) out.push({
    params: { lang, kind: 'join', slug: 'index' },
    props: { card: {
      kicker: lang === 'de' ? 'Sqwod Daily · kostenlos' : 'Sqwod Daily · free',
      title: lang === 'de' ? 'Jeder Deal der Fitnessbranche. Jeden Werktag. In fünf Minuten.' : 'Every fitness deal. Every weekday. Five minutes.',
      stat: n >= 10 ? String(n) : undefined, statLabel: lang === 'de' ? 'Deals seit Juni erfasst, von Hand geprüft' : 'deals tracked since June, checked by hand',
      byline: true,
      footer: `sqwod.life/${lang}/join`,
    } },
  });
  return out;
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard((props as { card: OgCard }).card);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
