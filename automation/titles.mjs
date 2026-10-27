// Article title and structure guards (27 Oct 2026). Pure functions, no network.
//
// Why: an audit of 132 articles found 10 titles that were all some version of
// "Fitness is splitting in two, which side are you on?", 51 that opened with
// "Your ...", and the same three generic subheads in almost every piece. Google
// reads that as near-duplicate pages competing with each other. Fitt Insider,
// Athletech and Health Club Management title news by naming who did what, and
// how much ("WILDE Lands $40M to Scale Protein Snacks").
//
// The rule (Tee, 27 Oct 2026), for lane articles only. The Daily stays a roundup
// and is NOT checked here.
//   1. One lead story per article.
//   2. The title names the company/organisation/person in that story, or one of
//      its numbers. It is never addressed to the reader ("Your studio ...").
//   3. No pick-a-side / are-you-ready / here's-how formulas, no question titles.
//   4. Not a near-copy of any title published in the last 60 articles.
//   5. Subheads say something about this story, not generic section labels.
// Prompt rules alone are not enough (see quality.mjs): every rule here is code.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_TITLE = 70;

// Formulas from the audit. Kept specific so ordinary titles pass.
const GENERIC_EN = new RegExp([
  "^(your|you|you're|you are)\\b",
  'which side',
  'pick (a|your) (lane|side|edge)',
  'split(ting|s)? (in|into) two',
  'fractur(e|es|ing)',
  'splinter(s|ing)?',
  'are you (ready|keeping up|positioned|on|selling|using|actually)',
  "here'?s (how|why|what|the fix|where|the proof)",
  'leaving money on the (table|floor)',
  "(is|are) eating (everything|fitness|wellness|your)",
  'big money is',
  "(isn'?t|is not) (just )?a gym",
  'now what\\??$',
  'fix (that|it)\\.?$',
].join('|'), 'i');

const GENERIC_DE = new RegExp([
  '^(dein|deine|deinen|deinem|deiner|du|ihr|euer|eure)\\b',
  'welche seite',
  'bist du (bereit|dabei)',
  'seid ihr (bereit|dabei)',
  'in zwei (teile|lager|hälften)',
  'zerf[äa]llt',
  'so (geht|klappt|gelingt)',
  'hier ist (der|die|das|wie|warum)',
  'geld (auf dem tisch|liegen)',
  'frisst (alles|die fitness)',
  'das große geld',
].join('|'), 'i');

const GENERIC_HEADS = /^(what'?s (really|actually) (happening|going on|driving this|shifting)|(the )?do[- ]this[- ]now|your do[- ]this[- ]now|do this (now|before|this week)|what (you|to) (should )?(actually )?do (this week|with this|right now|before)|the bottom line|the bigger picture|the problem nobody|the market (just )?(told|is telling|is sending) you|what the (smart money|numbers|deals|headlines) (is|are) (actually )?(saying|telling|buying)|your move|your one move|was (wirklich|eigentlich) (passiert|dahinter steckt)|mach das jetzt|das fazit|was du (jetzt|diese woche) tun (kannst|solltest))/i;

const STOP = new Set(['this', 'that', 'with', 'from', 'your', 'their', 'into', 'have', 'will', 'more', 'than', 'what', 'when', 'which', 'about', 'here', 'heres', 'just', 'now', 'side', 'fitness', 'industry', 'wellness', 'gym', 'gyms', 'studio', 'studios', 'members', 'clients', 'coaches', 'über', 'eine', 'einen', 'nicht', 'oder', 'auch', 'sind', 'wird', 'mehr', 'deine', 'dein', 'fitnessbranche', 'studios']);
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ß\s]/g, ' ').split(/\s+/).filter(Boolean);
export const sigTokens = (s) => new Set(words(s).filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOP.has(w)));

export function jaccard(a, b) {
  const A = sigTokens(a), B = sigTokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

// A near-copy: most significant words shared, or the same first four words.
export function nearDuplicate(title, recentTitles, threshold = 0.5) {
  const head = words(title).slice(0, 4).join(' ');
  for (const r of recentTitles) {
    if (jaccard(title, r) >= threshold) return r;
    if (head.split(' ').length === 4 && words(r).slice(0, 4).join(' ') === head) return r;
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const digits = (s) => (String(s || '').match(/\d+(?:[.,]\d+)?/g) || []).map((d) => d.replace(',', '.'));

// The model declares which name or number from the lead story its title uses.
// Code checks the claim: the anchor must be in the lead story AND in the title.
export function anchorProblems(title, { leadText, entity, number }) {
  const t = norm(title), lead = norm(leadText);
  const okEntity = !!entity && entity.length >= 2 && lead.includes(norm(entity)) && t.includes(norm(entity));
  const leadNums = new Set(digits(leadText));
  const okNumber = !!number && digits(number).some((d) => leadNums.has(d) && digits(title).includes(d));
  if (okEntity || okNumber) return [];
  return ['the title must name the company, organisation or person from the lead story (exactly as the story spells it), or use one of its numbers'];
}

export function titleProblems(title, { lang = 'en', recentTitles = [], leadText = '', entity = '', number = '' } = {}) {
  const t = String(title || '').trim();
  const p = [];
  if (!t) return ['title is empty'];
  if (t.length > MAX_TITLE) p.push(`title is ${t.length} characters; keep it to ${MAX_TITLE}`);
  if (/\?\s*$/.test(t)) p.push('title is a question; state what happened instead');
  if (t.includes('—')) p.push('title uses an em dash');
  const g = (lang === 'de' ? GENERIC_DE : GENERIC_EN).exec(t);
  if (g) p.push(`title uses a generic formula ("${g[0]}"); name who did what instead`);
  if (lang === 'de' && GENERIC_EN.test(t)) p.push('title uses an English formula');
  p.push(...anchorProblems(t, { leadText, entity, number }));
  const dup = nearDuplicate(t, recentTitles);
  if (dup) p.push(`title is too close to a recent article: "${dup}"`);
  return p;
}

export function headingProblems(body) {
  const heads = String(body || '').split('\n').filter((l) => /^#{2,3}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '').trim());
  return heads.filter((h) => GENERIC_HEADS.test(h)).map((h) => `generic subhead "${h}": say something specific to this story`);
}

// Titles and source URLs of the most recent `n` articles in one language.
export function recentArticles(dir, lang, n = 60) {
  if (!existsSync(dir)) return { titles: [], urls: new Set() };
  const rows = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(`.${lang}.md`)) continue;
    const raw = readFileSync(join(dir, f), 'utf8');
    const fm = raw.split(/^---\s*$/m)[1] || '';
    const title = ((fm.match(/^title:\s*(.+)$/m) || [])[1] || '').replace(/^["']|["']$/g, '');
    const date = ((fm.match(/^publishedAt:\s*(.+)$/m) || [])[1] || '').trim();
    const urls = [...fm.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
    rows.push({ title, date, urls });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const top = rows.slice(0, n);
  return { titles: top.map((r) => r.title).filter(Boolean), urls: new Set(top.flatMap((r) => r.urls)) };
}

// Pick ONE lead story the last 60 articles have not covered, plus up to two
// stories on the same subject as context. Returns null if nothing new.
// Among uncovered stories, prefer ones with substance: article text we can cite
// and a concrete deal or number. Thin items (headline only) are never a lead.
const DEAL = /\b(raises?|raised|funding|series [a-e]|acquir\w*|merger|ipo|valuation|übernimmt|übernahme|finanzierung)\b|[$€£]\s?\d|\d+\s?(m|bn|mio|mrd|million|billion|%)\b/i;
export const leadScore = (s) => (s.text ? 2 : 0) + (DEAL.test(`${s.headline} ${s.text || ''}`) ? 2 : 0) + (/\d/.test(s.headline) ? 1 : 0);

export function pickLead(pool, { usedUrls = new Set(), recentTitles = [] } = {}) {
  const open = pool.filter((s) => s.headline && !s.thin && !(s.url && usedUrls.has(s.url)) && !nearDuplicate(s.headline, recentTitles, 0.45));
  // stable sort: score first, then the pool's own order (newest day, ingest rank)
  const lead = open.map((s, i) => [s, i]).sort((a, b) => leadScore(b[0]) - leadScore(a[0]) || a[1] - b[1])[0]?.[0];
  if (!lead) return null;
  const L = sigTokens(lead.headline);
  const context = pool.filter((s) => s !== lead && [...sigTokens(s.headline)].filter((w) => L.has(w)).length >= 2).slice(0, 2);
  return { lead, context };
}
