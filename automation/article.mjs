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
