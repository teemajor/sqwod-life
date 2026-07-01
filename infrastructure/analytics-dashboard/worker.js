/**
 * Sqwod.Life Analytics (v2) — one private founder dashboard for SITE (Umami) +
 * EMAIL (Resend), built to answer "is the engine growing and what's my move?"
 *
 * Layout: ① north-star hero (list size + net-new this week + activity sparkline)
 *         ② this week's move (auto insight)  ③ funnel (visitors → sub rate → share rate)
 *         ④ site detail (KPIs + top pages/sources + events)  ⑤ email (lists + broadcasts)
 *
 * Reads from:
 *   • Self-hosted Umami API (your Railway instance, /api, bearer token from login).
 *   • Resend API (api.resend.com, Bearer) → audience (list) sizes + recent broadcasts.
 *
 * Routes:
 *   GET /            → the dashboard (gated by Cloudflare Access on dash.sqwod.life;
 *                      Worker also re-checks ALLOWED_EMAILS against the Access header).
 *   GET /digest?key= → plain-text weekly digest for the Monday scheduled task. Auth is
 *                      the DIGEST_KEY (so it works on the *.workers.dev URL, which is NOT
 *                      behind Access). Keep that key secret.
 *
 * Secrets: UMAMI_USERNAME, UMAMI_PASSWORD, RESEND_API_KEY, DIGEST_KEY
 * Vars:    UMAMI_URL, UMAMI_WEBSITE_ID, RESEND_AUDIENCE_EN, RESEND_AUDIENCE_DE, ALLOWED_EMAILS
 */

const RESEND_API = 'https://api.resend.com';

// palette — bumped label contrast for readability on near-black
const INK = '#0e0e10', PANEL = '#161619', PANEL2 = '#1d1d21', LINE = '#2c2c33', CHALK = '#fff',
      LBL = '#b4b4bb', SUB = '#8e8e96', G2 = '#c4c4ca', UP = '#3ad17a', DOWN = '#ff6b61', ACCENT = '#fff';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- /digest : key-authed plain-text summary for the scheduled task ---
    if (url.pathname === '/digest') {
      if (!env.DIGEST_KEY || url.searchParams.get('key') !== env.DIGEST_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const endAt = Date.now();
      const d = await gather(env, { startAt: endAt - 7 * 86400000, endAt, unit: 'day', label: 'last 7 days', activeKey: '7' });
      return new Response(digestText(d), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }

    // --- dashboard : gated by Access; re-check the identity header ---
    const who = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allow = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(who)) {
      return new Response('Forbidden — this dashboard is private.', { status: 403 });
    }

    const d = await gather(env, resolveWindow(url.searchParams));
    return new Response(renderPage(d, who), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
};

// Turn ?range=today|7|30|mtd|90|ytd  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD into a window.
function resolveWindow(p) {
  const DAY = 86400000;
  const now = new Date();
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), da = now.getUTCDate();
  let endAt = Date.now(), startAt, label, activeKey, unit = 'day', fromVal = '', toVal = '';
  const from = p.get('from'), to = p.get('to');
  if (from && to && !isNaN(Date.parse(from)) && !isNaN(Date.parse(to))) {
    startAt = Date.parse(`${from}T00:00:00Z`);
    endAt = Math.min(Date.now(), Date.parse(`${to}T23:59:59Z`));
    if (endAt < startAt) { const t = startAt; startAt = endAt - DAY; endAt = t; }
    activeKey = 'custom'; fromVal = from; toVal = to; label = `${from} → ${to}`;
    if (endAt - startAt <= 2 * DAY) unit = 'hour';
  } else {
    switch (p.get('range')) {
      case 'today': startAt = Date.UTC(y, mo, da); label = 'Today'; activeKey = 'today'; unit = 'hour'; break;
      case 'mtd':   startAt = Date.UTC(y, mo, 1);  label = 'Month to date'; activeKey = 'mtd'; break;
      case 'ytd':   startAt = Date.UTC(y, 0, 1);   label = 'Year to date';  activeKey = 'ytd'; break;
      case '7':     startAt = endAt - 7 * DAY;     label = 'Last 7 days';   activeKey = '7'; break;
      case '90':    startAt = endAt - 90 * DAY;    label = 'Last 90 days';  activeKey = '90'; break;
      default:      startAt = endAt - 30 * DAY;    label = 'Last 30 days';  activeKey = '30'; break;
    }
  }
  return { startAt, endAt, unit, label, activeKey, fromVal, toVal };
}

// ---------- data ----------
async function gather(env, win) {
  const { startAt, endAt, unit = 'day' } = win;
  const start7 = endAt - 7 * 86400000;

  const umamiUrl = (env.UMAMI_URL || '').replace(/\/$/, '');
  let token = '';
  try {
    const lr = await fetch(`${umamiUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.UMAMI_USERNAME, password: env.UMAMI_PASSWORD }),
    });
    if (lr.ok) token = (await lr.json()).token || '';
  } catch (_) { /* token '' → umami panels show unreachable */ }

  const uHead = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const rHead = { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: 'application/json' };
  const wid = env.UMAMI_WEBSITE_ID;
  const uBase = `${umamiUrl}/api/websites/${wid}`;
  const qs = `startAt=${startAt}&endAt=${endAt}`;

  const jget = async (u, headers) => {
    try { const r = await fetch(u, { headers }); if (!r.ok) return { __err: `${r.status}` }; return await r.json(); }
    catch (e) { return { __err: String(e) }; }
  };

  const [stats, pages, sources, events, series, events7] = await Promise.all([
    jget(`${uBase}/stats?${qs}`, uHead),
    jget(`${uBase}/metrics?${qs}&type=url`, uHead),
    jget(`${uBase}/metrics?${qs}&type=referrer`, uHead),
    jget(`${uBase}/metrics?${qs}&type=event`, uHead),
    jget(`${uBase}/pageviews?${qs}&unit=${unit}&timezone=Europe/Berlin`, uHead),
    jget(`${uBase}/metrics?startAt=${start7}&endAt=${endAt}&type=event`, uHead),
  ]);

  const [audiences, broadcasts] = await Promise.all([
    jget(`${RESEND_API}/audiences`, rHead),
    jget(`${RESEND_API}/broadcasts`, rHead),
  ]);
  const sizeOf = async (id) => {
    if (!id) return null;
    const r = await jget(`${RESEND_API}/audiences/${id}/contacts`, rHead);
    return Array.isArray(r?.data) ? r.data.length : null;
  };
  const [enSize, deSize] = await Promise.all([sizeOf(env.RESEND_AUDIENCE_EN), sizeOf(env.RESEND_AUDIENCE_DE)]);

  const evVal = (arr, name) => { const a = Array.isArray(arr) ? arr : []; const f = a.find((e) => e.x === name); return f ? f.y : 0; };

  return {
    win, stats, pages, sources, events, series, broadcasts,
    enSize, deSize,
    totalList: (enSize || 0) + (deSize || 0),
    weeklySubs: evVal(events7, 'subscribe'),
    weeklyShares: evVal(events7, 'share'),
    subs: evVal(events, 'subscribe'),
    shares: evVal(events, 'share'),
    unlocks: evVal(events, 'report-unlock'),
    moves: evVal(events, 'move-watch'),
    siteErr: stats?.__err,
    emailErr: broadcasts?.__err || audiences?.__err,
  };
}

// ---------- helpers ----------
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (a, b) => (!b ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function deltaTag(cur, prev) {
  if (prev == null || cur == null || prev === 0) return '';
  const dd = Math.round(((cur - prev) / prev) * 100);
  const up = dd >= 0;
  return `<span style="color:${up ? UP : DOWN};font:700 12px/1 ui-monospace,monospace;">${up ? '▲' : '▼'} ${Math.abs(dd)}%</span>`;
}

function moveLine(d) {
  if (d.siteErr) return 'Connect Umami to unlock your weekly read (check the UMAMI_* values).';
  const topSource = (Array.isArray(d.sources) && d.sources[0]) ? d.sources[0].x : null;
  const topPage = (Array.isArray(d.pages) && d.pages[0]) ? d.pages[0].x : null;
  const v = d.stats?.visitors?.value || 0;
  if (d.weeklySubs > 0) {
    let s = `List grew +${d.weeklySubs} this week.`;
    if (topSource) s += ` Top source: ${topSource}.`;
    if (topPage) s += ` Most-read: ${topPage}.`;
    s += ' Double down there.';
    return s;
  }
  if (v > 0) return `${num(v)} visitors, no new subscribers yet this week. Your move: ship today's Daily and push the Move-of-the-Day to convert readers into the list.`;
  return 'Quiet week. Your move: publish and share today’s Daily to start the flywheel.';
}

function barChart(series) {
  const pts = Array.isArray(series?.pageviews) ? series.pageviews : [];
  if (pts.length < 2) return `<div style="color:${SUB};font:400 12px sans-serif;padding:22px 0;">Activity chart appears once a few days of data land.</div>`;
  const ys = pts.map((p) => p.y || 0); const max = Math.max(...ys, 1);
  const H = 96, n = ys.length, gap = n > 24 ? 3 : 6, bw = (560 - (n - 1) * gap) / n;
  const bars = ys.map((y, i) => {
    const h = Math.max(2, (y / max) * (H - 4)); const x = i * (bw + gap);
    return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${i === n - 1 ? '#fff' : '#e6e6ec'}"/>`;
  }).join('');
  return `<svg viewBox="0 0 560 ${H}" width="100%" height="${H}" preserveAspectRatio="none">${bars}</svg>`;
}

function funnelCard(label, value, sub) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};">${label}</div>
    <div style="font:800 30px/1 ui-monospace,monospace;color:${CHALK};margin-top:9px;font-variant-numeric:tabular-nums;">${value}</div>
    <div style="font:600 11px/1.2 ui-monospace,monospace;color:${SUB};margin-top:7px;">${sub}</div>
  </div>`;
}

function rowStat(label, valueHtml) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:14px 16px;display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:${LBL};">${label}</span>
    <span style="font:800 22px/1 ui-monospace,monospace;color:${CHALK};font-variant-numeric:tabular-nums;">${valueHtml}</span>
  </div>`;
}

function eventCell(label, value) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:13px 16px;">
    <div style="font:700 9px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:${LBL};">${label}</div>
    <div style="font:800 24px/1 ui-monospace,monospace;color:${CHALK};margin-top:7px;">${value}</div>
  </div>`;
}

function propList(title, rows, accent, empty) {
  const arr = Array.isArray(rows) ? rows.slice(0, 5) : [];
  const max = arr.length ? Math.max(...arr.map((r) => r.y || 0), 1) : 1;
  const body = arr.length ? arr.map((r) => {
    const w = Math.max(3, Math.round(((r.y || 0) / max) * 100));
    return `<div style="margin-bottom:11px;">
      <div style="display:flex;justify-content:space-between;gap:10px;font:600 13px/1.3 system-ui;color:${CHALK};">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.x)}</span>
        <span style="flex:none;font:700 12px/1 ui-monospace,monospace;color:${G2};">${num(r.y)}</span>
      </div>
      <div style="height:3px;background:${LINE};border-radius:2px;margin-top:5px;"><div style="height:3px;width:${w}%;background:${accent};border-radius:2px;"></div></div>
    </div>`;
  }).join('') : `<div style="color:${SUB};font:400 13px sans-serif;padding:6px 0;">${empty}</div>`;
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:12px;">${title}</div>${body}</div>`;
}

// ---------- render ----------
function renderPage(d, who) {
  const s = d.stats || {};
  const bdata = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : [];
  const recent = bdata.slice(0, 6).map((b) => `<div style="display:flex;justify-content:space-between;gap:10px;font:600 13px/1.4 system-ui;color:${CHALK};padding:9px 0;border-top:1px solid #1c1c20;">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(b.name || b.id)}</span>
      <span style="flex:none;font:700 10px/1 ui-monospace,monospace;color:${(b.status === 'sent') ? UP : G2};text-transform:uppercase;">${esc(b.status || '—')}</span>
    </div>`).join('') || `<div style="padding:12px 0;color:${SUB};font:400 13px sans-serif;">No broadcasts yet — your sends will list here.</div>`;

  const ak = d.win.activeKey;
  const pill = (key, lbl) => `<a href="?range=${key}" style="font:700 11px/1 ui-monospace,monospace;text-decoration:none;padding:7px 11px;border-radius:999px;border:1px solid ${LINE};color:${ak === key ? INK : G2};background:${ak === key ? CHALK : 'transparent'};">${lbl}</a>`;
  const rangeBar = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    ${[['today', 'Today'], ['7', '7D'], ['30', '30D'], ['mtd', 'MTD'], ['90', '90D'], ['ytd', 'YTD']].map(([k, l]) => pill(k, l)).join('')}
    <form method="get" style="display:flex;gap:5px;align-items:center;margin-left:4px;">
      <input type="date" name="from" value="${d.win.fromVal}" aria-label="From" style="background:${PANEL};border:1px solid ${LINE};border-radius:8px;color:${CHALK};font:600 11px ui-monospace,monospace;padding:5px 7px;color-scheme:dark;">
      <input type="date" name="to" value="${d.win.toVal}" aria-label="To" style="background:${PANEL};border:1px solid ${LINE};border-radius:8px;color:${CHALK};font:600 11px ui-monospace,monospace;padding:5px 7px;color-scheme:dark;">
      <button type="submit" style="font:700 11px/1 ui-monospace,monospace;padding:7px 11px;border-radius:999px;border:1px solid ${LINE};background:${ak === 'custom' ? CHALK : 'transparent'};color:${ak === 'custom' ? INK : G2};cursor:pointer;">Apply</button>
    </form>
  </div>`;

  const weekly = d.siteErr ? `<span style="color:${SUB};font:600 12px ui-monospace,monospace;">subscribers across EN + DE</span>`
    : `<span style="color:${UP};font:700 13px/1 ui-monospace,monospace;">▲ +${d.weeklySubs}</span> <span style="color:${SUB};font:600 12px ui-monospace,monospace;">new this week</span>`;

  // flat hero: left-ruled north-star + bar-chart activity panel
  const hero = `<div style="display:grid;grid-template-columns:1fr 1.25fr;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
    <div style="padding:20px 22px;border-left:4px solid ${CHALK};">
      <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${LBL};">North star · Total list</div>
      <div style="font:800 56px/1 ui-monospace,monospace;color:${CHALK};letter-spacing:-.03em;margin:14px 0 9px;font-variant-numeric:tabular-nums;">${num(d.totalList)}</div>
      <div>${weekly}</div>
    </div>
    <div style="padding:20px 22px;background:${PANEL};">
      <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:14px;">Site activity · pageviews / day</div>
      ${barChart(d.series)}
    </div>
  </div>`;

  const move = `<div style="background:${CHALK};color:${INK};border-radius:12px;padding:14px 18px;margin-top:14px;display:flex;gap:12px;align-items:baseline;">
    <span style="font:800 10px/1.3 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;flex:none;">This week’s move →</span>
    <span style="font:600 14px/1.45 -apple-system,system-ui,sans-serif;">${esc(moveLine(d))}</span>
  </div>`;

  const funnel = d.siteErr ? '' : `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;">
    ${funnelCard('Visitors', `${num(s.visitors?.value)} ${deltaTag(s.visitors?.value, s.visitors?.prev)}`, esc(d.win.label))}
    ${funnelCard('Subscribe rate', pct(d.subs, s.visitors?.value), `${num(d.subs)} subs ÷ visitors`)}
    ${funnelCard('Share rate', pct(d.shares, s.visitors?.value), `${num(d.shares)} shares ÷ visitors`)}
  </div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod.Life Analytics</title>
<style>*{box-sizing:border-box}body{margin:0;background:${INK};color:${CHALK};font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif}</style></head>
<body><div style="max-width:1000px;margin:0 auto;padding:28px 20px 56px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid ${LINE};padding-bottom:14px;margin-bottom:18px;">
    <div>
      <div style="font:900 19px/1 system-ui;letter-spacing:.04em;">SQWOD.LIFE <span style="color:${SUB};font-weight:600;">ANALYTICS</span></div>
      <div style="font:600 11px/1 ui-monospace,monospace;color:${SUB};margin-top:7px;letter-spacing:.04em;text-transform:uppercase;">${esc(d.win.label)} · site + email${who ? ' · ' + esc(who) : ''}</div>
    </div>
    ${rangeBar}
  </div>

  ${hero}
  ${move}
  ${funnel}

  <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${SUB};margin:24px 0 12px;">Site detail · Umami</div>
  ${d.siteErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Umami unreachable (${esc(d.siteErr)}). Check UMAMI_USERNAME / UMAMI_PASSWORD / UMAMI_URL.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
    ${rowStat('Pageviews', `${num(s.pageviews?.value)} ${deltaTag(s.pageviews?.value, s.pageviews?.prev)}`)}
    ${rowStat('Visits', `${num(s.visits?.value)} ${deltaTag(s.visits?.value, s.visits?.prev)}`)}
    ${rowStat('Bounces', `${num(s.bounces?.value)} ${deltaTag(s.bounces?.value, s.bounces?.prev)}`)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    ${propList('Top pages', d.pages, CHALK, 'No pageviews in this window yet.')}
    ${propList('Top sources', d.sources, UP, 'No referrers yet — shares & search show here.')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px;">
    ${eventCell('Subscribes', num(d.subs))}
    ${eventCell('Shares', num(d.shares))}
    ${eventCell('Report unlocks', num(d.unlocks))}
    ${eventCell('Move watches', num(d.moves))}
  </div>`}

  <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${SUB};margin:26px 0 12px;">Email · Resend</div>
  ${d.emailErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Resend unreachable (${esc(d.emailErr)}). Check RESEND_API_KEY.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
    ${rowStat('List · EN', num(d.enSize))}
    ${rowStat('List · DE', num(d.deSize))}
    ${rowStat('Total', num(d.totalList))}
  </div>
  <div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="display:flex;justify-content:space-between;font:700 9px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:${SUB};padding-bottom:9px;border-bottom:1px solid ${LINE};"><span>Recent broadcasts</span><span>Status</span></div>
    ${recent}
    <div style="font:400 11px/1.5 sans-serif;color:${SUB};margin-top:12px;">Open / click rates per send live in Resend → Broadcasts (enable Open + Click tracking on the domain). Email→site conversions are the Subscribe / Share events above, driven by the daily UTMs.</div>
  </div>`}

  <div style="font:400 11px/1.6 sans-serif;color:${SUB};margin-top:30px;border-top:1px solid ${LINE};padding-top:16px;">
    Sqwod.Life Analytics · fresh on each load · private via Cloudflare Access. Site = self-hosted Umami · Email = Resend · joined by daily UTMs.
  </div>
</div></body></html>`;
}

function digestText(d) {
  const lines = [];
  lines.push('SQWOD.LIFE ANALYTICS — WEEKLY PULSE (last 7 days)');
  lines.push('');
  lines.push(`List (north star): ${num(d.totalList)}  (+${d.weeklySubs} this week)`);
  if (!d.siteErr) {
    const v = d.stats?.visitors?.value;
    lines.push(`Visitors: ${num(v)} · Subscribe rate: ${pct(d.subs, v)} · Shares: ${num(d.shares)}`);
    const topSource = (Array.isArray(d.sources) && d.sources[0]) ? `${d.sources[0].x} (${d.sources[0].y})` : '—';
    const topPage = (Array.isArray(d.pages) && d.pages[0]) ? `${d.pages[0].x} (${d.pages[0].y})` : '—';
    lines.push(`Top source: ${topSource} · Most-read: ${topPage}`);
  } else {
    lines.push('(Umami unreachable — check UMAMI_* settings.)');
  }
  lines.push('');
  lines.push(`Move: ${moveLine(d)}`);
  return lines.join('\n');
}
