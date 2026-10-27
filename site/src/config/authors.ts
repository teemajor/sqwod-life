// Bylines (27 Oct 2026): every report and article carries Tee Major's name.
// House author strings written by the pipelines ("Sqwod", "sqwod.life", "Sqwod Intelligence")
// resolve to him as the editor responsible for the page. A real guest author keeps their name.
import type { Lang } from '../i18n/ui';

export const EDITOR = {
  name: 'Tee Major',
  img: '/team/tee-major.jpg',
  role: { en: 'Founder & editor, Sqwod', de: 'Gründer & Herausgeber, Sqwod' } as Record<Lang, string>,
  about: (lang: Lang) => `/${lang}/about`,
  sameAs: ['https://www.youtube.com/@TeeMajor', 'https://x.com/Tee_Major', 'https://sqwod.life/en/about'],
};
const HOUSE = new Set(['sqwod', 'sqwod.life', 'sqwod intelligence', 'sqwod editorial', 'tee major']);
export const isHouseAuthor = (author?: string) => !author || HOUSE.has(author.trim().toLowerCase());
export const authorName = (author?: string) => (isHouseAuthor(author) ? EDITOR.name : String(author));
export const authorLd = (author?: string) => (isHouseAuthor(author)
  ? { '@type': 'Person', name: EDITOR.name, url: 'https://sqwod.life/en/about', jobTitle: 'Founder & editor, Sqwod', sameAs: EDITOR.sameAs }
  : { '@type': 'Person', name: String(author) });
// One honest line on how pages are made (EU AI Act Art. 50 transparency): AI drafts, a named editor answers for it.
export const howMade = (lang: Lang) => (lang === 'de'
  ? 'Recherchiert und vorformuliert mit KI aus den verlinkten Quellen. Verantwortlicher Redakteur: Tee Major.'
  : 'Researched and drafted with AI from the linked sources. Tee Major is the editor responsible for this page.');
