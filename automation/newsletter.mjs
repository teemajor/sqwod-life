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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILY = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const OUT = join(__dirname, '..', 'site', 'public', 'email');
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// ---- generalized frontmatter reader for our controlled schema ----
const OBJ = new Set(['sponsor', 'connectDots', 'policyWatch', 'stat', 'play']);
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
  const epUrl = `${SITE}/${lang}/daily/${date}`;

  // MONEY MOVEMENT (table)
  const money = (iss.moneyMoves || []).length ? card(label(tx.money, 'line-trend.gif') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    iss.moneyMoves.map((m) => `<tr>
        <td style="padding:11px 0;border-top:1px solid ${LINE};font:800 14px/1.3 ${F};color:${INK};width:42%;">${esc(m.entity)}</td>
        <td style="padding:11px 0;border-top:1px solid ${LINE};font:700 11px/1 ${F};letter-spacing:.08em;text-transform:uppercase;color:${m.kind === 'shutdown' ? DOWN : UP};">${esc(tx.kinds[m.kind] || m.kind)}</td>
        <td style="padding:11px 0;border-top:1px solid ${LINE};font:800 14px/1.3 ${F};color:${INK};text-align:right;">${esc(m.amount || '')}</td>
      </tr>${m.note ? `<tr><td colspan="3" style="padding:0 0 8px;font:400 13px/1.5 ${F};color:${G2};">${esc(m.note)}${m.url ? ` <a href="${esc(m.url)}" style="color:${G4};">→</a>` : ''}</td></tr>` : ''}`).join('') +
    `</table>`) : '';

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
      const link = r.url ? `<a href="${r.affiliate && !/^https?:/.test(r.url) ? SITE + '/' + lang + r.url : esc(r.url)}"${r.affiliate ? ' rel="sponsored nofollow"' : ''} style="color:${INK};">${esc(r.text)}</a>` : esc(r.text);
      const tag = r.affiliate ? ` <span style="font:700 9px ${F};letter-spacing:.1em;text-transform:uppercase;color:${G4};">· ${tx.sponsored}</span>` : '';
      return `<div style="font:400 15px/1.6 ${F};color:${G1};margin:0 0 12px;"><b style="color:${INK};">✓ ${esc(r.label)}:</b> ${link}${tag}</div>`;
    }).join('')) : '';

  // PLAY (cognitive game)
  const play = iss.play && iss.play.title ? card(label(tx.play, 'pulse-ring.gif') +
    `<div style="font:800 19px/1.3 ${F};color:${INK};margin-bottom:6px;">${esc(iss.play.title)}</div>` +
    `<div style="font:400 15px/1.6 ${F};color:${G2};margin-bottom:12px;">${esc(iss.play.prompt)}</div>` +
    `<a href="${iss.play.url || (SITE + '/' + lang + '/play')}" style="display:inline-block;font:800 13px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:10px 18px;border-radius:999px;">${tx.play} &rarr;</a>`) : '';

  // MEANWHILE (entertainment)
  const meanwhile = iss.meanwhile ? card(label(tx.meanwhile, 'pulse-ring.gif') +
    `<div style="font:400 15.5px/1.7 ${F};color:${G1};">${esc(iss.meanwhile)}${iss.meanwhileUrl ? ` <a href="${esc(iss.meanwhileUrl)}" style="color:${G4};">→</a>` : ''}</div>`) : '';

  // SHARE / referral
  const share = card(label(tx.share, 'hero-bars.gif') +
    `<div style="font:400 15px/1.6 ${F};color:${G2};margin-bottom:14px;">${tx.shareBody}</div>` +
    `<div style="font:800 13px/1 ${F};color:${G4};margin-bottom:12px;">${tx.refcount}: <span style="color:${INK};">{{referral_count}}</span></div>` +
    `<a href="{{referral_link}}" style="display:inline-block;font:800 14px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:12px 22px;border-radius:999px;">${tx.shareBtn} &rarr;</a>`);

  const presentedBar = iss.sponsor && iss.sponsor.name
    ? `<div style="text-align:center;font:700 11px/1 ${F};letter-spacing:.12em;text-transform:uppercase;color:${G4};padding:14px 0 2px;">${tx.presented} ${esc(iss.sponsor.name)}</div>` : '';

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod Daily — ${esc(niceDate)}</title></head>
<body style="margin:0;padding:0;background:#eeeef0;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(iss.connectDots?.title || iss.intro || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeef0;padding:20px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- utility bar -->
        <tr><td style="padding:0 6px 10px;font:600 11px/1 ${F};color:${G4};">
          ${esc(niceDate)} &nbsp;·&nbsp; <a href="${epUrl}" style="color:${G4};text-decoration:none;">${tx.view}</a> &nbsp;·&nbsp; <a href="${SITE}/${lang}/subscribe" style="color:${G4};text-decoration:none;">${tx.sub}</a> &nbsp;·&nbsp; <a href="${SITE}/${lang}/verified" style="color:${G4};text-decoration:none;">${tx.shop}</a>
        </td></tr>
        <!-- masthead + hero -->
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:16px;overflow:hidden;">
          <tr><td style="padding:20px 26px 0;"><div style="font:900 22px/1 ${F};letter-spacing:.02em;color:${CHALK};">SQWOD <span style="font-weight:600;color:${G4};">DAILY</span></div></td></tr>
          <tr><td style="padding:12px 0 0;"><img src="${asset('hero-bars.gif')}" width="600" alt="Sqwod Daily" style="display:block;width:100%;height:auto;"></td></tr>
        </table></td></tr>
        ${presentedBar}
        <!-- intro -->
        <tr><td style="padding:16px 6px 16px;">
          <div style="font:500 16px/1.6 ${F};color:${G1};">${esc(iss.intro || '')}</div>
          <div style="font:600 12px/1 ${F};color:${G4};margin-top:12px;">— Sqwod</div>
        </td></tr>
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
        <tr><td style="padding:6px 6px 18px;"><a href="${epUrl}" style="font:700 13px ${F};color:${G2};text-decoration:none;">&#9654;&nbsp; ${tx.listen} &rarr;</a></td></tr>
        <!-- subscribe -->
        ${card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <div style="font:800 19px/1.2 ${F};color:${INK};margin-bottom:6px;">${tx.subH}</div>
          <div style="font:400 14px/1.5 ${F};color:${G2};margin-bottom:16px;">${tx.subP}</div>
          <a href="${SITE}/${lang}/subscribe" style="display:inline-block;font:800 14px ${F};color:${CHALK};background:${INK};text-decoration:none;padding:12px 22px;border-radius:999px;">${tx.subBtn}</a>
        </td></tr></table>`)}
        <!-- footer -->
        <tr><td style="padding:8px 6px 30px;">
          <div style="font:400 11px/1.6 ${F};color:${G4};">${tx.disc}</div>
          <div style="font:400 11px/1.6 ${F};color:${G4};margin-top:8px;">Sqwod · Berlin · <a href="{{unsubscribe}}" style="color:${G4};">${tx.unsub}</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function run() {
  mkdirSync(OUT, { recursive: true });
  const langs = args.lang ? [args.lang] : ['en', 'de'];
  const date = args.date || new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const lang of langs) {
    const file = join(DAILY, `${date}.${lang}.md`);
    if (!existsSync(file)) { console.log(`· no issue for ${date} (${lang}) — skipping`); continue; }
    writeFileSync(join(OUT, `${date}-${lang}.html`), render(parseIssue(file), lang));
    console.log(`✓ email (${lang}) → site/public/email/${date}-${lang}.html`);
    n++;
  }
  if (!n) console.log('No issues rendered.');
}
run();
