/**
 * Sqwod Command Center — one private dashboard for SITE (Umami) + EMAIL (Resend).
 *
 * Reads from:
 *   • Self-hosted Umami API (your Railway instance, /api, bearer token from login)
 *     → pageviews, visitors, top pages, sources, and the custom events
 *     (subscribe / share / report-unlock / move-watch). Free — we own it.
 *   • Resend API            (api.resend.com, Bearer)  → audience (list) sizes
 *     and recent broadcasts.
 *
 * Auth: put this Worker behind Cloudflare Access (email policy). As defense in
 * depth it also checks the Cf-Access-Authenticated-User-Email header against
 * ALLOWED_EMAILS when that var is set.
 *
 * Secrets (wrangler secret put):  UMAMI_USERNAME, UMAMI_PASSWORD, RESEND_API_KEY
 * Vars (wrangler.toml):           UMAMI_URL, UMAMI_WEBSITE_ID, RESEND_AUDIENCE_EN,
 *                                 RESEND_AUDIENCE_DE, ALLOWED_EMAILS
 */

const RESEND_API = 'https://api.resend.com';

const INK = '#0e0e10', PANEL = '#161619', LINE = '#2a2a30', CHALK = '#fff',
      G2 = '#9a9aa1', G4 = '#6b6b72', UP = '#3ad17a', DOWN = '#ff6b61', ACCENT = '#fff';

export default {
  async fetch(request, env) {
    // --- gate (defense in depth; Cloudflare Access is the real enforcement) ---
    const who = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allow = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(who)) {
      return new Response('Forbidden — this dashboard is private.', { status: 403 });
    }

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
    const endAt = Date.now();
    const startAt = endAt - days * 86400000;

    // Self-hosted Umami auth: log in with username/password to get a bearer token.
    const umamiUrl = (env.UMAMI_URL || '').replace(/\/$/, '');
    let token = '';
    try {
      const lr = await fetch(`${umamiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: env.UMAMI_USERNAME, password: env.UMAMI_PASSWORD }),
      });
      if (lr.ok) token = (await lr.json()).token || '';
    } catch (_) { /* token stays '' → umami panels show "unreachable" */ }

    const uHead = { authorization: `Bearer ${token}`, accept: 'application/json' };
    const rHead = { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: 'application/json' };
    const wid = env.UMAMI_WEBSITE_ID;
    const uBase = `${umamiUrl}/api/websites/${wid}`;
    const qs = `startAt=${startAt}&endAt=${endAt}`;

    const jget = async (u, headers) => {
      try {
        const r = await fetch(u, { headers });
        if (!r.ok) return { __err: `${r.status}` };
        return await r.json();
      } catch (e) { return { __err: String(e) }; }
    };

    // --- pull everything in parallel; each failure degrades gracefully ---
    const [stats, pages, sources, events, series, audiences, broadcasts] = await Promise.all([
      jget(`${uBase}/stats?${qs}`, uHead),
      jget(`${uBase}/metrics?${qs}&type=url`, uHead),
      jget(`${uBase}/metrics?${qs}&type=referrer`, uHead),
      jget(`${uBase}/metrics?${qs}&type=event`, uHead),
      jget(`${uBase}/pageviews?${qs}&unit=day&timezone=Europe/Berlin`, uHead),
      jget(`${RESEND_API}/audiences`, rHead),
      jget(`${RESEND_API}/broadcasts`, rHead),
    ]);

    // resend list sizes (optional audiences)
    const sizeOf = async (id) => {
      if (!id) return null;
      const r = await jget(`${RESEND_API}/audiences/${id}/contacts`, rHead);
      return Array.isArray(r?.data) ? r.data.length : null;
    };
    const [enSize, deSize] = await Promise.all([sizeOf(env.RESEND_AUDIENCE_EN), sizeOf(env.RESEND_AUDIENCE_DE)]);

    const html = renderPage({
      days, who, stats, pages, sources, events, series,
      audiences, broadcasts, enSize, deSize,
    });
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
};

// ---------- render ----------
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const evMap = { subscribe: 'Subscribes', share: 'Shares', 'report-unlock': 'Report unlocks', 'move-watch': 'Move watches' };

function delta(cur, prev) {
  if (prev == null || cur == null || prev === 0) return '';
  const d = Math.round(((cur - prev) / prev) * 100);
  const up = d >= 0;
  return `<span style="color:${up ? UP : DOWN};font:700 12px/1 ui-monospace,monospace;">${up ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
}

function kpi(label, value, sub = '') {
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${G4};">${label}</div>
    <div style="font:800 30px/1.05 -apple-system,system-ui,sans-serif;color:${CHALK};margin-top:10px;letter-spacing:-.02em;">${value}</div>
    <div style="margin-top:8px;min-height:14px;">${sub}</div>
  </div>`;
}

function list(title, rows) {
  const body = rows.length
    ? rows.map((r) => `<tr>
        <td style="padding:8px 0;border-top:1px solid ${LINE};font:500 14px/1.4 -apple-system,system-ui,sans-serif;color:${CHALK};max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.x)}</td>
        <td style="padding:8px 0;border-top:1px solid ${LINE};text-align:right;font:700 14px/1 ui-monospace,monospace;color:${G2};">${num(r.y)}</td>
      </tr>`).join('')
    : `<tr><td style="padding:12px 0;color:${G4};font:400 13px sans-serif;">No data yet.</td></tr>`;
  return `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${G4};margin-bottom:6px;">${title}</div>
    <table width="100%" cellpadding="0" cellspacing="0">${body}</table>
  </div>`;
}

function sparkline(series) {
  const pts = Array.isArray(series?.pageviews) ? series.pageviews : [];
  if (pts.length < 2) return '';
  const ys = pts.map((p) => p.y || 0);
  const max = Math.max(...ys, 1);
  const W = 600, H = 70;
  const step = W / (ys.length - 1);
  const d = ys.map((y, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(H - (y / max) * (H - 8) - 4).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block;">
    <path d="${d}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
  </svg>`;
}

function renderPage(d) {
  const s = d.stats || {};
  const ev = Array.isArray(d.events) ? d.events : [];
  const evRow = (name) => { const f = ev.find((e) => e.x === name); return f ? f.y : 0; };
  const pages = (Array.isArray(d.pages) ? d.pages : []).slice(0, 8);
  const sources = (Array.isArray(d.sources) ? d.sources : []).slice(0, 8);
  const bdata = Array.isArray(d.broadcasts?.data) ? d.broadcasts.data : [];
  const recent = bdata.slice(0, 6).map((b) => `<tr>
      <td style="padding:8px 0;border-top:1px solid ${LINE};font:500 13px/1.4 sans-serif;color:${CHALK};">${esc(b.name || b.id)}</td>
      <td style="padding:8px 0;border-top:1px solid ${LINE};text-align:right;font:700 11px/1 ui-monospace,monospace;color:${G2};text-transform:uppercase;">${esc(b.status || '—')}</td>
    </tr>`).join('') || `<tr><td style="padding:12px 0;color:${G4};font:400 13px sans-serif;">No broadcasts yet.</td></tr>`;

  const range = (n, lbl) => `<a href="?days=${n}" style="font:700 12px/1 ui-monospace,monospace;text-decoration:none;padding:7px 12px;border-radius:999px;border:1px solid ${LINE};color:${d.days === n ? INK : G2};background:${d.days === n ? CHALK : 'transparent'};">${lbl}</a>`;

  const emailErr = d.broadcasts?.__err || d.audiences?.__err;
  const siteErr = s.__err;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sqwod Command Center</title>
<style>*{box-sizing:border-box}body{margin:0;background:${INK};color:${CHALK};font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif}</style></head>
<body>
<div style="max-width:1040px;margin:0 auto;padding:30px 20px 60px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font:900 24px/1 sans-serif;letter-spacing:.02em;">SQWOD <span style="color:${G4};font-weight:600;">COMMAND CENTER</span></div>
      <div style="font:500 12px/1.4 ui-monospace,monospace;color:${G4};margin-top:8px;">Last ${d.days} days · site + email · ${d.who ? esc(d.who) : 'private'}</div>
    </div>
    <div style="display:flex;gap:8px;">${range(7, '7d')}${range(30, '30d')}${range(90, '90d')}</div>
  </div>

  <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${G4};margin:30px 0 14px;">Site · Umami</div>
  ${siteErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Umami unreachable (${esc(siteErr)}). Check UMAMI_API_KEY / UMAMI_WEBSITE_ID.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
    ${kpi('Visitors', num(s.visitors?.value), delta(s.visitors?.value, s.visitors?.prev))}
    ${kpi('Pageviews', num(s.pageviews?.value), delta(s.pageviews?.value, s.pageviews?.prev))}
    ${kpi('Visits', num(s.visits?.value), delta(s.visits?.value, s.visits?.prev))}
    ${kpi('Bounces', num(s.bounces?.value), delta(s.bounces?.value, s.bounces?.prev))}
  </div>
  <div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:16px 20px;margin-top:14px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${G4};margin-bottom:12px;">Pageviews / day</div>
    ${sparkline(d.series) || `<div style="color:${G4};font:400 13px sans-serif;">Not enough data yet.</div>`}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
    ${list('Top pages', pages)}
    ${list('Top sources', sources)}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px;">
    ${kpi(evMap.subscribe, num(evRow('subscribe')))}
    ${kpi(evMap.share, num(evRow('share')))}
    ${kpi(evMap['report-unlock'], num(evRow('report-unlock')))}
    ${kpi(evMap['move-watch'], num(evRow('move-watch')))}
  </div>`}

  <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${G4};margin:34px 0 14px;">Email · Resend</div>
  ${emailErr ? `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:16px 20px;color:${DOWN};font:500 13px sans-serif;">Resend unreachable (${esc(emailErr)}). Check RESEND_API_KEY.</div>` : `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
    ${kpi('List · EN', num(d.enSize), `<span style="font:500 11px ui-monospace,monospace;color:${G4};">subscribers</span>`)}
    ${kpi('List · DE', num(d.deSize), `<span style="font:500 11px ui-monospace,monospace;color:${G4};">subscribers</span>`)}
    ${kpi('Total list', num((d.enSize || 0) + (d.deSize || 0)), `<span style="font:500 11px ui-monospace,monospace;color:${G4};">north-star</span>`)}
  </div>
  <div style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;padding:18px 20px;margin-top:14px;">
    <div style="font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:${G4};margin-bottom:6px;">Recent broadcasts</div>
    <table width="100%" cellpadding="0" cellspacing="0">${recent}</table>
    <div style="font:400 11px/1.5 sans-serif;color:${G4};margin-top:12px;">Open / click rates per broadcast: Resend → Broadcasts (enable Open + Click tracking on the domain). This panel tracks list growth + send status; the email→site conversions live in the Site events above via the daily UTMs.</div>
  </div>`}

  <div style="font:400 11px/1.6 sans-serif;color:${G4};margin-top:34px;border-top:1px solid ${LINE};padding-top:16px;">
    Sqwod Command Center · data fresh on each load (no cache). Private via Cloudflare Access. Site = Umami (EU, cookieless) · Email = Resend · joined by daily UTMs.
  </div>
</div>
</body></html>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
