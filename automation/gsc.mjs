#!/usr/bin/env node
// Search Console → demand signal (weekly).
//
// Pulls the last 28 days of query + page data for sc-domain:sqwod.life from
// the Search Console API, writes automation/gsc/<date>.json + latest.json,
// and emails Tee a short digest: what people searched to find us, which
// queries sit in "striking distance" (position 5–20: one better article away
// from page one), and which pages earn clicks. This is the only SEO loop that
// compounds — it feeds real search demand back into the content engine.
//
// Dependency-free (Node 20+): signs the service-account JWT with node:crypto.
//
// ENV (GitHub secrets):
//   GSC_SERVICE_ACCOUNT_JSON  – the full JSON key of a Google service account
//                               that has been added as a user (Full/Restricted)
//                               on the sqwod.life Domain property in Search Console
//   RESEND_API_KEY, RESEND_FROM – digest email (optional; skipped if missing)
//   GSC_DIGEST_TO             – recipient (default tee@teemajor.com)
//
// Usage: node automation/gsc.mjs [--days=28] [--site=sc-domain:sqwod.life] [--no-email]

import { createSign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SITE = args.site || 'sc-domain:sqwod.life';
const DAYS = Number(args.days || 28);
const OUT = join(process.cwd(), 'automation', 'gsc');
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
// GSC data lags ~2–3 days; end the window 3 days ago so numbers are final.
const end = new Date(today); end.setUTCDate(end.getUTCDate() - 3);
const start = new Date(end); start.setUTCDate(start.getUTCDate() - DAYS);

const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('::error::GSC_SERVICE_ACCOUNT_JSON missing — add the service-account key as a GitHub secret.'); process.exit(1); }
const sa = JSON.parse(raw);

// --- OAuth2 for service accounts: self-signed JWT → access token ---
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function query(token, dimensions, extra = {}) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions, rowLimit: 1000, dataState: 'final', ...extra }),
  });
  if (!res.ok) throw new Error(`searchAnalytics ${dimensions}: ${res.status} ${await res.text()}`);
  const rows = (await res.json()).rows || [];
  return rows.map((r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: +(r.ctr * 100).toFixed(1), position: +r.position.toFixed(1) }));
}

const token = await accessToken();
const [byQuery, byPage, byQueryPage, byCountry] = await Promise.all([
  query(token, ['query']),
  query(token, ['page']),
  query(token, ['query', 'page']),
  query(token, ['country']),
]);

const totals = byQuery.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
const lang = (u) => (/\/de\//.test(u) ? 'de' : /\/en\//.test(u) ? 'en' : '-');
const isQuestion = (q) => /^(how|what|why|which|when|is|are|does|do|can|should|best|vs|wie|was|warum|welche|wann|ist|sind|kann|soll|beste|kosten)\b/i.test(q) || /\bvs\.?\b/i.test(q);

// Striking distance: real impressions, not yet on page one → one better page away.
const striking = byQueryPage
  .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 10)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 40)
  .map((r) => ({ query: r.keys[0], page: r.keys[1], lang: lang(r.keys[1]), impressions: r.impressions, clicks: r.clicks, position: r.position }));

const questions = byQuery.filter((r) => isQuestion(r.keys[0])).sort((a, b) => b.impressions - a.impressions).slice(0, 40)
  .map((r) => ({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, position: r.position }));

// Demand without supply: queries with impressions where our best page is NOT
// a dedicated article/review (home, index pages) → content-engine candidates.
const indexLike = (u) => /\/(en|de)\/(daily|intelligence|articles|verified|evidence|best|beste)?\/?$/.test(u) || /\/(en|de)\/$/.test(u);
const gaps = byQueryPage.filter((r) => indexLike(r.keys[1]) && r.impressions >= 5).sort((a, b) => b.impressions - a.impressions).slice(0, 30)
  .map((r) => ({ query: r.keys[0], landedOn: r.keys[1], impressions: r.impressions, position: r.position }));

const out = {
  site: SITE, window: { start: iso(start), end: iso(end), days: DAYS }, generatedAt: new Date().toISOString(),
  totals: { ...totals, ctr: totals.impressions ? +((totals.clicks / totals.impressions) * 100).toFixed(1) : 0, queries: byQuery.length, pages: byPage.length },
  topQueries: byQuery.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50).map((r) => ({ query: r.keys[0], ...r, keys: undefined })),
  topPages: byPage.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50).map((r) => ({ page: r.keys[0], lang: lang(r.keys[0]), ...r, keys: undefined })),
  striking, questions, gaps,
  countries: byCountry.sort((a, b) => b.impressions - a.impressions).slice(0, 10).map((r) => ({ country: r.keys[0], ...r, keys: undefined })),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${iso(today)}.json`), JSON.stringify(out, null, 2));
writeFileSync(join(OUT, 'latest.json'), JSON.stringify(out, null, 2));
console.log(`GSC ${iso(start)}→${iso(end)}: ${totals.clicks} clicks / ${totals.impressions} impressions, ${byQuery.length} queries, ${byPage.length} pages → automation/gsc/latest.json`);

// --- Digest email ---
if (args['no-email'] || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) process.exit(0);
const row = (r, keys) => keys.map((k) => String(r[k] ?? '')).join('  ·  ');
const section = (title, rows, keys) => rows.length ? `\n${title}\n${'-'.repeat(title.length)}\n${rows.map((r) => row(r, keys)).join('\n')}\n` : `\n${title}\n${'-'.repeat(title.length)}\n(nothing yet)\n`;
const text = [
  `sqwod.life — Search Console pulse (${iso(start)} → ${iso(end)})`,
  `Clicks ${totals.clicks} · Impressions ${totals.impressions} · CTR ${out.totals.ctr}% · ${byQuery.length} queries · ${byPage.length} pages with impressions`,
  section('STRIKING DISTANCE (pos 5–20, write/upgrade the page → page one)', striking.slice(0, 15), ['query', 'impressions', 'position', 'page']),
  section('QUESTIONS PEOPLE ASK (feed these to the content engine)', questions.slice(0, 15), ['query', 'impressions', 'position']),
  section('DEMAND WITHOUT A DEDICATED PAGE (landed on an index page)', gaps.slice(0, 10), ['query', 'impressions', 'landedOn']),
  section('TOP PAGES BY CLICKS', out.topPages.slice(0, 10), ['clicks', 'impressions', 'page']),
  `\nFull data: automation/gsc/latest.json in the repo.`,
].join('\n');
await fetch('https://api.resend.com/emails', {
  method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ from: process.env.RESEND_FROM, to: process.env.GSC_DIGEST_TO || 'tee@teemajor.com', subject: `🔎 Search pulse: ${totals.clicks} clicks · ${striking.length} striking-distance queries`, text }),
}).then((r) => console.log('digest email:', r.status)).catch((e) => console.warn('digest email failed:', e.message));
