// Sqwod Daily quality guards (Oct 2026). Deterministic backstops for defects
// found in the 3 to 16 Oct 2026 issues, shared by ingest.mjs and cascade.mjs:
//
//  1. Google News redirect links: 101 of 133 "read more" links pointed at
//     news.google.com instead of the publisher. EU readers hit a Google consent
//     wall first. resolveGoogleNews() turns them into the real article URL.
//  2. Fitt Insider's tagline ("the business of fitness") leaking into copy.
//  3. Clickbait phrasing ("has Garmin sweating", "cheat sheet").
//  4. Obituaries spun into a business lesson.
//  5. Em dashes (Tee's house style: none).
//  6. The Gear rec was always the alphabetically first review (AG1, 12 days
//     running). pickGearRec() picks a topical, recently unused, published review.
//  7. Slang and clever jargon ("gravy train", "serious flex"): the Daily is news,
//     told in plain words (Tee, 19 Oct 2026).
//
// Rule from July: prompt rules alone are not enough; every guard here is code.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- 1. links
const GN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
// Pre-set consent cookie so EU runners are not bounced to consent.google.com.
const GN_COOKIE = 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+';

export const isGoogleNews = (u) => /^https?:\/\/news\.google\.com\/(rss\/)?articles\//.test(String(u || ''));

// Google News article links are opaque ids. The publisher URL comes from the
// same "garturlreq" call the Google News web app makes. Returns the original
// URL on any failure, so a broken resolver never drops a story.
export async function resolveGoogleNews(url, { timeoutMs = 12000 } = {}) {
  if (!isGoogleNews(url)) return url;
  try {
    const id = new URL(url).pathname.split('/').pop();
    const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
      headers: { 'user-agent': GN_UA, cookie: GN_COOKIE }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
    }).then((r) => r.text());
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return url;
    const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
    const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST', body, signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': GN_UA, cookie: GN_COOKIE, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    }).then((r) => r.text());
    const m = res.match(/\\"garturlres\\",\\"(https?:\/\/[^\\"]+)/);
    return m ? m[1] : url;
  } catch { return url; }
}

// Resolve many links with a small concurrency cap (polite to Google).
export async function resolveAll(urls, concurrency = 4) {
  const out = new Array(urls.length);
  let i = 0;
  const worker = async () => { while (i < urls.length) { const k = i++; out[k] = await resolveGoogleNews(urls[k]); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
}

// ---------------------------------------------------- 2-4. phrasing checks
// Fitt Insider's tagline. Never in Sqwod-visible copy, in either language.
const BANNED = /\b(the )?business of fitness\b|\bBusiness der Fitness\b/i;
// Clickbait and hype. Kept short and specific so normal words don't trip it.
const CLICKBAIT = /\b(has \w+ sweating|\w+ sweating|going nowhere|game[- ]?changer|you won'?t believe|shocking|mind[- ]?blowing|jaw[- ]?dropping|cheat sheet|crushing it|destroys|slams|must[- ]know|moving the needle|nobody is talking about|here'?s why it matters)\b|\b(der Hammer|krass|unglaublich|schockierend|Gamechanger)\b/i;
const OBIT = /\b(remembered as|dies at|died|passed away|obituary|in memoriam|mourns|death of|verstorben|gestorben|trauert um|nachruf)\b/i;

export const hasBanned = (t) => BANNED.test(String(t || ''));
export const hasClickbait = (t) => CLICKBAIT.test(String(t || ''));
export const isObituary = (t) => OBIT.test(String(t || ''));
// Slang, idioms and clever jargon (Oct 2026, Tee: "it's news, so a real update with
// facts"). Each was in a shipped issue. Plain words only.
const SLANG = /\b(gravy train|sleeping on|serious flex|\bflex\b|duct[- ]?tap\w*|stickiness|secret sauce|no[- ]brainer|low[- ]hanging fruit|double down|doubling down|hot take|vibe\w*|go move something|cross-border legs|has legs|crush(?:es|ed)? it|level up|10x|deep dive|needle[- ]mover|unlock(?:s|ed)? (?:growth|value)|lean in|on fire|killing it|big swing|move fast|table stakes|playbook|north star|tailwinds?|headwinds?|bottom line is|here's the kicker|plot twist|spoiler|buckle up|let that sink in|mic drop)\b/i;
export const hasSlang = (t) => SLANG.test(String(t || ''));
export const phraseProblems = (t) => [
  hasBanned(t) && 'uses Fitt Insider\'s tagline "the business of fitness"',
  hasClickbait(t) && `clickbait phrase "${String(t).match(CLICKBAIT)[0]}"`,
  hasSlang(t) && `slang or jargon "${String(t).match(SLANG)[0]}": say it in plain words`,
].filter(Boolean);

// Last-resort deterministic fix if an LLM rewrite is unavailable.
export function stripPhrases(t) {
  return String(t || '')
    .replace(/\bthe business of fitness\b/gi, 'the fitness industry')
    .replace(/\bbusiness of fitness\b/gi, 'fitness industry')
    .replace(/\bBusiness der Fitness\b/g, 'Fitnessbranche');
}

// ------------------------------------------------- 8. language (EN never ships German)
const DE_HITS = /\b(der|die|das|und|für|mit|von|nicht|ein|eine|einen|sich|sind|wird|werden|hat|haben|bei|auf|aus|nach|über|sollte|dieser|diesen|jahr|neue|neuen|legt|bringt|lädt|wer|echtes|direkt|am|im|zum|zur|den|dem|des|ist|auch|noch|nur|wie|oder|ohne|gute|zu|bis|uhr|anmelden)\b|[äöüß]/gi;
const EN_HITS = /\b(the|and|for|with|from|not|has|have|are|will|its|this|that|who|should|new|your|their|about|brings|worth|look)\b/gi;
export function wrongLanguage(text, lang) {
  const s = String(text || '');
  const de = (s.match(DE_HITS) || []).length;
  const en = (s.match(EN_HITS) || []).length;
  return lang === 'en' ? de > en : en > de + 1; // DE copy tolerates English loanwords
}
// Sentence-level check for longer text (audio script, framing sections). One German
// sentence inside an English script is exactly what the voice read out on 19 Oct 2026.
// Function words only here: umlauts in place names (Düsseldorf, München) must not make
// an English sentence look German.
const DE_WORDS = new RegExp(DE_HITS.source.replace('|[äöüß]', ''), 'gi');
export function foreignSentences(text, lang) {
  return String(text || '').split(/\n+|(?<=[.!?])\s+(?=[A-ZÄÖÜ"„])/).filter((s) => {
    const de = (s.match(DE_WORDS) || []).length;
    const en = (s.match(EN_HITS) || []).length;
    return lang === 'en' ? de >= 2 && de > en : en >= 3 && en > de + 1;
  });
}

// ----------------------------------------------------------- 5. em dashes
// " — " between clauses becomes ": " when it introduces what follows, else ", ".
// A dash pair used as brackets (" — x — ") becomes commas. Never touches URLs.
export function noEmDash(t) {
  let s = String(t ?? '');
  if (!s.includes('—') || /^https?:\/\//.test(s)) return s;
  s = s.replace(/\s+—\s+([^—]{1,60}?)\s+—\s+/g, ', $1, ');           // bracketing pair
  s = s.replace(/\s+—\s+/g, (m, off) => (s.slice(0, off).includes(':') ? ', ' : ': '));
  s = s.replace(/—/g, ', ');
  return s.replace(/,\s*,/g, ',').replace(/:\s*:/g, ':');
}

// ------------------------------------------------------------- 6. gear rec
const STOP = new Set(['this', 'that', 'with', 'from', 'your', 'their', 'into', 'have', 'will', 'more', 'than', 'what', 'when', 'which', 'about', 'review', 'best', 'price', 'test', 'fitness', 'coach', 'coaches', 'studio', 'daily', 'sqwod', 'über', 'eine', 'einen', 'nicht', 'oder', 'auch', 'sind', 'wird', 'mehr']);
const toks = (s) => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9äöüß\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));

function frontmatter(file) {
  const raw = readFileSync(file, 'utf8');
  const fm = raw.split(/^---\s*$/m)[1] || '';
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.replace(/^["']|["']$/g, '').trim();
  const tags = (fm.match(/^tags:\s*\[(.*)\]/m) || [])[1] || '';
  return { get, tags };
}

// Slugs used as the Gear rec in the last `days` issues of this language.
export function recentGearSlugs(dailyDir, lang, days = 14) {
  if (!existsSync(dailyDir)) return new Set();
  const files = readdirSync(dailyDir).filter((f) => f.endsWith(`.${lang}.md`)).sort().slice(-days);
  const used = new Set();
  for (const f of files) {
    const m = readFileSync(join(dailyDir, f), 'utf8').match(/url:\s*"\/\w\w\/verified\/([^"]+)"/);
    if (m) used.add(m[1]);
  }
  return used;
}

// Pick the review that best matches today's items; skip drafts and anything
// used in the last 14 issues. Ties and no-overlap days rotate by date so the
// rec still changes daily.
// Descriptive words inside product names that say nothing about the brand.
const NAME_STOP = new Set(['high', 'waist', 'standard', 'plus', 'smart', 'wireless', 'adjustable', 'series', 'original', 'classic', 'ultra', 'lite', 'light', 'core', 'edition', 'essential', 'women', 'protein', 'drink', 'vital', 'short', 'shorts', 'meal', 'ready', 'bike', 'ring', 'watch', 'bar', 'gold', 'impact']);
const dayPick = new Map();   // date -> slug, so EN and DE feature the same product
export function pickGearRec({ reviewsDir, dailyDir, lang, items, date }) {
  let files = [];
  try { files = readdirSync(reviewsDir).filter((f) => f.endsWith(`.${lang}.md`)).sort(); } catch { return null; }
  const recent = recentGearSlugs(dailyDir, lang);
  const day = toks(items.map((i) => `${i.headline || ''} ${i.dek || ''}`).join(' '));
  const seed = [...String(date || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const cands = [];
  for (const f of files) {
    const { get, tags } = frontmatter(join(reviewsDir, f));
    if (get('draft') === 'true') continue;
    const slug = get('urlSlug') || f.replace(`.${lang}.md`, '');
    if (recent.has(slug)) continue;
    const product = get('productName') || get('title') || slug;
    // A brand/product name match ("Suunto", "Oura") is strong evidence; a shared
    // category word ("training", "recovery") is weak.
    const name = new Set([...toks(product)].filter((w) => !NAME_STOP.has(w)));
    const ctx = toks(`${get('category') || ''} ${get('type') || ''} ${tags}`);
    let score = 0;
    for (const w of name) if (day.has(w)) score += 3;
    for (const w of ctx) if (!name.has(w) && day.has(w)) score += 1;
    cands.push({ slug, product, score });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const top = cands.filter((c) => c.score === cands[0].score);
  const pick = cands.find((c) => c.slug === dayPick.get(date)) || top[seed % top.length];
  dayPick.set(date, pick.slug);
  return {
    label: 'Gear', affiliate: true, url: `/${lang}/verified/${pick.slug}`,
    text: lang === 'de' ? `${pick.product}: unser Urteil und der beste Preis.` : `${pick.product}: our verdict and the best price.`,
  };
}
