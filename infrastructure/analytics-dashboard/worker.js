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
 * Vars:    UMAMI_URL, UMAMI_WEBSITE_ID, RESEND_SEGMENT_EN, RESEND_SEGMENT_DE, ALLOWED_EMAILS
 *          (RESEND_AUDIENCE_EN / _DE still read as a fallback)
 */

const RESEND_API = 'https://api.resend.com';

// palette — bumped label contrast for readability on near-black
// Palette shared with the Sqwod Pod Command Center. The real values live in the
// :root block in PAGE_CSS below and flip with the viewer's OS theme, so every
// colour here is a token reference, never a hex.
const INK = 'var(--bg)', PANEL = 'var(--surface)', PANEL2 = 'var(--surface-2)',
      LINE = 'var(--line)', LINE2 = 'var(--line-strong)', CHALK = 'var(--ink)',
      LBL = 'var(--ink-2)', SUB = 'var(--ink-3)', G2 = 'var(--ink-2)',
      UP = 'var(--good)', DOWN = 'var(--bad)', ACCENT = 'var(--accent)';

// Type scale, also shared. Archivo for headings and labels, Source Sans 3 for
// body, IBM Plex Mono for anything numeric.
const F_HEAD = 'Archivo,sans-serif', F_BODY = '"Source Sans 3",sans-serif',
      F_MONO = '"IBM Plex Mono",ui-monospace,monospace';

const PAGE_CSS = `
:root{
  --bg:#F7F4EF;--surface:#FFFFFF;--surface-2:#F0EBE3;--line:#E0D8CC;--line-strong:#C9BEAE;
  --ink:#1A1611;--ink-2:#4E463B;--ink-3:#7C7263;
  --accent:#D93A0B;--accent-soft:rgba(217,58,11,.12);
  --good:#1F7A4A;--bad:#B32D18;
  --shadow:0 1px 2px rgba(26,22,17,.06),0 8px 24px -12px rgba(26,22,17,.18);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#14120F;--surface:#1E1A16;--surface-2:#272219;--line:#332C24;--line-strong:#4A4034;
  --ink:#F5F0E8;--ink-2:#BCB2A3;--ink-3:#8A8073;
  --accent:#FF4A17;--accent-soft:rgba(255,74,23,.15);
  --good:#4FB07A;--bad:#FF6A4D;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px -14px rgba(0,0,0,.7);}}
:root[data-theme="dark"]{
  --bg:#14120F;--surface:#1E1A16;--surface-2:#272219;--line:#332C24;--line-strong:#4A4034;
  --ink:#F5F0E8;--ink-2:#BCB2A3;--ink-3:#8A8073;
  --accent:#FF4A17;--accent-soft:rgba(255,74,23,.15);
  --good:#4FB07A;--bad:#FF6A4D;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px -14px rgba(0,0,0,.7);}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:${F_BODY};-webkit-font-smoothing:antialiased}
a{color:inherit}
`;

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

    // --- /debug : key-authed raw upstream dump, so a "—" can be traced to the
    //     actual Umami/Resend response instead of guessed at. Same key as /digest.
    if (url.pathname === '/debug') {
      if (!env.DIGEST_KEY || url.searchParams.get('key') !== env.DIGEST_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const endAt = Date.now();
      const d = await gather(env, { startAt: endAt - 7 * 86400000, endAt, unit: 'day', label: 'last 7 days', activeKey: '7' });
      const body = {
        umami: {
          url: env.UMAMI_URL, websiteId: env.UMAMI_WEBSITE_ID,
          authFailed: d.umamiAuthFailed,
          rawStats: d.stats, parsedKpi: d.kpi,
          rawPages: d.pages, rawSources: d.sources, rawEvents: d.events,
          seriesPoints: Array.isArray(d.series?.pageviews) ? d.series.pageviews.length : d.series,
        },
        resend: {
          segmentEnId: env.RESEND_SEGMENT_EN || env.RESEND_AUDIENCE_EN || null,
          segmentDeId: env.RESEND_SEGMENT_DE || env.RESEND_AUDIENCE_DE || null,
          rawSegments: d.segments, rawDomains: d.domains,
          enSize: d.enSize, deSize: d.deSize, totalList: d.totalList, listNote: d.listNote,
          metrics: d.mt, metricsErr: d.metricsErr, queue: d.queue,
        },
      };
      return new Response(JSON.stringify(body, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    // --- dashboard : gated by Access; re-check the identity header ---
    const who = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allow = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(who)) {
      return new Response('Forbidden — this dashboard is private.', { status: 403 });
    }

    // --- POST /action : the one-click clears from the queue panel.
    //     Access has already authenticated the caller and the allow-list above
    //     re-checked them, so this is a same-origin form post from the dashboard.
    if (request.method === 'POST' && url.pathname === '/action') {
      const form = await request.formData().catch(() => null);
      const act = form && String(form.get('do') || '');
      const id = form && String(form.get('id') || '');
      const home = (m) => new Response(null, { status: 303, headers: { location: `/?msg=${m}`, 'cache-control': 'no-store' } });

      if (act === 'send-broadcast' && /^[0-9a-f-]{36}$/i.test(id)) {
        const head = { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' };
        // Re-read the broadcast first: only ever send something that is still a
        // draft, so a double click or a stale page cannot send twice.
        const b = await fetch(`${RESEND_API}/broadcasts/${id}`, { headers: head })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!b || b.status !== 'draft') return home('not-a-draft');
        const r = await fetch(`${RESEND_API}/broadcasts/${id}/send`, { method: 'POST', headers: head, body: '{}' });
        if (!r.ok) console.log('send-broadcast failed', r.status, (await r.text()).slice(0, 200));
        return home(r.ok ? 'sent' : 'send-failed');
      }
      return home('unknown-action');
    }

    const d = await gather(env, resolveWindow(url.searchParams));
    return new Response(renderPage(d, who, url.searchParams.get('msg')), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },

  // Weekly digest — runs on the Cloudflare cron (see wrangler.toml [triggers]).
  // Always-on: no Claude runner, no git, runs even with your laptop closed.
  // Emails the weekly pulse via Resend. Needs RESEND_API_KEY + RESEND_FROM
  // (a verified Resend sender); DIGEST_TO defaults to tee@teemajor.com.
  async scheduled(event, env, ctx) {
    const endAt = Date.now();
    const d = await gather(env, { startAt: endAt - 7 * 86400000, endAt, unit: 'day', label: 'last 7 days', activeKey: '7' });
    const dashUrl = env.DASH_URL || 'https://dash.sqwod.life';
    const q = d.queue || [];
    const isMonday = new Date(endAt).getUTCDay() === 1;

    // Runs daily. Monday always gets the pulse. Any other day only sends when
    // something is actually stuck, so a quiet inbox means a healthy pipeline
    // rather than a cron nobody noticed had died.
    if (!isMonday && !q.length) { console.log('daily check: queue empty, no mail sent'); return; }

    const text = isMonday ? `${digestText(d)}\n\n${queueText(d, dashUrl)}` : queueText(d, dashUrl);
    const subject = isMonday
      ? `Sqwod.Life — Weekly Pulse · list ${num(d.totalList)} (+${d.weeklySubs})${q.length ? ` · ${q.length} need${q.length === 1 ? 's' : ''} you` : ''}`
      : `Sqwod.Life — ${q.length} thing${q.length === 1 ? '' : 's'} need${q.length === 1 ? 's' : ''} you`;

    const from = env.RESEND_FROM, to = env.DIGEST_TO || 'tee@teemajor.com';
    if (!env.RESEND_API_KEY || !from) { console.log('digest: RESEND_API_KEY/RESEND_FROM missing — skipped'); return; }
    ctx.waitUntil(fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, reply_to: to, subject, text }),
    }).then((r) => console.log(`digest email → ${r.status}`)).catch((e) => console.log(`digest email failed: ${e}`)));
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

  // Umami renamed the page-path metric between versions ("url" → "path"); older
  // builds 400 on one, newer on the other. Try both so Top pages never sits empty.
  const topPages = async () => {
    for (const t of ['path', 'url']) {
      const r = await jget(`${uBase}/metrics?${qs}&type=${t}`, uHead);
      if (Array.isArray(r)) return r;
    }
    return [];
  };

  const [stats, pages, sources, events, series, events7] = await Promise.all([
    jget(`${uBase}/stats?${qs}`, uHead),
    topPages(),
    jget(`${uBase}/metrics?${qs}&type=referrer`, uHead),
    jget(`${uBase}/metrics?${qs}&type=event`, uHead),
    jget(`${uBase}/pageviews?${qs}&unit=${unit}&timezone=Europe/Berlin`, uHead),
    jget(`${uBase}/metrics?startAt=${start7}&endAt=${endAt}&type=event`, uHead),
  ]);

  // Resend moved audiences -> segments, and shipped a headless metrics API
  // (GET /emails/metrics). Rates come from there now instead of being stitched
  // together per broadcast, so one call covers the whole selected window.
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const mQs = `start_date=${ymd(startAt)}&end_date=${ymd(endAt)}&timezone=Europe/Berlin`;

  const [segments, broadcasts, metrics, bMetrics, domains] = await Promise.all([
    jget(`${RESEND_API}/segments`, rHead),
    jget(`${RESEND_API}/broadcasts`, rHead),
    jget(`${RESEND_API}/emails/metrics?${mQs}`, rHead),
    jget(`${RESEND_API}/emails/metrics?${mQs}&dimensions=broadcast`, rHead),
    jget(`${RESEND_API}/domains`, rHead),
  ]);

  const mt = metrics && !metrics.__err ? (metrics.totals || null) : null;
  const bRates = {};
  if (bMetrics && !bMetrics.__err && Array.isArray(bMetrics.data)) {
    for (const row of bMetrics.data) {
      const id = row.broadcast_id || row.broadcastId;
      if (id) bRates[id] = row;
    }
  }

  // Contacts must be read from /segments/<id>/contacts. NOT /contacts?segment_id=,
  // which the API accepts and then ignores: it returns the whole account either
  // way, so EN and DE both came back as the same list and the north-star number
  // showed double. Verified against the empty DE segment on 18.09.2026.
  // Pages at 100 max, so anything past the first page has to be walked.
  const idsIn = async (id) => {
    if (!id) return null;
    let after = '';
    const ids = new Set();
    for (let page = 0; page < 25; page++) {
      const r = await jget(`${RESEND_API}/segments/${id}/contacts?limit=100${after ? `&after=${after}` : ''}`, rHead);
      const rows = Array.isArray(r?.data) ? r.data : null;
      if (!rows) return page === 0 ? null : ids;
      rows.filter((c) => !c.unsubscribed).forEach((c) => ids.add(c.id));
      if (rows.length < 100) return ids;
      after = rows[rows.length - 1].id;
    }
    return ids;
  };
  const segEn = env.RESEND_SEGMENT_EN || env.RESEND_AUDIENCE_EN || '';
  const segDe = env.RESEND_SEGMENT_DE || env.RESEND_AUDIENCE_DE || '';
  const [enIds, deIds] = await Promise.all([idsIn(segEn), idsIn(segDe)]);
  // A draft aimed at an empty segment is not a thing you can fix by pressing send.
  const emptySegments = new Set();
  if (enIds && enIds.size === 0 && segEn) emptySegments.add(segEn);
  if (deIds && deIds.size === 0 && segDe) emptySegments.add(segDe);
  const sizeOf = async (id) => { const r = await idsIn(id); return r ? r.size : null; };
  const enSize = enIds ? enIds.size : null, deSize = deIds ? deIds.size : null;

  // Fallback: if RESEND_SEGMENT_EN/DE aren't configured, sum every segment on the
  // account so the north-star number is real instead of a silent 0.
  let totalList = null, listNote = '';
  if (enIds || deIds) {
    // Union, not a sum: a contact sitting in both segments is still one person.
    totalList = new Set([...(enIds || []), ...(deIds || [])]).size;
  } else if (Array.isArray(segments?.data) && segments.data.length) {
    const sizes = await Promise.all(segments.data.map((a) => sizeOf(a.id)));
    const known = sizes.filter((n) => n != null);
    if (known.length) {
      totalList = known.reduce((a, b) => a + b, 0);
      listNote = `summed ${known.length} segment(s) — set RESEND_SEGMENT_EN/DE for the EN/DE split`;
    }
  } else {
    listNote = 'no Resend segment configured (RESEND_SEGMENT_EN / RESEND_SEGMENT_DE are blank)';
  }

  const evVal = (arr, name) => { const a = Array.isArray(arr) ? arr : []; const f = a.find((e) => e.x === name); return f ? f.y : 0; };

  // Umami changed its /stats shape across versions: older returns {visitors:{value,prev}},
  // newer returns a flat {visitors: 42}. Read both so KPIs never silently render "—".
  const sv = (k) => { const v = stats?.[k]; if (v == null) return null; return typeof v === 'object' ? (v.value ?? null) : Number(v); };
  // Prior-period figures live at stats[k].prev on old Umami, stats.comparison[k] on new.
  const sp = (k) => {
    const v = stats?.[k];
    if (v && typeof v === 'object' && v.prev != null) return v.prev;
    const c = stats?.comparison?.[k];
    return c == null ? null : Number(c);
  };
  const kpi = { visitors: sv('visitors'), pageviews: sv('pageviews'), visits: sv('visits'), bounces: sv('bounces') };
  const prev = { visitors: sp('visitors'), pageviews: sp('pageviews'), visits: sp('visits'), bounces: sp('bounces') };

  const out = {
    win, stats, pages, sources, events, series, broadcasts, segments, domains,
    emptySegments, mt, bRates, metricsErr: metrics?.__err,
    enSize, deSize, totalList, listNote, kpi, prev,
    weeklySubs: evVal(events7, 'subscribe'),
    weeklyShares: evVal(events7, 'share'),
    umamiAuthFailed: !token,
    subs: evVal(events, 'subscribe'),
    shares: evVal(events, 'share'),
    unlocks: evVal(events, 'report-unlock'),
    moves: evVal(events, 'move-watch'),
    siteErr: stats?.__err,
    emailErr: broadcasts?.__err || segments?.__err,
  };
  out.queue = buildQueue(out);
  return out;
}

/* ---------- the queue ----------
   This dashboard's job is to be EMPTY. Anything in this list is something the
   automation started and could not finish on its own. Every item either carries
   the single action that clears it, or says plainly why there is no action.
   Written after 35 German Daily issues sat as unsent drafts from June to August
   2026 and nothing anywhere said so. */
function buildQueue(d) {
  const q = [], now = Date.now();
  const GRACE = 90 * 60 * 1000; // a draft minutes old is a pipeline mid-run, not a failure

  if (d.siteErr) q.push({ level: 'blocked', title: 'Umami is unreachable',
    detail: `The site half of this page is empty (${d.siteErr}). Check the UMAMI_ settings and that the Railway instance is awake.` });
  if (d.emailErr) q.push({ level: 'blocked', title: 'Resend is unreachable',
    detail: `The email half of this page is empty (${d.emailErr}). Check RESEND_API_KEY.` });

  const bdata = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : [];
  const drafts = bdata.filter((b) => b.status === 'draft' && now - Date.parse(b.created_at || 0) > GRACE);
  const dead = drafts.filter((b) => d.emptySegments?.has(b.segment_id));
  const sendable = drafts.filter((b) => !d.emptySegments?.has(b.segment_id));

  // One row per CAUSE, never one row per file. Twelve identical cards saying the
  // same thing is not a queue, it is wallpaper.
  if (dead.length) {
    const oldest = Math.min(...dead.map((b) => Date.parse(b.created_at || 0)).filter(isFinite));
    q.push({ level: 'warn',
      title: `${dead.length} draft${dead.length === 1 ? '' : 's'} built for an empty list`,
      detail: `Oldest ${ago(new Date(oldest).toISOString())}. Nothing to press: there is no one to send them to. They stop piling up now that the Daily skips a language with no subscribers.` });
  }
  sendable.slice(0, 3).forEach((b) => {
    q.push({ level: 'blocked', title: `${b.name} is still a draft`,
      detail: `Built ${ago(b.created_at)} and never sent.`,
      action: { do: 'send-broadcast', id: b.id, label: 'Send it now' } });
  });
  if (sendable.length > 3) {
    q.push({ level: 'blocked', title: `${sendable.length - 3} more drafts are waiting`,
      detail: 'Clear the three above first, then reload and the rest appear.' });
  }

  const lastSent = bdata.filter((b) => b.sent_at).map((b) => Date.parse(b.sent_at)).sort((a, b) => b - a)[0];
  if (lastSent && now - lastSent > 48 * 3600 * 1000) {
    q.push({ level: 'warn', title: 'No Daily has gone out in 48 hours',
      detail: `The last send was ${ago(new Date(lastSent).toISOString())}. Either the run failed or nothing was scheduled.` });
  }

  (Array.isArray(d.domains?.data) ? d.domains.data : []).forEach((dom) => {
    if (dom.status && dom.status !== 'verified') {
      q.push({ level: 'blocked', title: `${dom.name} is not verified`,
        detail: `Its status is "${dom.status}". Nothing sends from this domain until its DNS records pass.` });
    }
  });

  if (d.mt && d.mt.complaint_rate > 0.1) {
    q.push({ level: 'blocked', title: `Spam complaints at ${rate(d.mt.complaint_rate)}`,
      detail: 'Above 0.1% is a deliverability emergency. Stop sending to cold addresses until it clears.' });
  } else if (d.mt && d.mt.bounce_rate > 2) {
    q.push({ level: 'warn', title: `Bounce rate at ${rate(d.mt.bounce_rate)}`,
      detail: 'Above 2% starts costing you inbox placement. The suppression list shows which addresses are behind it.' });
  }

  return q;
}

// ---------- helpers ----------
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (a, b) => (!b ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const rate = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const ago = (iso) => {
  const ms = Date.now() - Date.parse(iso || 0);
  if (!isFinite(ms)) return 'at an unknown time';
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'less than an hour ago';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.round(h / 24);
  return `${dd} day${dd === 1 ? '' : 's'} ago`;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `lowerIsBetter` covers metrics where a rise is bad news (bounces). The arrow
// always points the way the number moved; only the colour flips, so a rising
// bounce count reads red instead of congratulating you on it.
function deltaTag(cur, prev, lowerIsBetter = false) {
  if (prev == null || cur == null || prev === 0) return '';
  const dd = Math.round(((cur - prev) / prev) * 100);
  const up = dd >= 0;
  const good = lowerIsBetter ? !up : up;
  return `<span style="color:${good ? UP : DOWN};font:700 12px/1 ${F_MONO};">${up ? '▲' : '▼'} ${Math.abs(dd)}%</span>`;
}

function moveLine(d) {
  if (d.siteErr) return 'Connect Umami to unlock your weekly read (check the UMAMI_* values).';
  const topSource = (Array.isArray(d.sources) && d.sources[0]) ? d.sources[0].x : null;
  const topPage = (Array.isArray(d.pages) && d.pages[0]) ? d.pages[0].x : null;
  const v = d.kpi?.visitors || 0;
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
  if (pts.length < 2) return `<div style="color:${SUB};font:400 12px ${F_BODY};padding:22px 0;">Activity chart appears once a few days of data land.</div>`;
  const ys = pts.map((p) => p.y || 0);
  const max = Math.max(...ys, 1);
  const total = ys.reduce((a, b) => a + b, 0);
  const last = ys[ys.length - 1];
  const fmtX = (x) => String(x || '').replace('T', ' ').replace(/:00.*$/, '').slice(5); // MM-DD (or MM-DD HH for hourly)
  const H = 96, n = ys.length, gap = n > 24 ? 3 : 6, bw = (560 - (n - 1) * gap) / n;
  const bars = ys.map((y, i) => {
    const h = Math.max(2, (y / max) * (H - 4)); const x = i * (bw + gap);
    return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${i === n - 1 ? ACCENT : 'var(--line-strong)'}"><title>${esc(fmtX(pts[i].x))}: ${num(y)}</title></rect>`;
  }).join('');
  // peak label pinned top-right of the plot, hover tooltips per bar, and a numeric caption
  return `<div>
    <div style="position:relative;">
      <div style="position:absolute;top:-2px;right:0;font:700 10px/1 ${F_MONO};color:${SUB};">peak ${num(max)}</div>
      <svg viewBox="0 0 560 ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block;">${bars}</svg>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font:700 11px/1 ${F_MONO};color:${G2};">
      <span><span style="color:${SUB};font-weight:600;">TOTAL</span> ${num(total)}</span>
      <span><span style="color:${SUB};font-weight:600;">PEAK</span> ${num(max)}/day</span>
      <span><span style="color:${SUB};font-weight:600;">LATEST</span> ${num(last)}</span>
    </div>
  </div>`;
}

function funnelCard(label, value, sub) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="font:700 10px/1 ${F_MONO};letter-spacing:.14em;text-transform:uppercase;color:${LBL};">${label}</div>
    <div style="font:800 30px/1 ${F_MONO};color:${CHALK};margin-top:9px;font-variant-numeric:tabular-nums;">${value}</div>
    <div style="font:600 11px/1.2 ${F_MONO};color:${SUB};margin-top:7px;">${sub}</div>
  </div>`;
}

function rowStat(label, valueHtml) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:14px 16px;display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font:700 10px/1 ${F_MONO};letter-spacing:.12em;text-transform:uppercase;color:${LBL};">${label}</span>
    <span style="font:800 22px/1 ${F_MONO};color:${CHALK};font-variant-numeric:tabular-nums;">${valueHtml}</span>
  </div>`;
}

function eventCell(label, value) {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:13px 16px;">
    <div style="font:700 9px/1 ${F_MONO};letter-spacing:.12em;text-transform:uppercase;color:${LBL};">${label}</div>
    <div style="font:800 24px/1 ${F_MONO};color:${CHALK};margin-top:7px;">${value}</div>
  </div>`;
}

function propList(title, rows, accent, empty) {
  const arr = Array.isArray(rows) ? rows.slice(0, 5) : [];
  const max = arr.length ? Math.max(...arr.map((r) => r.y || 0), 1) : 1;
  const body = arr.length ? arr.map((r) => {
    const w = Math.max(3, Math.round(((r.y || 0) / max) * 100));
    return `<div style="margin-bottom:11px;">
      <div style="display:flex;justify-content:space-between;gap:10px;font:600 13px/1.3 ${F_HEAD};color:${CHALK};">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.x)}</span>
        <span style="flex:none;font:700 12px/1 ${F_MONO};color:${G2};">${num(r.y)}</span>
      </div>
      <div style="height:3px;background:${LINE};border-radius:2px;margin-top:5px;"><div style="height:3px;width:${w}%;background:${accent};border-radius:2px;"></div></div>
    </div>`;
  }).join('') : `<div style="color:${SUB};font:400 13px ${F_BODY};padding:6px 0;">${empty}</div>`;
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="font:700 10px/1 ${F_MONO};letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:12px;">${title}</div>${body}</div>`;
}

// ---------- render ----------
function flash(msg) {
  if (!msg) return '';
  const M = {
    sent: ['ok', 'Sent. It will show as delivered here within a minute or two.'],
    'send-failed': ['bad', 'Resend refused the send. Open the broadcast in Resend to see why.'],
    'not-a-draft': ['bad', 'That broadcast is no longer a draft, so nothing was sent.'],
    'unknown-action': ['bad', 'Unknown action, nothing was done.'],
  };
  const [kind, text] = M[msg] || ['bad', 'Something went wrong.'];
  const col = kind === 'ok' ? UP : DOWN;
  return `<div style="border:1px solid ${col};border-radius:11px;padding:12px 16px;margin-bottom:16px;color:${col};font:600 13px/1.5 ${F_BODY};">${esc(text)}</div>`;
}

function queuePanel(d) {
  const q = d.queue || [];
  const head = `<div style="font:700 10px/1 ${F_MONO};letter-spacing:.16em;text-transform:uppercase;color:${SUB};margin:0 0 12px;">Needs you</div>`;
  if (!q.length) {
    return `${head}<div style="background:${PANEL};border:1px solid ${LINE};border-left:3px solid ${UP};border-radius:0 9px 9px 0;padding:11px 15px;margin-bottom:18px;">
      <div style="font:700 13.5px/1.35 ${F_HEAD};color:${CHALK};">Nothing needs you</div>
      <div style="font:400 12.5px/1.5 ${F_BODY};color:${SUB};margin-top:3px;">Everything the automation produced has gone out. This panel is meant to look like this.</div>
    </div>`;
  }
  const rows = q.map((it) => {
    const col = it.level === 'blocked' ? DOWN : ACCENT;
    const btn = it.action
      ? `<form method="POST" action="/action" style="margin:9px 0 0;">
           <input type="hidden" name="do" value="${esc(it.action.do)}">
           <input type="hidden" name="id" value="${esc(it.action.id)}">
           <button type="submit" style="font:700 11px/1 ${F_HEAD};letter-spacing:.07em;text-transform:uppercase;background:${ACCENT};color:${INK};border:0;border-radius:6px;padding:9px 15px;cursor:pointer;">${esc(it.action.label)}</button>
         </form>`
      : '';
    return `<div style="background:${PANEL};border:1px solid ${LINE};border-left:3px solid ${col};border-radius:0 9px 9px 0;padding:11px 15px;margin-bottom:7px;">
      <div style="font:700 13.5px/1.35 ${F_HEAD};color:${CHALK};">${esc(it.title)}</div>
      <div style="font:400 12.5px/1.5 ${F_BODY};color:${SUB};margin-top:3px;max-width:84ch;">${esc(it.detail)}</div>
      ${btn}
    </div>`;
  }).join('');
  return `${head}<div style="margin-bottom:18px;">${rows}</div>`;
}

function renderPage(d, who, msg) {
  const s = d.stats || {};
  const bdata = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : [];
  const recent = bdata.slice(0, 6).map((b) => {
    const m = d.bRates?.[b.id];
    const sent = b.status === 'sent';
    const right = (sent && m)
      ? `${rate(m.open_rate)} open · ${rate(m.click_rate)} click`
      : esc(b.status || '—');
    return `<div style="display:flex;justify-content:space-between;gap:10px;font:600 13px/1.4 ${F_HEAD};color:${CHALK};padding:9px 0;border-top:1px solid ${LINE};">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(b.name || b.id)}</span>
      <span style="flex:none;font:700 10px/1 ${F_MONO};color:${sent ? UP : G2};text-transform:uppercase;">${right}</span>
    </div>`;
  }).join('') || `<div style="padding:12px 0;color:${SUB};font:400 13px ${F_BODY};">No broadcasts yet — your sends will list here.</div>`;

  const ak = d.win.activeKey;
  const pill = (key, lbl) => `<a href="?range=${key}" style="font:700 11px/1 ${F_MONO};text-decoration:none;padding:7px 11px;border-radius:999px;border:1px solid ${LINE};color:${ak === key ? INK : G2};background:${ak === key ? CHALK : 'transparent'};">${lbl}</a>`;
  const rangeBar = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    ${[['today', 'Today'], ['7', '7D'], ['30', '30D'], ['mtd', 'MTD'], ['90', '90D'], ['ytd', 'YTD']].map(([k, l]) => pill(k, l)).join('')}
    <form method="get" style="display:flex;gap:5px;align-items:center;margin-left:4px;">
      <input type="date" name="from" value="${d.win.fromVal}" aria-label="From" style="background:${PANEL};border:1px solid ${LINE};border-radius:8px;color:${CHALK};font:600 11px ${F_MONO};padding:5px 7px;color-scheme:dark;">
      <input type="date" name="to" value="${d.win.toVal}" aria-label="To" style="background:${PANEL};border:1px solid ${LINE};border-radius:8px;color:${CHALK};font:600 11px ${F_MONO};padding:5px 7px;color-scheme:dark;">
      <button type="submit" style="font:700 11px/1 ${F_MONO};padding:7px 11px;border-radius:999px;border:1px solid ${LINE};background:${ak === 'custom' ? CHALK : 'transparent'};color:${ak === 'custom' ? INK : G2};cursor:pointer;">Apply</button>
    </form>
  </div>`;

  const weekly = d.siteErr ? `<span style="color:${SUB};font:600 12px ${F_MONO};">subscribers across EN + DE</span>`
    : `<span style="color:${UP};font:700 13px/1 ${F_MONO};">▲ +${d.weeklySubs}</span> <span style="color:${SUB};font:600 12px ${F_MONO};">new this week</span>`;

  // flat hero: left-ruled north-star + bar-chart activity panel
  const hero = `<div style="display:grid;grid-template-columns:1fr 1.25fr;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
    <div style="padding:20px 22px;border-left:4px solid ${CHALK};">
      <div style="font:700 10px/1 ${F_MONO};letter-spacing:.16em;text-transform:uppercase;color:${LBL};">North star · Total list</div>
      <div style="font:800 56px/1 ${F_MONO};color:${CHALK};letter-spacing:-.03em;margin:14px 0 9px;font-variant-numeric:tabular-nums;">${num(d.totalList)}</div>
      <div>${weekly}</div>
    </div>
    <div style="padding:20px 22px;background:${PANEL};">
      <div style="font:700 10px/1 ${F_MONO};letter-spacing:.14em;text-transform:uppercase;color:${LBL};margin-bottom:14px;">Site activity · pageviews / day</div>
      ${barChart(d.series)}
    </div>
  </div>`;

  const move = `<div style="background:${CHALK};color:${INK};border-radius:12px;padding:14px 18px;margin-top:14px;display:flex;gap:12px;align-items:baseline;">
    <span style="font:800 10px/1.3 ${F_MONO};letter-spacing:.12em;text-transform:uppercase;flex:none;">This week’s move →</span>
    <span style="font:600 14px/1.45 -apple-system,${F_HEAD},sans-serif;">${esc(moveLine(d))}</span>
  </div>`;

  const funnel = d.siteErr ? '' : `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;">
    ${funnelCard('Visitors', `${num(d.kpi.visitors)} ${deltaTag(d.kpi.visitors, d.prev.visitors)}`, esc(d.win.label))}
    ${funnelCard('Subscribe rate', pct(d.subs, d.kpi.visitors), `${num(d.subs)} subs ÷ visitors`)}
    ${funnelCard('Share rate', pct(d.shares, d.kpi.visitors), `${num(d.shares)} shares ÷ visitors`)}
  </div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod.Life Analytics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:wght@400;500;600&display=swap">
<style>${PAGE_CSS}</style></head>
<body><div style="max-width:1000px;margin:0 auto;padding:28px 20px 56px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid ${LINE};padding-bottom:14px;margin-bottom:18px;">
    <div>
      <div style="font:900 19px/1 ${F_HEAD};letter-spacing:.04em;">SQWOD.LIFE <span style="color:${SUB};font-weight:600;">ANALYTICS</span></div>
      <div style="font:600 11px/1 ${F_MONO};color:${SUB};margin-top:7px;letter-spacing:.04em;text-transform:uppercase;">${esc(d.win.label)} · site + email${who ? ' · ' + esc(who) : ''}</div>
    </div>
    ${rangeBar}
  </div>

  ${flash(msg)}
  ${queuePanel(d)}
  ${hero}
  ${move}
  ${funnel}

  <div style="font:700 10px/1 ${F_MONO};letter-spacing:.16em;text-transform:uppercase;color:${SUB};margin:24px 0 12px;">Site detail · Umami</div>
  ${d.siteErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 20px;color:${DOWN};font:500 13px ${F_BODY};">Umami unreachable (${esc(d.siteErr)}). Check UMAMI_USERNAME / UMAMI_PASSWORD / UMAMI_URL.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
    ${rowStat('Pageviews', `${num(d.kpi.pageviews)} ${deltaTag(d.kpi.pageviews, d.prev.pageviews)}`)}
    ${rowStat('Visits', `${num(d.kpi.visits)} ${deltaTag(d.kpi.visits, d.prev.visits)}`)}
    ${rowStat('Bounces', `${num(d.kpi.bounces)} ${deltaTag(d.kpi.bounces, d.prev.bounces, true)}`)}
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

  <div style="font:700 10px/1 ${F_MONO};letter-spacing:.16em;text-transform:uppercase;color:${SUB};margin:26px 0 12px;">Email · Resend</div>
  ${d.emailErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 20px;color:${DOWN};font:500 13px ${F_BODY};">Resend unreachable (${esc(d.emailErr)}). Check RESEND_API_KEY.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
    ${rowStat('List · EN', num(d.enSize))}
    ${rowStat('List · DE', num(d.deSize))}
    ${rowStat('Total', num(d.totalList))}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">
    ${rowStat('Delivered', num(d.mt?.delivered))}
    ${rowStat('Open rate', rate(d.mt?.open_rate))}
    ${rowStat('Click rate', rate(d.mt?.click_rate))}
    ${rowStat('Bounce · unsub', `${rate(d.mt?.bounce_rate)} · ${rate(d.mt?.unsubscribe_rate)}`)}
  </div>
  <div style="background:${PANEL};border:1px solid ${LINE};border-radius:13px;padding:16px 18px;">
    <div style="display:flex;justify-content:space-between;font:700 9px/1 ${F_MONO};letter-spacing:.12em;text-transform:uppercase;color:${SUB};padding-bottom:9px;border-bottom:1px solid ${LINE};"><span>Recent broadcasts</span><span>Status</span></div>
    ${recent}
    <div style="font:400 11px/1.5 ${F_BODY};color:${SUB};margin-top:12px;">${d.metricsErr ? `Metrics API unreachable (${esc(d.metricsErr)}) — rates show as “—”.` : 'Rates come from the Resend metrics API for the selected window. Apple Mail Privacy Protection inflates opens, so trust clicks.'} Email→site conversions are the Subscribe / Share events above, driven by the daily UTMs.</div>
  </div>`}

  <div style="font:400 11px/1.6 ${F_BODY};color:${SUB};margin-top:30px;border-top:1px solid ${LINE};padding-top:16px;">
    Sqwod.Life Analytics · fresh on each load · private via Cloudflare Access. Site = self-hosted Umami · Email = Resend · joined by daily UTMs.
  </div>
</div></body></html>`;
}

function digestText(d) {
  const lines = [];
  lines.push('SQWOD.LIFE ANALYTICS — WEEKLY PULSE (last 7 days)');
  lines.push('');
  lines.push(`List (north star): ${num(d.totalList)}  (+${d.weeklySubs} this week)`);
  if (d.listNote) lines.push(`  ⚠ list count: ${d.listNote}`);
  if (!d.siteErr) {
    const v = d.kpi?.visitors;
    lines.push(`Visitors: ${num(v)} · Subscribe rate: ${pct(d.subs, v)} · Shares: ${num(d.shares)}`);
    const topSource = (Array.isArray(d.sources) && d.sources[0]) ? `${d.sources[0].x} (${d.sources[0].y})` : '—';
    const topPage = (Array.isArray(d.pages) && d.pages[0]) ? `${d.pages[0].x} (${d.pages[0].y})` : '—';
    lines.push(`Top source: ${topSource} · Most-read: ${topPage}`);
  } else {
    lines.push('(Umami unreachable — check UMAMI_* settings.)');
  }
  if (d.mt) {
    lines.push(`Email: ${num(d.mt.delivered)} delivered · ${rate(d.mt.open_rate)} open · ${rate(d.mt.click_rate)} click · ${rate(d.mt.bounce_rate)} bounce · ${rate(d.mt.unsubscribe_rate)} unsub`);
  } else if (d.metricsErr) {
    lines.push(`(Resend metrics unreachable — ${d.metricsErr}.)`);
  }
  lines.push('');
  lines.push(`Move: ${moveLine(d)}`);
  return lines.join('\n');
}

// The push half of the queue. A dashboard you have to remember to open is not
// automation, so the queue comes to you and the quiet days send nothing at all.
function queueText(d, dashUrl) {
  const q = d.queue || [];
  if (!q.length) return 'NEEDS YOU\n\nNothing. Everything the automation produced went out.';
  const lines = [`NEEDS YOU (${q.length})`, ''];
  q.forEach((it, i) => {
    lines.push(`${i + 1}. [${it.level === 'blocked' ? 'BLOCKED' : 'WATCH'}] ${it.title}`);
    lines.push(`   ${it.detail}`);
    if (it.action) lines.push(`   One click clears this: ${dashUrl}`);
    lines.push('');
  });
  lines.push(dashUrl);
  return lines.join('\n');
}
