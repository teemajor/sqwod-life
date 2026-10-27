/**
 * Sqwod.Life Analytics (v3): one private founder dashboard for SITE (Umami) + EMAIL (Resend).
 * Built to answer, in this order: is the list growing, where do people drop off, what earns,
 * and what should I do this week?
 *
 * Layout: ① alerts (only things that need a human, never stale history)
 *         ② north star: list size, growth line, signup rate  ③ this week's move
 *         ④ funnel: visitors → engaged → signup form → new subscribers
 *         ⑤ Daily & audio  ⑥ money clicks  ⑦ content  ⑧ email  ⑨ what isn't connected yet
 *
 * Reads from:
 *   • Self-hosted Umami API (/api, bearer token from login): stats, metrics, events,
 *     event-data values (event properties such as product, placement, episode).
 *   • Resend API: segment contacts (with created_at, for growth), broadcasts, metrics.
 *
 * Routes:
 *   GET /            → the dashboard (Cloudflare Access on dash.sqwod.life; the Worker
 *                      re-checks ALLOWED_EMAILS against the Access identity header).
 *   GET /digest?key= → plain-text weekly pulse (DIGEST_KEY).
 *   GET /debug?key=  → raw upstream dump for tracing a "—" (DIGEST_KEY).
 *   POST /action     → send a FRESH Daily draft (3 days or newer). Older drafts can't be sent
 *                      from here: in Oct 2026 the old page offered to send retired issues.
 *
 * Secrets: UMAMI_USERNAME, UMAMI_PASSWORD, RESEND_API_KEY, DIGEST_KEY
 * Vars:    UMAMI_URL, UMAMI_WEBSITE_ID, RESEND_SEGMENT_EN, RESEND_SEGMENT_DE, ALLOWED_EMAILS,
 *          RESEND_FROM, DIGEST_TO, DAILY_RELAUNCH (default 2026-10-19)
 *
 * Styling note: all styles live in one stylesheet with classes. v2 put font stacks with
 * double quotes ("IBM Plex Mono") inside style="..." attributes, which ended the attribute
 * early and silently dropped every big-number style.
 */

const RESEND_API = 'https://api.resend.com';
const DAILY_TRIGGER_CRON = '0 5 * * 1-5';  // must match wrangler.toml [triggers] crons
const DAY = 86400000;
const FRESH_DRAFT_MS = 3 * DAY;      // a draft older than this is history, not a task
const GRACE_MS = 90 * 60 * 1000;     // a draft minutes old is a pipeline mid-run

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/digest' || url.pathname === '/debug') {
      if (!env.DIGEST_KEY || url.searchParams.get('key') !== env.DIGEST_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const endAt = Date.now();
      const d = await gather(env, { startAt: endAt - 7 * DAY, endAt, unit: 'day', label: 'Last 7 days', activeKey: '7' });
      if (url.pathname === '/digest') {
        return new Response(digestText(d), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
      }
      const { series, growth, ...rest } = d;
      return new Response(JSON.stringify({ ...rest, seriesPoints: series?.pageviews?.length ?? null, growthPoints: growth.length }, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    const who = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allow = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes(who.toLowerCase())) {
      return new Response('Forbidden: this dashboard is private.', { status: 403 });
    }

    if (request.method === 'POST' && url.pathname === '/action') {
      const form = await request.formData().catch(() => null);
      const act = form && String(form.get('do') || '');
      const id = form && String(form.get('id') || '');
      const home = (m) => new Response(null, { status: 303, headers: { location: `/?msg=${m}`, 'cache-control': 'no-store' } });
      if (act === 'send-broadcast' && /^[0-9a-f-]{36}$/i.test(id)) {
        const head = { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' };
        const b = await fetch(`${RESEND_API}/broadcasts/${id}`, { headers: head }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!b || b.status !== 'draft') return home('not-a-draft');
        // Re-check freshness on the server, so a stale page or a crafted post can't send old news.
        if (Date.now() - Date.parse(b.created_at || 0) > FRESH_DRAFT_MS) return home('too-old');
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

  // Daily 07:00 UTC (wrangler.toml). Monday = weekly pulse. Other days send only when an
  // alert needs a human, so a quiet inbox means a healthy pipeline.
  async scheduled(event, env, ctx) {
    // 05:00 UTC weekdays: start the Daily on time (GitHub's own schedule runs hours late).
    if (event.cron === DAILY_TRIGGER_CRON) { ctx.waitUntil(triggerDaily(env)); return; }
    const endAt = Date.now();
    const d = await gather(env, { startAt: endAt - 7 * DAY, endAt, unit: 'day', label: 'Last 7 days', activeKey: '7' });
    const dashUrl = env.DASH_URL || 'https://dash.sqwod.life';
    const q = (d.alerts || []).filter((a) => a.level !== 'info');
    const isMonday = new Date(endAt).getUTCDay() === 1;
    if (!isMonday && !q.length) { console.log('daily check: nothing needs you, no mail sent'); return; }
    const text = isMonday ? `${digestText(d)}\n\n${alertsText(q, dashUrl)}` : alertsText(q, dashUrl);
    const subject = isMonday
      ? `Sqwod.Life weekly pulse · list ${num(d.list.total)} (+${num(d.list.newIn7)})${q.length ? ` · ${q.length} need${q.length === 1 ? 's' : ''} you` : ''}`
      : `Sqwod.Life · ${q.length} thing${q.length === 1 ? '' : 's'} need${q.length === 1 ? 's' : ''} you`;
    const from = env.RESEND_FROM, to = env.DIGEST_TO || 'tee@teemajor.com';
    if (!env.RESEND_API_KEY || !from) { console.log('digest: RESEND_API_KEY/RESEND_FROM missing, skipped'); return; }
    ctx.waitUntil(fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, reply_to: to, subject, text }),
    }).then((r) => console.log(`digest email → ${r.status}`)).catch((e) => console.log(`digest email failed: ${e}`)));
  },
};

// ?range=today|7|30|mtd|90|ytd  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD
export function resolveWindow(p) {
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
export async function gather(env, win) {
  const { startAt, endAt, unit = 'day' } = win;
  const umamiUrl = (env.UMAMI_URL || '').replace(/\/$/, '');
  const jget = async (u, headers) => {
    try { const r = await fetch(u, { headers }); if (!r.ok) return { __err: `${r.status}` }; return await r.json(); }
    catch (e) { return { __err: String(e) }; }
  };

  let token = '';
  try {
    const lr = await fetch(`${umamiUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.UMAMI_USERNAME, password: env.UMAMI_PASSWORD }),
    });
    if (lr.ok) token = (await lr.json()).token || '';
  } catch (_) { /* '' → site panels say unreachable */ }

  const uHead = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const rHead = { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: 'application/json' };
  const uBase = `${umamiUrl}/api/websites/${env.UMAMI_WEBSITE_ID}`;
  const qs = `startAt=${startAt}&endAt=${endAt}`;

  // Umami renamed the page metric between versions ("url" → "path"). Try both.
  const topPages = async () => {
    for (const t of ['path', 'url']) { const r = await jget(`${uBase}/metrics?${qs}&type=${t}`, uHead); if (Array.isArray(r)) return r; }
    return [];
  };
  // Event properties (product, placement, episode...). Normalised to [{x, y}].
  const prop = async (eventName, propertyName) => {
    const r = await jget(`${uBase}/event-data/values?${qs}&eventName=${encodeURIComponent(eventName)}&propertyName=${encodeURIComponent(propertyName)}`, uHead);
    if (!Array.isArray(r)) return null;
    return r.map((v) => ({ x: v.value ?? v.x ?? v.propertyValue ?? '—', y: Number(v.total ?? v.y ?? v.count ?? 0) }))
      .filter((v) => v.x !== '' && v.x != null).sort((a, b) => b.y - a.y);
  };

  const prevQs = `startAt=${startAt - (endAt - startAt)}&endAt=${startAt}`;
  const [stats, pages, sources, events, prevEvents, series,
    dealProducts, dealPlacements, dealEarns, reads, plays, sponsors] = await Promise.all([
    jget(`${uBase}/stats?${qs}`, uHead),
    topPages(),
    jget(`${uBase}/metrics?${qs}&type=referrer`, uHead),
    jget(`${uBase}/metrics?${qs}&type=event`, uHead),
    jget(`${uBase}/metrics?${prevQs}&type=event`, uHead),
    jget(`${uBase}/pageviews?${qs}&unit=${unit}&timezone=Europe/Berlin`, uHead),
    prop('deal-click', 'product'), prop('deal-click', 'placement'), prop('deal-click', 'earns'),
    prop('article-read', 'article'), prop('daily-play', 'episode'), prop('sponsor-click', 'sponsor'),
  ]);

  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const mQs = `start_date=${ymd(startAt)}&end_date=${ymd(endAt)}&timezone=Europe/Berlin`;
  const [broadcasts, metrics, bMetrics, domains, segments] = await Promise.all([
    jget(`${RESEND_API}/broadcasts`, rHead),
    jget(`${RESEND_API}/emails/metrics?${mQs}`, rHead),
    jget(`${RESEND_API}/emails/metrics?${mQs}&dimensions=broadcast`, rHead),
    jget(`${RESEND_API}/domains`, rHead),
    jget(`${RESEND_API}/segments`, rHead),
  ]);
  const mt = metrics && !metrics.__err ? (metrics.totals || null) : null;
  const bRates = {};
  if (Array.isArray(bMetrics?.data)) for (const row of bMetrics.data) { const id = row.broadcast_id || row.broadcastId; if (id) bRates[id] = row; }

  // Contacts come from /segments/<id>/contacts (NOT /contacts?segment_id=, which ignores the
  // filter and returns the whole account). Walk pages of 100. Keep created_at for growth.
  const contactsIn = async (id) => {
    if (!id) return null;
    let after = ''; const rows = new Map();
    for (let page = 0; page < 25; page++) {
      const r = await jget(`${RESEND_API}/segments/${id}/contacts?limit=100${after ? `&after=${after}` : ''}`, rHead);
      const data = Array.isArray(r?.data) ? r.data : null;
      if (!data) return page === 0 ? null : rows;
      data.filter((c) => !c.unsubscribed).forEach((c) => rows.set(c.id, Date.parse(c.created_at || 0) || 0));
      if (data.length < 100) return rows;
      after = data[data.length - 1].id;
    }
    return rows;
  };
  const segEn = env.RESEND_SEGMENT_EN || env.RESEND_AUDIENCE_EN || '';
  const segDe = env.RESEND_SEGMENT_DE || env.RESEND_AUDIENCE_DE || '';
  const [en, de] = await Promise.all([contactsIn(segEn), contactsIn(segDe)]);
  const all = new Map([...(en || []), ...(de || [])]); // union: one person in both lists counts once
  const created = [...all.values()];
  const inRange = (a, b) => created.filter((t) => t >= a && t < b).length;
  const list = {
    total: en || de ? all.size : null,
    en: en ? en.size : null, de: de ? de.size : null,
    newInWindow: en || de ? inRange(startAt, endAt + 1) : null,
    newPrevWindow: en || de ? inRange(startAt - (endAt - startAt), startAt) : null,
    newIn7: en || de ? inRange(endAt - 7 * DAY, endAt + 1) : null,
  };
  const emptySegments = new Set();
  if (en && en.size === 0 && segEn) emptySegments.add(segEn);
  if (de && de.size === 0 && segDe) emptySegments.add(segDe);

  // Growth line: list size at the end of each of the last 90 days (fixed window, so the
  // shape doesn't change when the range pills change).
  const growth = [];
  if (en || de) {
    const today = Date.UTC(new Date(endAt).getUTCFullYear(), new Date(endAt).getUTCMonth(), new Date(endAt).getUTCDate());
    for (let i = 89; i >= 0; i--) { const cut = today - i * DAY + DAY; growth.push({ t: cut - DAY, y: created.filter((c) => c < cut).length }); }
  }

  const ev = (arr, name) => { const f = (Array.isArray(arr) ? arr : []).find((e) => e.x === name); return f ? Number(f.y) : 0; };
  const sv = (k) => { const v = stats?.[k]; if (v == null) return null; return typeof v === 'object' ? (v.value ?? null) : Number(v); };
  const sp = (k) => { const v = stats?.[k]; if (v && typeof v === 'object' && v.prev != null) return v.prev; const c = stats?.comparison?.[k]; return c == null ? null : Number(c); };

  const E = (n) => ev(events, n), P = (n) => ev(prevEvents, n);
  const out = {
    win, pages, sources, series, broadcasts, domains, segments, emptySegments, mt, bRates,
    metricsErr: metrics?.__err, list, growth,
    kpi: { visitors: sv('visitors'), pageviews: sv('pageviews'), visits: sv('visits'), bounces: sv('bounces') },
    prev: { visitors: sp('visitors'), pageviews: sp('pageviews'), visits: sp('visits'), bounces: sp('bounces') },
    ev: {
      subscribe: E('subscribe'), share: E('share'), unlock: E('report-unlock'), moveWatch: E('move-watch'),
      reads: E('article-read'), plays: E('daily-play'), half: E('daily-listen-50'), complete: E('daily-listen-complete'),
      listenClick: E('daily-listen-click'), spotify: E('listen-spotify'),
      deals: E('deal-click'), sponsor: E('sponsor-click'), recs: E('daily-rec-click'),
      pricingUnlock: E('pricing-index-unlock') + E('pricing-index-unlocked'),
    },
    evPrev: { subscribe: P('subscribe'), reads: P('article-read'), plays: P('daily-play'), deals: P('deal-click') },
    props: { dealProducts, dealPlacements, dealEarns, reads, plays, sponsors },
    rawEvents: events,
    umamiAuthFailed: !token,
    siteErr: stats?.__err || (!token ? 'login failed' : undefined),
    emailErr: broadcasts?.__err,
  };
  out.alerts = buildAlerts(out, env);
  return out;
}

/* ---------- alerts ----------
   Only things a human must act on. History is not a task: drafts older than 3 days, or
   built before the Daily relaunch, collapse into one quiet line with no send button. */
function buildAlerts(d, env) {
  const a = [], now = Date.now();
  const relaunch = Date.parse(`${env.DAILY_RELAUNCH || '2026-10-19'}T00:00:00Z`);
  if (d.siteErr) a.push({ level: 'blocked', title: 'Umami is unreachable', detail: `The site numbers are empty (${d.siteErr}). Check the UMAMI_ settings and that Railway is awake.` });
  if (d.emailErr) a.push({ level: 'blocked', title: 'Resend is unreachable', detail: `The email numbers are empty (${d.emailErr}). Check RESEND_API_KEY.` });

  const b = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : [];
  const drafts = b.filter((x) => x.status === 'draft' && now - Date.parse(x.created_at || 0) > GRACE_MS);
  const isOld = (x) => { const t = Date.parse(x.created_at || 0); return now - t > FRESH_DRAFT_MS || t < relaunch; };
  const fresh = drafts.filter((x) => !isOld(x) && !d.emptySegments.has(x.segment_id));
  const old = drafts.filter((x) => isOld(x) || d.emptySegments.has(x.segment_id));
  fresh.slice(0, 3).forEach((x) => a.push({ level: 'blocked', title: `${x.name} didn't send`, detail: `Built ${ago(x.created_at)}. Still current, so it's safe to send now.`, action: { do: 'send-broadcast', id: x.id, label: 'Send it now' } }));
  if (old.length) a.push({ level: 'info', title: `${old.length} old draft${old.length === 1 ? '' : 's'} in Resend`, detail: 'Retired or out of date, so there is nothing to send. Archive them in Resend when convenient.' });

  const lastSent = b.filter((x) => x.sent_at).map((x) => Date.parse(x.sent_at)).sort((p, q) => q - p)[0];
  const dow = new Date(now).getUTCDay(); // the Daily is weekdays only; Monday morning looks back to Friday
  const limit = (dow === 0 || dow === 1) ? 80 * 3600 * 1000 : 30 * 3600 * 1000;
  if (lastSent && now - lastSent > limit) a.push({ level: 'warn', title: 'The Daily may have missed a send', detail: `Last send was ${ago(new Date(lastSent).toISOString())}.` });

  (Array.isArray(d.domains?.data) ? d.domains.data : []).forEach((dom) => {
    if (dom.status && dom.status !== 'verified') a.push({ level: 'blocked', title: `${dom.name} is not verified`, detail: `Status "${dom.status}". Nothing sends from this domain until its DNS passes.` });
  });
  if (d.mt && d.mt.complaint_rate > 0.1) a.push({ level: 'blocked', title: `Spam complaints at ${rate(d.mt.complaint_rate)}`, detail: 'Above 0.1% hurts inbox placement fast. Pause sends to cold addresses.' });
  else if (d.mt && d.mt.bounce_rate > 2) a.push({ level: 'warn', title: `Bounce rate at ${rate(d.mt.bounce_rate)}`, detail: 'Above 2% starts costing inbox placement.' });
  return a;
}

// ---------- helpers ----------
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pctOf = (a, b) => (!b || a == null ? '—' : `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%`);
const rate = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ago = (iso) => {
  const ms = Date.now() - Date.parse(iso || 0);
  if (!isFinite(ms)) return 'at an unknown time';
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'less than an hour ago';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.round(h / 24);
  return `${dd} day${dd === 1 ? '' : 's'} ago`;
};
function delta(cur, prev, lowerIsBetter = false) {
  if (prev == null || cur == null || prev === 0) return '';
  const dd = Math.round(((cur - prev) / prev) * 100);
  const up = dd >= 0, good = lowerIsBetter ? !up : up;
  return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(dd)}%</span>`;
}
const prettyPath = (s) => {
  const m = String(s || '').match(/^\/(en|de)\/?(.*)$/);
  if (!m) return String(s || '/') || '/';
  const rest = m[2].replace(/\/$/, '').replace(/\//g, ' / ');
  return `${m[1].toUpperCase()} · ${rest || 'home'}`;
};
const prettyProduct = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The one-line move. Picks the biggest leak first, so it's never generic.
export function moveLine(d) {
  if (d.siteErr) return 'Fix the Umami connection first. Without it, nothing below is real.';
  const v = d.kpi.visitors || 0, subs = d.list.newInWindow ?? d.ev.subscribe;
  const rateNow = v ? subs / v : 0;
  const topPage = Array.isArray(d.pages) && d.pages[0] ? prettyPath(d.pages[0].x) : null;
  if (v >= 200 && rateNow < 0.005) {
    return `${num(v)} visitors and ${num(subs)} new subscriber${subs === 1 ? '' : 's'}. The leak is signup, not traffic: give ${topPage || 'your top page'} a stronger reason to subscribe (a free report or the Pricing Index) before chasing more visitors.`;
  }
  if (d.ev.plays && d.ev.complete / d.ev.plays < 0.3) return `People press play but most stop early (${pctOf(d.ev.complete, d.ev.plays)} finish). Tighten the first 30 seconds of the Daily audio.`;
  if (d.ev.deals > 0) { const p = d.props.dealProducts?.[0]; return `${num(d.ev.deals)} deal clicks${p ? `, led by ${prettyProduct(p.x)}` : ''}. Feature that product in this week's Daily and on the homepage.`; }
  if (subs > 0) return `+${num(subs)} subscriber${subs === 1 ? '' : 's'} in this window. Find what they read first (top sources below) and do more of it.`;
  return 'Quiet window. Share today\'s Daily on LinkedIn and Instagram, where your traffic already comes from.';
}

// ---------- charts ----------
function growthChart(points) {
  if (points.length < 2) return '<p class="muted">The growth line appears once Resend returns subscribers.</p>';
  const W = 520, H = 120, ys = points.map((p) => p.y), max = Math.max(...ys, 1), min = Math.min(...ys);
  const span = Math.max(max - min, 1);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 8 - ((p.y - min) / span) * (H - 22)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${W},${H}L0,${H}Z`;
  const last = xy[xy.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="List size over the last 90 days">
    <path d="${area}" class="area"/><path d="${line}" class="line" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" class="dot"/></svg>
    <div class="axis"><span>90 days ago · ${num(points[0].y)}</span><span>today · ${num(points[points.length - 1].y)}</span></div>`;
}
function barChart(series) {
  const pts = Array.isArray(series?.pageviews) ? series.pageviews : [];
  if (pts.length < 2) return '<p class="muted">Appears once a few days of data land.</p>';
  const ys = pts.map((p) => p.y || 0), max = Math.max(...ys, 1), n = ys.length;
  const W = 520, H = 80, gap = n > 40 ? 1 : n > 24 ? 2 : 4, bw = (W - (n - 1) * gap) / n;
  const fmtX = (x) => String(x || '').replace('T', ' ').slice(5, 16);
  const bars = ys.map((y, i) => { const h = Math.max(2, (y / max) * (H - 2)); return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="${i === n - 1 ? 'bar now' : 'bar'}"><title>${esc(fmtX(pts[i].x))}: ${num(y)}</title></rect>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Pageviews per day">${bars}</svg>
    <div class="axis"><span>peak ${num(max)}/day</span><span>latest ${num(ys[n - 1])}</span></div>`;
}

// ---------- building blocks ----------
const stat = (label, value, sub = '') => `<div class="stat"><div class="lbl">${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
function list(title, rows, fmt = (x) => esc(x), empty = 'Nothing yet.') {
  const arr = Array.isArray(rows) ? rows.slice(0, 5) : null;
  if (arr === null) return `<div class="list"><div class="lbl">${title}</div><p class="muted">Not available from this Umami version yet.</p></div>`;
  const max = arr.length ? Math.max(...arr.map((r) => r.y || 0), 1) : 1;
  const body = arr.length ? arr.map((r) => `<div class="row"><div class="row-t"><span>${fmt(r.x)}</span><b>${num(r.y)}</b></div><div class="track"><i style="width:${Math.max(3, Math.round(((r.y || 0) / max) * 100))}%"></i></div></div>`).join('') : `<p class="muted">${empty}</p>`;
  return `<div class="list"><div class="lbl">${title}</div>${body}</div>`;
}
function funnelStep(label, value, sub, conv) {
  if (conv && parseFloat(conv) > 100) conv = ''; // counts from two systems can overlap; never show >100%
  return `<div class="fstep"><div class="lbl">${label}</div><div class="val">${num(value)}</div><div class="sub">${sub}</div>${conv ? `<div class="conv">${conv}</div>` : ''}</div>`;
}

function flash(msg) {
  if (!msg) return '';
  const M = {
    sent: ['good', 'Sent. It shows as delivered here within a minute or two.'],
    'send-failed': ['bad', 'Resend refused the send. Open the broadcast in Resend to see why.'],
    'not-a-draft': ['bad', 'That broadcast is no longer a draft, so nothing was sent.'],
    'too-old': ['bad', 'That draft is more than 3 days old, so it was not sent.'],
    'unknown-action': ['bad', 'Unknown action, nothing was done.'],
  };
  const [kind, text] = M[msg] || ['bad', 'Something went wrong.'];
  return `<div class="flash ${kind}">${esc(text)}</div>`;
}
function alertsPanel(alerts) {
  if (!alerts.length) return '<div class="alert ok"><b>Nothing needs you.</b> Everything the automation produced went out.</div>';
  return alerts.map((it) => `<div class="alert ${it.level}"><div><b>${esc(it.title)}</b><span>${esc(it.detail)}</span></div>${it.action ? `<form method="POST" action="/action"><input type="hidden" name="do" value="${esc(it.action.do)}"><input type="hidden" name="id" value="${esc(it.action.id)}"><button type="submit">${esc(it.action.label)}</button></form>` : ''}</div>`).join('');
}

// ---------- page ----------
export function renderPage(d, who, msg) {
  const ak = d.win.activeKey;
  const pills = [['today', 'Today'], ['7', '7D'], ['30', '30D'], ['mtd', 'MTD'], ['90', '90D'], ['ytd', 'YTD']]
    .map(([k, l]) => `<a href="?range=${k}" class="pill${ak === k ? ' on' : ''}">${l}</a>`).join('');
  const v = d.kpi.visitors, newSubs = d.list.newInWindow, e = d.ev;
  const signupRate = v && newSubs != null ? newSubs / v : null;

  const b = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data.filter((x) => x.status === 'sent').slice(0, 6) : [];
  const recent = b.length ? b.map((x) => {
    const m = d.bRates[x.id];
    return `<div class="bc"><span>${esc(x.name || x.id)}</span><b>${m ? `${rate(m.click_rate)} click` : 'sent'}</b></div>`;
  }).join('') : '<p class="muted">No sends in this window.</p>';

  const earnsYes = (d.props.dealEarns || []).find((r) => r.x === 'yes')?.y ?? null;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sqwod.Life Analytics</title>
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#141416">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap">
<style>${CSS}</style></head><body><main class="wrap">

<header class="top">
  <div><div class="brand">SQWOD <span>ANALYTICS</span></div><div class="meta">${esc(d.win.label)}${who ? ` · ${esc(who)}` : ''}</div></div>
  <nav class="range">${pills}
    <form method="get" class="custom"><input type="date" name="from" value="${esc(d.win.fromVal)}" aria-label="From"><input type="date" name="to" value="${esc(d.win.toVal)}" aria-label="To"><button type="submit" class="pill${ak === 'custom' ? ' on' : ''}">Apply</button></form>
  </nav>
</header>

${flash(msg)}
<section class="alerts">${alertsPanel(d.alerts)}</section>

<section class="hero">
  <div class="card ns">
    <div class="lbl">Subscribers · the number that matters</div>
    <div class="big">${num(d.list.total)}</div>
    <div class="sub"><span class="delta good">+${num(newSubs)}</span> in ${esc(d.win.label.toLowerCase())} ${delta(newSubs, d.list.newPrevWindow)} · EN ${num(d.list.en)} · DE ${num(d.list.de)}</div>
    ${growthChart(d.growth)}
  </div>
  <div class="card rate">
    <div class="lbl">Signup rate</div>
    <div class="big">${signupRate == null ? '—' : (signupRate * 100).toFixed(signupRate < 0.1 ? 1 : 0) + '%'}</div>
    <div class="sub">${num(newSubs)} new ÷ ${num(v)} visitors</div>
    <div class="lbl" style="margin-top:22px">Pageviews per day</div>
    ${barChart(d.series)}
  </div>
</section>

<section class="move"><span class="lbl">This week's move</span><p>${esc(moveLine(d))}</p></section>

<h2>Where people drop off</h2>
<section class="funnel">
  ${funnelStep('Visitors', v, `${delta(v, d.prev.visitors)}`, '')}
  ${funnelStep('Engaged', e.reads + e.plays, `${num(e.reads)} full reads · ${num(e.plays)} listens`, pctOf(e.reads + e.plays, v))}
  ${funnelStep('Signup form', e.subscribe, 'form sends', pctOf(e.subscribe, v))}
  ${funnelStep('New subscribers', newSubs, 'confirmed in Resend', pctOf(newSubs, e.subscribe))}
</section>
<p class="note">Percentages show how many make it from the step before (visitors for the first steps). Listening and full-read tracking started 26 Oct 2026.</p>

<section class="grid3">
  <div class="card">
    <h3>Daily &amp; audio</h3>
    <div class="stats2">${stat('Plays on site', num(e.plays), delta(e.plays, d.evPrev.plays))}${stat('Finished', pctOf(e.complete, e.plays), `${num(e.complete)} of ${num(e.plays)}`)}${stat('Reached half', num(e.half))}${stat('Spotify clicks', num(e.spotify), 'left for the app')}</div>
    ${list('Most-played episodes', d.props.plays, esc, 'No plays yet.')}
    <p class="note">Spotify and Apple don't share play counts by API. Check them in Spotify for Creators and Apple Podcasts Connect.</p>
  </div>
  <div class="card">
    <h3>Money clicks</h3>
    <div class="stats2">${stat('Deal clicks', num(e.deals), delta(e.deals, d.evPrev.deals))}${stat('On earning links', earnsYes == null ? '—' : num(earnsYes), 'affiliate')}${stat('Sponsor clicks', num(e.sponsor))}${stat('Daily rec clicks', num(e.recs))}</div>
    ${list('Top products', d.props.dealProducts, prettyProduct, 'No deal clicks yet.')}
    ${list('Where they clicked', d.props.dealPlacements, esc, 'No deal clicks yet.')}
    <p class="note">Commission lives in Impact, Awin and Amazon. Clicks here, money there.</p>
  </div>
  <div class="card">
    <h3>Content</h3>
    <div class="stats2">${stat('Full reads', num(e.reads), delta(e.reads, d.evPrev.reads))}${stat('Shares', num(e.share))}${stat('Report unlocks', num(e.unlock + e.pricingUnlock))}${stat('Bounce', pctOf(d.kpi.bounces, d.kpi.visits), 'one page, then gone')}</div>
    ${list('Read to the end', d.props.reads, prettyProduct, 'No full reads yet.')}
    ${list('Top pages', d.pages, prettyPath)}
    ${list('Top sources', d.sources, esc, 'No referrers yet.')}
  </div>
</section>

<h2>Email</h2>
<section class="grid2">
  <div class="card"><div class="stats4">${stat('Delivered', num(d.mt?.delivered))}${stat('Click rate', rate(d.mt?.click_rate), 'trust this one')}${stat('Bounce', rate(d.mt?.bounce_rate))}${stat('Unsubscribe', rate(d.mt?.unsubscribe_rate))}</div>
  <p class="note">Open rates are left out: Apple Mail fakes opens, so they mislead.${d.metricsErr ? ` Metrics API unreachable (${esc(d.metricsErr)}).` : ''}</p></div>
  <div class="card"><div class="lbl">Recent sends</div>${recent}</div>
</section>

<footer class="foot">Fresh on every load · private via Cloudflare Access · site data from Umami, email from Resend.</footer>
</main></body></html>`;
}

const CSS = `
:root{--bg:#141416;--panel:#19191B;--panel2:#212124;--line:#28282B;--edge:#3A3A3D;--ink:#F4F0EA;--g1:#E4E0D9;--g2:#A3A3A0;--g3:#8E8E8A;
  --accent:#7FB58C;--accent-soft:rgba(127,181,140,.16);--btn-ink:#0E0E0F;--bad:#E8806B;--warn:#E3B55E;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#FAF8F4;--panel:#FFFFFF;--panel2:#F2EEE7;--line:#E4DED3;--edge:#CFC7B9;--ink:#0E0E0F;--g1:#2B2A28;--g2:#5E5C57;--g3:#6E6C66;
  --accent:#4F7A5A;--accent-soft:rgba(79,122,90,.12);--btn-ink:#FFFFFF;--bad:#B4402A;--warn:#9A6B12;color-scheme:light}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.5 Geist,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:28px 20px 60px}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:18px}
.brand{font:400 26px/1 Anton,Impact,sans-serif;letter-spacing:.02em}.brand span{color:var(--g3)}
.meta{color:var(--g2);font-size:13px;margin-top:6px}
.range{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pill{font:600 12px/1 'Geist Mono',ui-monospace,monospace;color:var(--g2);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:transparent;cursor:pointer}
.pill:hover{border-color:var(--edge);color:var(--ink)}.pill.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.custom{display:flex;gap:6px;align-items:center}
.custom input{background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:500 12px 'Geist Mono',monospace;padding:6px 8px}
.flash{border-radius:12px;padding:12px 16px;margin-bottom:14px;font-weight:600}.flash.good{border:1px solid var(--accent);color:var(--accent)}.flash.bad{border:1px solid var(--bad);color:var(--bad)}
.alerts{display:grid;gap:8px;margin-bottom:18px}
.alert{display:flex;justify-content:space-between;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--g3);border-radius:4px 12px 12px 4px;padding:11px 16px}
.alert b{display:block;font-size:14px}.alert span{color:var(--g2);font-size:13px}
.alert.ok{border-left-color:var(--accent);color:var(--g2)}.alert.ok b{display:inline;color:var(--ink)}
.alert.blocked{border-left-color:var(--bad)}.alert.warn{border-left-color:var(--warn)}.alert.info{border-left-color:var(--edge)}
.alert button{font:700 12px/1 Geist,sans-serif;letter-spacing:.04em;text-transform:uppercase;background:var(--accent);color:var(--btn-ink);border:0;border-radius:10px;padding:10px 14px;cursor:pointer;white-space:nowrap}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px 22px;min-width:0}
.hero{display:grid;grid-template-columns:1.35fr 1fr;gap:12px}
.lbl{font:600 11px/1.2 'Geist Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--g3)}
.big{font:400 92px/.95 Anton,Impact,sans-serif;letter-spacing:.01em;margin:12px 0 8px;font-variant-numeric:tabular-nums}
.rate .big{font-size:64px}
.sub{color:var(--g2);font-size:13px}
.delta{font:600 12px/1 'Geist Mono',monospace}.delta.good{color:var(--accent)}.delta.bad{color:var(--bad)}
.chart{display:block;width:100%;height:120px;margin-top:16px}.rate .chart{height:80px;margin-top:10px}
.chart .line{fill:none;stroke:var(--accent);stroke-width:2.5}.chart .area{fill:var(--accent-soft)}.chart .dot{fill:var(--accent)}
.chart .bar{fill:var(--edge)}.chart .bar.now{fill:var(--accent)}
.axis{display:flex;justify-content:space-between;font:500 11px 'Geist Mono',monospace;color:var(--g3);margin-top:6px}
.move{display:flex;gap:16px;align-items:baseline;background:var(--ink);color:var(--bg);border-radius:16px;padding:16px 20px;margin:12px 0 4px}
.move .lbl{color:inherit;opacity:.7;flex:none}.move p{margin:0;font-weight:600;font-size:15px}
h2{font:400 30px/1 Anton,Impact,sans-serif;letter-spacing:.01em;margin:34px 0 12px}
h3{font:400 22px/1 Anton,Impact,sans-serif;letter-spacing:.01em;margin:0 0 14px}
.funnel{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.fstep{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px 20px}
.fstep .val{font:400 48px/1 Anton,Impact,sans-serif;margin:10px 0 6px}
.conv{position:absolute;top:16px;right:16px;font:600 12px 'Geist Mono',monospace;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:4px 9px}
.note{color:var(--g3);font-size:12px;margin:10px 2px 0}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}
.grid2{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}
.stats2{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;margin-bottom:18px}
.stats4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stat .val{font:400 32px/1 Anton,Impact,sans-serif;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.stat .sub{font-size:12px}
.list{margin-top:16px}.list .lbl{margin-bottom:10px}
.row{margin-bottom:10px}.row-t{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}
.row-t span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row-t b{font:600 12px 'Geist Mono',monospace;color:var(--g2)}
.track{height:3px;background:var(--line);border-radius:2px;margin-top:5px}.track i{display:block;height:3px;background:var(--accent);border-radius:2px}
.bc{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:13.5px}
.bc span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bc b{font:600 12px 'Geist Mono',monospace;color:var(--accent);flex:none}
.bc:first-of-type{border-top:0}
.muted{color:var(--g3);font-size:13px;margin:6px 0}
.foot{color:var(--g3);font-size:12px;border-top:1px solid var(--line);margin-top:34px;padding-top:16px}
@media (max-width:900px){.hero,.grid3,.grid2{grid-template-columns:1fr}.funnel{grid-template-columns:1fr 1fr}.stats4{grid-template-columns:1fr 1fr}}
@media (max-width:520px){.wrap{padding:20px 16px 48px}.big{font-size:72px}.rate .big{font-size:52px}.move{flex-direction:column;gap:6px}.alert{flex-direction:column;align-items:flex-start}.fstep .val{font-size:38px}.conv{position:static;display:inline-block;margin-top:8px}}
`;

export function digestText(d) {
  const e = d.ev, v = d.kpi.visitors;
  const L = ['SQWOD.LIFE · WEEKLY PULSE (last 7 days)', ''];
  L.push(`Subscribers: ${num(d.list.total)}  (+${num(d.list.newIn7)} this week)`);
  if (!d.siteErr) {
    L.push(`Visitors: ${num(v)} · signup rate ${pctOf(d.list.newInWindow, v)}`);
    L.push(`Engaged: ${num(e.reads)} full reads · ${num(e.plays)} listens (${pctOf(e.complete, e.plays)} finished)`);
    L.push(`Money: ${num(e.deals)} deal clicks · ${num(e.sponsor)} sponsor clicks · ${num(e.spotify)} Spotify clicks`);
    const top = Array.isArray(d.sources) && d.sources[0] ? `${d.sources[0].x} (${d.sources[0].y})` : '—';
    L.push(`Top source: ${top}`);
  } else L.push('(Umami unreachable. Check the UMAMI_ settings.)');
  if (d.mt) L.push(`Email: ${num(d.mt.delivered)} delivered · ${rate(d.mt.click_rate)} click · ${rate(d.mt.unsubscribe_rate)} unsub`);
  L.push('', `Move: ${moveLine(d)}`);
  return L.join('\n');
}
function alertsText(q, dashUrl) {
  if (!q.length) return 'NEEDS YOU\n\nNothing. Everything the automation produced went out.';
  const L = [`NEEDS YOU (${q.length})`, ''];
  q.forEach((it, i) => { L.push(`${i + 1}. [${it.level === 'blocked' ? 'BLOCKED' : 'WATCH'}] ${it.title}`, `   ${it.detail}`, ''); });
  L.push(dashUrl);
  return L.join('\n');
}

// Starts the "Generate content" GitHub workflow (content.yml) via workflow_dispatch.
// Needs secret GITHUB_TOKEN: a fine-grained token for teemajor/sqwod-life with
// "Actions: Read and write" only. The workflow skips itself if today already shipped,
// so a retry or GitHub's late fallback schedule can never send the Daily twice.
async function triggerDaily(env) {
  const repo = env.GITHUB_REPO || 'teemajor/sqwod-life';
  const alert = async (why) => {
    console.log(`daily trigger failed: ${why}`);
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;
    await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM, to: env.DIGEST_TO || 'tee@teemajor.com',
        subject: 'Sqwod Daily: the 06:00 start failed',
        text: `Cloudflare could not start today's Daily (${why}).\n\nGitHub's own schedule will still run it later today as a fallback. To run it now: https://github.com/${repo}/actions/workflows/content.yml → Run workflow.` }),
    }).catch(() => {});
  };
  if (!env.GITHUB_TOKEN) return alert('GITHUB_TOKEN secret is not set');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/content.yml/dispatches`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'user-agent': 'sqwod-dashboard-worker', 'content-type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    }).catch((e) => ({ ok: false, status: String(e) }));
    if (r.ok) { console.log(`daily trigger: dispatched (attempt ${attempt})`); return; }
    if (r.status === 401 || r.status === 403 || r.status === 404) return alert(`GitHub said ${r.status}: the token is wrong, expired, or lacks Actions write access`);
    await new Promise((res) => setTimeout(res, 20000));
  }
  return alert('GitHub did not answer after 3 tries');
}
