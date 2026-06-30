#!/usr/bin/env node
/**
 * Sqwod Daily email (v3) — the newsletter IS the product. A self-contained,
 * Morning-Brew-style read that teaches, gives actions, entertains, and connects
 * dots. Full section set: Money Movement · Connect the Dots · The Rundown ·
 * Policy Watch · Stat · Sponsor (the only paid click-out) · Sqwod Recs · Play ·
 * Meanwhile · Share Sqwod (referral). Signature movement-glyph GIFs + imagery.
 *
 *   node automation/newsletter.mjs --date=2026-06-19 [--lang=en]
 * Output: site/public/email/<date>-<lang>.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILY = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const OUT = join(__dirname, '..', 'site', 'public', 'email');
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');
// Email links MUST be absolute (relative paths collapse to http:///… in inboxes).
// External http(s) URLs pass through; "/en/play" → SITE+"/en/play"; "verified/x" → SITE+"/<lang>/verified/x".
// Internal email links need a TRAILING SLASH — Astro's canonical is /en/play/, and the
// no-slash form 301-redirects, which Gmail's link proxy can turn into a 404.
const slashed = (path) => /\.[a-z0-9]+$/i.test(path) || /[?#]/.test(path) || path.endsWith('/') ? path : path + '/';
const abs = (u, lang) => { if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; const p = u.startsWith('/') ? u : `/${lang}/${u}`; return SITE + slashed(p); };
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// ---- generalized frontmatter reader for our controlled schema ----
const OBJ = new Set(['sponsor', 'connectDots', 'policyWatch', 'stat', 'play', 'move']);
const ARR = new Set(['moneyMoves', 'recs', 'items']);
const jval = (s) => { const m = s.match(/"(?:[^"\\]|\\.)*"/); return m ? JSON.parse(m[0]) : (s.trim() || ''); };
function parseIssue(file) {
  const text = readFileSync(file, 'utf8');
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const out = { items: [], moneyMoves: [], recs: [] };
  let mode = null, cur = null;
  for (const raw of fm.split('\n')) {
    if (!raw.trim()) continue;
    const top = raw.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (top && !raw.startsWith(' ')) {
      const [, key, rest] = top;
      if (OBJ.has(key) && !rest.trim()) { out[key] = {}; mode = ['obj', key]; cur = out[key]; continue; }
      if (ARR.has(key) && !rest.trim()) { out[key] = []; mode = ['arr', key]; cur = null; continue; }
      out[key] = jval(rest); mode = null; continue;
    }
    if (!mode) continue;
    if (mode[0] === 'obj') {
      const m = raw.match(/^\s+([A-Za-z]\w*):\s*(.+)$/); if (m) cur[m[1]] = jval(m[2]);
    } else { // arr
      const dash = raw.match(/^\s*-\s*([A-Za-z]\w*):\s*(.+)$/);
      if (dash) { cur = { [dash[1]]: jval(dash[2]) }; out[mode[1]].push(cur); continue; }
      const m = raw.match(/^\s+([A-Za-z]\w*):\s*(.+)$/); if (m && cur) cur[m[1]] = jval(m[2]);
    }
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// palette (light email)
const INK = '#0e0e10', G1 = '#2c2c31', G2 = '#5b5b61', G4 = '#9a9aa1', LINE = '#e4e4e7', CHALK = '#ffffff', PANEL = '#f6f6f7', UP = '#1c7d3f', DOWN = '#b3261e';
const F = '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const asset = (f) => `${SITE}/email-assets/${f}`;

const T = {
  en: { view: 'View online', sub: 'Subscribe', shop: 'Shop', presented: 'Presented by', money: 'Money movement', dots: 'Connect the dots', rundown: 'The rundown', policy: 'Policy watch', stat: 'Stat', recs: 'Sqwod recs', play: 'Play', meanwhile: 'Meanwhile in fitness', sponsored: 'Sponsored', learn: 'Learn more', read: 'Read', share: 'Share Sqwod, get swag', shareBody: 'Forward your link. Hit milestones, earn Sqwod gear — stickers, tee, hoodie. We count the referrals for you.', refcount: 'Your referrals', shareBtn: 'Share your link', listen: 'Prefer to listen? Play the 5-min audio', subH: 'Forwarded this? Get it yourself', subP: 'Five minutes, every weekday. Free.', subBtn: 'Subscribe free', src: 'Source', disc: 'Sponsored content is clearly labeled. Sqwod editorial is independent of sponsors.', unsub: 'Unsubscribe', kinds: { raise: 'Raise', acquisition: 'Acquired', valuation: 'Valuation', ipo: 'IPO', shutdown: 'Shutdown' } },
  de: { view: 'Im Browser', sub: 'Abonnieren', shop: 'Shop', presented: 'Präsentiert von', money: 'Geldbewegung', dots: 'Punkte verbinden', rundown: 'Der Rundown', policy: 'Politik-Radar', stat: 'Zahl des Tages', recs: 'Sqwod-Tipps', play: 'Spielen', meanwhile: 'Nebenbei in der Fitnesswelt', sponsored: 'Anzeige', learn: 'Mehr erfahren', read: 'Lesen', share: 'Teile Sqwod, hol dir Swag', shareBody: 'Leite deinen Link weiter. Erreiche Meilensteine, verdiene Sqwod-Gear — Sticker, Shirt, Hoodie. Wir zählen die Empfehlungen für dich.', refcount: 'Deine Empfehlungen', shareBtn: 'Link teilen', listen: 'Lieber hören? Spiel die 5-Min-Audio', subH: 'Weitergeleitet bekommen? Hol es dir selbst', subP: 'Fünf Minuten, jeden Werktag. Kostenlos.', subBtn: 'Kostenlos abonnieren', src: 'Quelle', disc: 'Werbung ist klar gekennzeichnet. Die Sqwod-Redaktion ist unabhängig.', unsub: 'Abmelden', kinds: { raise: 'Runde', acquisition: 'Übernahme', valuation: 'Bewertung', ipo: 'IPO', shutdown: 'Aus' } },
};

const card = (inner) => `<tr><td style="padding:0 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CHALK};border:1px solid ${LINE};border-radius:16px;"><tr><td style="padding:22px 26px;">${inner}</td></tr></table></td></tr>`;
const label = (txt, gif) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr><td><img src="${asset(gif)}" width="22" height="22" alt="" style="display:block;border-radius:5px;"></td><td style="padding-left:9px;font:800 12px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${G4};">${txt}</td></tr></table>`;

function render(iss, lang) {
  const tx = T[lang];
  const date = iss.date || iss.urlSlug;
  const niceDate = new Date(date + 'T06:00:00Z').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const epUrl = `${SITE}/${lang}/daily/${date}/`;

  // UTM tagging — attributes each Daily email's clicks back to the issue in Umami,
  // so Resend's "who clicked" joins to the site's "what they did next" (subscribe,
  // share, play). Only INTERNAL (SITE) links get tagged; sponsor/affiliate/external
  // links pass through clean — we never put our UTMs on a third party's URL.
  const utmBase = `utm_source=sqwod-daily&utm_medium=email&utm_campaign=daily-${date}`;
  const withUTM = (url, content) => {
    if (!url || !url.startsWith(SITE)) return url || '';
    return url + (url.includes('?') ? '&' : '?') + utmBase + (content ? `&utm_content=${content}` : '');
  };

  // MONEY MOVEMENT — bold, scannable callouts (colored badge + arrow + big amount)
  const kindStyle = (k) => ({
    raise: { bg: UP, ar: '▲' }, ipo: { bg: UP, ar: '▲' },
    valuation: { bg: '#2f5fb0', ar: '▲' }, acquisition: { bg: INK, ar: '⇄' },
    shutdown: { bg: DOWN, ar: '▼' },
  }[k] || { bg: INK, ar: '•' });
  const money = (iss.moneyMoves || []).length ? card(label(tx.money, 'line-trend.gif') +
    iss.moneyMoves.map((m, i) => {
      const ks = kindStyle(m.kind);
      const pill = `<span style="display:inline-block;font:800 10px/1 ${F};letter-spacing:.1em;text-transform:uppercase;color:#fff;background:${ks.bg};border-radius:999px;padding:6px 11px;">${ks.ar}&nbsp; ${esc(tx.kinds[m.kind] || m.kind)}</span>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:15px 0;${i ? `border-top:1px solid ${LINE};` : ''}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="top">${pill}<div style="font:800 17px/1.2 ${F};color:${INK};margin-top:9px;letter-spacing:-.01em;">${esc(m.entity)}</div></td>
          <td align="right" valign="top" style="font:900 24px/1 ${F};letter-spacing:-.02em;color:${INK};white-space:nowrap;padding-left:10px;">${esc(m.amount || '—')}</td>
        </tr></table>
        ${m.note ? `<div style="font:400 13.5px/1.5 ${F};color:${G2};margin-top:8px;">${esc(m.note)}${m.url ? ` <a href="${esc(m.url)}" style="color:${G4};text-decoration:none;">&rarr;</a>` : ''}</div>` : ''}
      </td></tr></table>`;
    }).join('')) : '';

  // CONNECT THE DOTS (hero image + teach)
  const cd = iss.connectDots && iss.connectDots.title;
  const dots = cd ? card(label(tx.dots, 'connect-dots.gif') +
    `<img src="${iss.connectDots.image || asset('connect-dots.gif')}" width="548" alt="" style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:14px;">` +
    (iss.connectDots.credit ? `<div style="font:400 11px/1.4 ${F};color:${G4};margin:-8px 0 12px;">${esc(iss.connectDots.credit)}</div>` : '') +
    `<div style="font:800 24px/1.25 ${F};letter-spacing:-.02em;color:${INK};margin-bottom:10px;">${esc(iss.connectDots.title)}</div>` +
    `<div style="font:400 16px/1.7 ${F};color:${G1};">${esc(iss.connectDots.body).replace(/\n+/g, `</div><div style="font:400 16px/1.7 ${F};color:${G1};margin-top:12px;">`)}</div>`) : '';

  // RUNDOWN (items, with source link)
  const rundown = iss.items.length ? card(label(tx.rundown, 'hero-bars.gif') +
    iss.items.map((it, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 0;border-top:${i ? `1px solid ${LINE}` : 'none'};">
        ${it.image ? `<img src="${esc(it.image)}" width="548" alt="" style="display:block;width:100%;height:auto;border-radius:10px;margin-bottom:10px;">` : ''}
        <div style="font:700 11px/1 ${F};letter-spacing:.12em;text-transform:uppercase;color:${G4};">${String(i + 1).padStart(2, '0')}</div>
        <div style="font:800 19px/1.3 ${F};color:${INK};margin:7px 0 6px;letter-spacing:-.01em;">${esc(it.headline)}</div>
        <div style="font:400 15px/1.65 ${F};color:${G2};">${esc(it.dek)}</div>
        ${it.readMore ? `<div style="margin-top:8px;"><a href="${esc(it.readMore)}" style="font:700 12px ${F};color:${G4};text-decoration:none;">${tx.src}${it.source ? `: ${esc(it.source)}` : ''} &rarr;</a></div>` : ''}
      </td></tr></table>`).join('')) : '';

  // POLICY WATCH
  const policy = iss.policyWatch && iss.policyWatch.title ? card(label(tx.policy, 'pulse-ring.gif') +
    `<div style="font:800 19px/1.3 ${F};color:${INK};margin-bottom:6px;">${esc(iss.policyWatch.title)}</div>` +
    `<div style="font:400 15px/1.65 ${F};color:${G2};">${esc(iss.policyWatch.body)}</div>` +
    (iss.policyWatch.url ? `<div style="margin-top:8px;"><a href="${esc(iss.policyWatch.url)}" style="font:700 12px ${F};color:${G4};text-decoration:none;">${tx.src} &rarr;</a></div>` : '')) : '';

  // STAT
  const stat = iss.stat && iss.stat.number ? card(label(tx.stat, 'line-trend.gif') +
    `<div style="font:900 48px/1 ${F};letter-spacing:-.03em;color:${INK};">${esc(iss.stat.number)}</div>` +
    `<div style="font:700 13px/1.3 ${F};letter-spacing:.04em;text-transform:uppercase;color:${G4};margin:8px 0 10px;">${esc(iss.stat.label)}</div>` +
    (iss.stat.body ? `<div style="font:400 15px/1.65 ${F};color:${G2};">${esc(iss.stat.body)}${iss.stat.url ? ` <a href="${esc(iss.stat.url)}" style="color:${G4};">→</a>` : ''}</div>` : '')) : '';

  // SPONSOR (the only paid click-out)
  const sp = iss.sponsor && iss.sponsor.name ? card(
    `<div style="font:800 10px/1 ${F};letter-spacing:.14em;text-transform:uppercase;color:${G4};margin-bottom:9px;">${tx.sponsored} · ${tx.presented} ${esc(iss.sponsor.name)}</div>` +
    (iss.sponsor.blurb ? `<div style="font:500 15.5px/1.55 ${F};color:${INK};margin-bottom:${iss.sponsor.url ? '13px' : '0'};">${esc(iss.sponsor.blurb)}</div>` : '') +
    (iss.sponsor.url ? `<a href="${esc(iss.sponsor.url)}" style="display:inline-block;font:700 13px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:10px 18px;border-radius:999px;">${esc(iss.sponsor.cta || tx.learn)} &rarr;</a>` : '')) : '';

  // RECS (curated actionable)
  const recsArr = (iss.recs && iss.recs.length) ? iss.recs : (iss.doThis ? [{ label: 'Do this', text: iss.doThis }] : []);
  const recs = recsArr.length ? card(label(tx.recs, 'pulse-ring.gif') +
    recsArr.map((r) => {
      // Affiliate recs keep their clean partner URL (no Sqwod UTMs on a third party);
      // internal recs get tagged so we can see which rec drove the click.
      const recHref = r.affiliate ? abs(r.url, lang) : withUTM(abs(r.url, lang), 'rec');
      const link = r.url ? `<a href="${recHref}"${r.affiliate ? ' rel="sponsored nofollow"' : ''} style="color:${INK};">${esc(r.text)}</a>` : esc(r.text);
      const tag = r.affiliate ? ` <span style="font:700 9px ${F};letter-spacing:.1em;text-transform:uppercase;color:${G4};">· ${tx.sponsored}</span>` : '';
      return `<div style="font:400 15px/1.6 ${F};color:${G1};margin:0 0 12px;"><b style="color:${INK};">✓ ${esc(r.label)}:</b> ${link}${tag}</div>`;
    }).join('')) : '';

  // PLAY (cognitive game)
  const play = iss.play && iss.play.title ? card(label(tx.play, 'pulse-ring.gif') +
    `<div style="font:800 19px/1.3 ${F};color:${INK};margin-bottom:6px;">${esc(iss.play.title)}</div>` +
    `<div style="font:400 15px/1.6 ${F};color:${G2};margin-bottom:12px;">${esc(iss.play.prompt)}</div>` +
    `<a href="${withUTM(iss.play.url ? abs(iss.play.url, lang) : `${SITE}/${lang}/play/`, 'play')}" style="display:inline-block;font:800 13px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:10px 18px;border-radius:999px;">${tx.play} &rarr;</a>`) : '';

  // MOVE OF THE DAY — curated coach clip (link + credit, never re-hosted)
  const move = (iss.move && iss.move.url) ? card(label(lang === 'de' ? 'Move des Tages' : 'Move of the Day', 'hero-bars.gif') +
    (iss.move.note ? `<div style="font:800 19px/1.32 ${F};color:${INK};margin-bottom:13px;">${esc(iss.move.note)}</div>` : '') +
    `<a href="${esc(iss.move.url)}" rel="nofollow noopener" style="display:inline-block;font:800 13px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:10px 18px;border-radius:999px;">${lang === 'de' ? 'Ansehen auf' : 'Watch on'} ${esc(iss.move.platform || 'social')} &rarr;</a>` +
    (iss.move.handle ? `<div style="font:400 12px/1.4 ${F};color:${G4};margin-top:10px;">Coach: ${esc(iss.move.handle)}</div>` : '')) : '';

  // MEANWHILE (entertainment)
  const meanwhile = iss.meanwhile ? card(label(tx.meanwhile, 'pulse-ring.gif') +
    `<div style="font:400 15.5px/1.7 ${F};color:${G1};">${esc(iss.meanwhile)}${iss.meanwhileUrl ? ` <a href="${esc(iss.meanwhileUrl)}" style="color:${G4};">→</a>` : ''}</div>`) : '';

  // SHARE — simple forward-to-a-friend ask (referral program deferred; no ESP lock-in)
  const shareHead = lang === 'de' ? 'Teile Sqwod Daily' : 'Share Sqwod Daily';
  const shareBody = lang === 'de'
    ? 'Kennst du eine:n Coach, Trainer:in oder Studio-Gründer:in, der das lesen sollte? Leite diese Ausgabe weiter — so wächst Sqwod.'
    : 'Know a coach, trainer, or studio founder who should read this? Forward this issue — that\'s how Sqwod grows.';
  const share = card(label(shareHead, 'hero-bars.gif') +
    `<div style="font:400 15px/1.6 ${F};color:${G2};margin-bottom:14px;">${shareBody}</div>` +
    `<a href="${withUTM(`${SITE}/${lang}/subscribe/`, 'share-cta')}" style="display:inline-block;font:800 14px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:12px 22px;border-radius:999px;">${tx.subBtn} &rarr;</a>`);

  // Top sponsor slot: a clearly-defined "Presented by" band UNDER the hero, before content.
  const presentedBand = iss.sponsor && iss.sponsor.name ? `
        <tr><td style="padding:18px 6px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-bottom:1px solid ${LINE};padding-bottom:18px;">
            <div style="font:800 10px/1 ${F};letter-spacing:.18em;text-transform:uppercase;color:${G4};">${tx.presented}</div>
            ${iss.sponsor.logo
              ? `<img src="${esc(iss.sponsor.logo)}" alt="${esc(iss.sponsor.name)}" height="28" style="display:inline-block;margin-top:9px;max-height:28px;">`
              : `<div style="font:800 19px/1.2 ${F};color:${INK};margin-top:8px;letter-spacing:-.01em;">${esc(iss.sponsor.name)}</div>`}
          </td></tr></table>
        </td></tr>` : '';

  // inner = the email body only (inline styles, no <html>/<style>/<script>) →
  // safe to paste into beehiiv's HTML Snippet block + used as RSS content:encoded.
  const inner = `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;">
        <!-- utility: date left, view-online right -->
        <tr><td style="padding:0 10px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="left" style="font:600 11px/1 ${F};letter-spacing:.04em;color:${G4};">${esc(niceDate)}</td>
            <td align="right" style="font:600 11px/1 ${F};letter-spacing:.04em;"><a href="${withUTM(epUrl, 'view-online')}" style="color:${G4};text-decoration:none;">${tx.view} &rarr;</a></td>
          </tr></table>
        </td></tr>
        <!-- masthead: wordmark + hero -->
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:16px;overflow:hidden;">
          <tr><td style="padding:22px 26px 16px;font:900 22px/1 ${F};letter-spacing:.02em;color:${CHALK};">SQWOD <span style="font-weight:600;color:${G4};">DAILY</span></td></tr>
          <tr><td><img src="${asset('hero-bars.gif')}" width="600" alt="Sqwod Daily" style="display:block;width:100%;height:auto;"></td></tr>
        </table></td></tr>
        ${presentedBand}
        <!-- intro -->
        <tr><td style="padding:16px 6px 16px;">
          <div style="font:500 16px/1.6 ${F};color:${G1};">${esc(iss.intro || '')}</div>
          <div style="font:600 12px/1 ${F};color:${G4};margin-top:12px;">— Sqwod</div>
        </td></tr>
        ${move}
        ${money}
        ${dots}
        ${rundown}
        ${policy}
        ${stat}
        ${sp}
        ${recs}
        ${play}
        ${meanwhile}
        ${share}
        <!-- audio secondary -->
        <tr><td style="padding:6px 6px 18px;"><a href="${withUTM(epUrl, 'listen')}" style="font:700 13px ${F};color:${G2};text-decoration:none;">&#9654;&nbsp; ${tx.listen} &rarr;</a></td></tr>
        <!-- subscribe -->
        ${card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <div style="font:800 19px/1.2 ${F};color:${INK};margin-bottom:6px;">${tx.subH}</div>
          <div style="font:400 14px/1.5 ${F};color:${G2};margin-bottom:16px;">${tx.subP}</div>
          <a href="${withUTM(`${SITE}/${lang}/subscribe/`, 'subscribe-footer')}" style="display:inline-block;font:800 14px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:12px 22px;border-radius:999px;">${tx.subBtn}</a>
        </td></tr></table>`)}
        <!-- footer -->
        <tr><td style="padding:8px 6px 30px;">
          <div style="font:400 11px/1.6 ${F};color:${G4};">${tx.disc}</div>
          <div style="font:400 11px/1.6 ${F};color:${G4};margin-top:8px;">Sqwod · Berlin · <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${G4};">${tx.unsub}</a></div>
        </td></tr>
      </table>`;

  const full = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod Daily — ${esc(niceDate)}</title></head>
<body style="margin:0;padding:0;background:#eeeef0;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(iss.connectDots?.title || iss.intro || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeef0;padding:20px 12px;">
    <tr><td align="center">${inner}</td></tr>
  </table>
</body></html>`;
  return { full, inner, title: `Sqwod Daily — ${niceDate}`, date, intro: iss.intro || '' };
}

// Content RSS feed (for beehiiv RSS-to-Send on Max+): full inline-styled HTML in content:encoded.
const rfc822 = (d) => new Date(d + 'T06:00:00Z').toUTCString();
const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function writeContentFeed(lang) {
  if (!existsSync(DAILY)) return;
  const files = readdirSync(DAILY).filter((f) => f.endsWith(`.${lang}.md`)).sort().reverse().slice(0, 12);
  const items = files.map((f) => {
    const out = render(parseIssue(join(DAILY, f)), lang);
    const link = `${SITE}/${lang}/daily/${out.date}`;
    return `    <item>
      <title>${xesc(out.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${rfc822(out.date)}</pubDate>
      <description>${xesc(out.intro)}</description>
      <content:encoded><![CDATA[${out.inner}]]></content:encoded>
    </item>`;
  }).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Sqwod Daily${lang === 'de' ? ' (DE)' : ''}</title>
    <link>${SITE}/${lang}/daily</link>
    <language>${lang}</language>
    <description>${lang === 'de' ? 'Das Business von Fitness, werktäglich.' : 'The business of fitness, every weekday.'}</description>
${items}
  </channel>
</rss>
`;
  writeFileSync(join(__dirname, '..', 'site', 'public', `daily-${lang}.xml`), feed);
  console.log(`✓ content feed (${lang}) → site/public/daily-${lang}.xml`);
}

function run() {
  mkdirSync(OUT, { recursive: true });
  const langs = args.lang ? [args.lang] : ['en', 'de'];
  const date = args.date || new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const lang of langs) {
    const file = join(DAILY, `${date}.${lang}.md`);
    if (!existsSync(file)) { console.log(`· no issue for ${date} (${lang}) — skipping`); continue; }
    const out = render(parseIssue(file), lang);
    writeFileSync(join(OUT, `${date}-${lang}.html`), out.full);                 // full doc (preview / hosted)
    writeFileSync(join(OUT, `${date}-${lang}.snippet.html`), out.inner);        // paste into beehiiv HTML Snippet
    console.log(`✓ email (${lang}) → email/${date}-${lang}.html  + .snippet.html`);
    n++;
  }
  for (const lang of ['en', 'de']) writeContentFeed(lang);                       // RSS for beehiiv RSS-to-Send
  if (!n) console.log('No issues rendered.');
}
run();
