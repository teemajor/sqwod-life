// Article text for the Sqwod Daily (added 2026-10-19).
//
// Until now the writer only saw each story's HEADLINE. With nothing real to
// report it filled the space with spin, jargon and guesses ("the corporate
// wellness gravy train"). The fix is facts: for every story that makes the
// issue we keep the opening of the article itself, so the Daily can say who did
// what, where, when and how much.
//
// Two sources, best one wins:
//   1. the feed's own summary (RSS <description>/<content:encoded>, Atom <summary>)
//   2. the publisher page: og:description + the first paragraphs of the article
// Cloudflare challenge pages and cookie walls are detected and ignored.
// Every failure returns '' so a blocked site never stops the Daily.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const BLOCKED = /<title>\s*(just a moment|attention required|access denied|are you a robot|security check)|cf-browser-verification|challenges\.cloudflare\.com|captcha/i;
// Paragraphs that are site furniture, not reporting.
const BOILER = /(cookie|newsletter|subscribe|sign up|anmelden|abonnier|datenschutz|privacy|all rights reserved|alle rechte|javascript|advertis|werbung|related articles|read more|weiterlesen|share this|teilen|follow us|folge uns|©)/i;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };
export function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
}
export const stripTags = (s) => decodeEntities(String(s || '').replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Clip to whole sentences, at most `max` characters.
export function clip(text, max = 1400) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

// Feed summary from one RSS <item> / Atom <entry> body.
export function feedSummary(block) {
  const pick = (tag) => (String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')) || [])[1] || '';
  const raw = pick('content:encoded') || pick('description') || pick('summary') || pick('content');
  // decode first: many feeds escape their HTML (&lt;p&gt;)
  const text = stripTags(decodeEntities(raw)).replace(/\s*(The post .* appeared first on .*|Der Beitrag .* erschien zuerst auf .*)$/i, '');
  return clip(text);
}

// Article text from a publisher page. '' when blocked or empty.
export function extractArticle(html) {
  const h = String(html || '');
  if (!h || BLOCKED.test(h.slice(0, 4000))) return '';
  const meta = (name) => stripTags((h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i')) || [])[1] || '');
  const desc = meta('og:description') || meta('description');
  // Prefer the <article> element; fall back to <main>, then the whole body.
  const scope = (h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<main[\s\S]*?<\/main>/i) || [h])[0]
    .replace(/<(nav|header|footer|aside|form|figure|figcaption)[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length >= 60 && !BOILER.test(p));
  const body = [];
  for (const p of paras) { if (body.join(' ').length > 1400) break; if (!body.includes(p)) body.push(p); }
  // Pages often repeat their intro (teaser + body). Drop repeated sentences.
  const seen = new Set();
  const text = body.join(' ').split(/(?<=[.!?])\s+/).filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(' ');
  const out = text.length >= 200 ? (desc && !text.includes(desc.slice(0, 40)) ? `${desc} ${text}` : text) : (desc || text);
  return clip(out);
}

export async function fetchArticle(url, { timeoutMs = 12000 } = {}) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en,de;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return '';
    return extractArticle(await r.text());
  } catch { return ''; }
}

// The richer of the two texts; '' when neither carries real reporting.
export function bestText(...texts) {
  const good = texts.map((t) => String(t || '').trim()).filter((t) => t.length >= 120);
  return good.sort((a, b) => b.length - a.length)[0] || '';
}

// ---- Is the story in the article actually new? (added 2026-10-28) -------------
// The feed date says when a page was published or last touched, not when the thing
// it reports happened. On 28 Oct 2026 that let two old stories through as news:
//   · Xponential's Q4 2024 loss (reported March 2025), republished by a stock app;
//   · the DSSV event of 20 to 23 Oct 2026, from a photo-gallery page updated after it.
// So we read the dates written in the article itself.

const MONTHS = {
  january: 1, jan: 1, januar: 1, jänner: 1, february: 2, feb: 2, februar: 2, march: 3, mar: 3, märz: 3, maerz: 3,
  april: 4, apr: 4, may: 5, mai: 5, june: 6, jun: 6, juni: 6, july: 7, jul: 7, juli: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, oktober: 10, okt: 10, november: 11, nov: 11,
  december: 12, dec: 12, dezember: 12, dez: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const QWORD = { first: 1, second: 2, third: 3, fourth: 4, erste: 1, ersten: 1, zweite: 2, zweiten: 2, dritte: 3, dritten: 3, vierte: 4, vierten: 4, viertes: 4, drittes: 3, zweites: 2, erstes: 1 };
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const okYear = (y) => y >= 2015 && y <= 2035;

// Every date the text states, as { date, kind }. kind: 'day' (a calendar day),
// 'month' (a month and year, dated to its last day) or 'period' (a reporting quarter
// or half, dated to when its results would normally be published: period end + 90 days).
export function datesIn(text) {
  const t = String(text || '');
  const out = [];
  const push = (y, m, d, kind) => { if (okYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31) out.push({ date: utc(y, m, d), kind }); };
  let m;
  // 23 October 2026 · 23. Oktober 2026 · 20 to 23 Oct 2026 (the last day of a range is what we read)
  for (m of t.matchAll(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'))) push(+m[3], MONTHS[m[2].toLowerCase()], +m[1], 'day');
  // October 23, 2026 · Oct. 23 2026
  for (m of t.matchAll(new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'))) push(+m[3], MONTHS[m[1].toLowerCase()], +m[2], 'day');
  // 2026-10-23 · 23.10.2026
  for (m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(+m[1], +m[2], +m[3], 'day');
  for (m of t.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) push(+m[3], +m[2], +m[1], 'day');
  // March 2025 · im März 2025 (not when a day was already matched in front of it)
  for (m of t.matchAll(new RegExp(`(?<!\\d\\.?\\s)\\b(${MON})\\.?\\s+(\\d{4})\\b`, 'gi'))) {
    const y = +m[2], mo = MONTHS[m[1].toLowerCase()];
    if (okYear(y)) push(y, mo, lastDay(y, mo), 'month');
  }
  // Reporting periods: Q4 2024 · fourth quarter of 2024 · viertes Quartal 2024 · H1 2025
  const period = (y, endMonth) => { if (okYear(y)) { const e = utc(y, endMonth, lastDay(y, endMonth)); out.push({ date: new Date(e.getTime() + 90 * 864e5), kind: 'period' }); } };
  for (m of t.matchAll(/\bQ([1-4])\s*(?:of\s+|FY\s*)?'?(\d{4})\b/gi)) period(+m[2], +m[1] * 3);
  for (m of t.matchAll(/\b(first|second|third|fourth)[\s-]quarter(?:\s+of)?\s+(\d{4})\b/gi)) period(+m[2], QWORD[m[1].toLowerCase()] * 3);
  for (m of t.matchAll(/\b(erste[ns]?|zweite[ns]?|dritte[ns]?|vierte[ns]?)\s+Quartal(?:s)?\s+(\d{4})\b/gi)) period(+m[2], (QWORD[m[1].toLowerCase()] || 4) * 3);
  for (m of t.matchAll(/\bH([12])\s+(\d{4})\b/gi)) period(+m[2], +m[1] * 6);
  return out;
}

const EVENT_RX = /\b(event|conference|congress|summit|expo|trade show|convention|festival|awards?|gala|webinar|kongress|messe|tagung|veranstaltung|branchentreff\w*|jahrestreffen|gipfel|fachtagung)\b/i;

// Why this story is not news any more, or '' when it may run.
// today: 'YYYY-MM-DD'. Undated text is never called stale: missing dates are not proof.
export function staleReason(text, today, headline = '') {
  const dates = datesIn(text);
  if (!dates.length) return '';
  const now = Date.parse(`${today}T00:00:00Z`);
  const newest = Math.max(...dates.map((d) => d.date.getTime()));
  const ageDays = (now - newest) / 864e5;
  const iso = new Date(newest).toISOString().slice(0, 10);
  // Nothing in the article is less than ~6 weeks old: it reports old news.
  if (ageDays > 45) return `newest date in the article is ${iso}`;
  // An event whose dates are all over: an announcement or photo recap of a past event.
  if (EVENT_RX.test(`${headline} ${text.slice(0, 600)}`) && dates.every((d) => d.kind === 'day') && ageDays > 3) {
    return `event already took place (last date ${iso})`;
  }
  return '';
}

// Paid content labelled as such by the publisher: "-Anzeige-" (fitness MANAGEMENT,
// 27 Oct 2026, the Precor Glutebuilder piece), "Sponsored content", "Advertorial".
// A labelled ad is never news, and German law requires it stays labelled.
const AD_RX = /-\s?Anzeige\s?-|\[Anzeige\]|\(Anzeige\)|\bAdvertorial\b|\bSponsored (?:content|post|article|feature)\b|\bPaid (?:post|partnership|content)\b|\bPromoted content\b/i;
export function isLabelledAd(text) { return AD_RX.test(String(text || '').slice(0, 1500)); }
