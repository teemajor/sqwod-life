#!/usr/bin/env node
/**
 * Tells Google's Indexing API that the two Sqwod Jobs pages changed (urlNotifications:publish),
 * after each jobs run. Uses the Search Console service account from gsc.mjs
 * (GSC_SERVICE_ACCOUNT_JSON); "Web Search Indexing API" must be enabled for it in GCP project
 * sqwod-life-seo, and the account must be an owner of the property in Search Console.
 *
 * Off while JOBS_JSONLD_ON_LIST (site/src/config/seo.mjs) is false: the Indexing API only
 * accepts pages with JobPosting markup, and Google wants that markup on one-job pages, not
 * on a list. Any auth or scope problem is logged and the run carries on (exit 0).
 *
 *   node automation/jobs-indexing.mjs [--dry]
 */
import { createSign } from 'node:crypto';
import { JOBS_JSONLD_ON_LIST } from '../site/src/config/seo.mjs';

const URLS = ['https://sqwod.life/en/jobs/', 'https://sqwod.life/de/jobs/'];
const dry = process.argv.includes('--dry');

if (!JOBS_JSONLD_ON_LIST) { console.log('jobs-indexing: off (JOBS_JSONLD_ON_LIST is false in site/src/config/seo.mjs), nothing sent'); process.exit(0); }
const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
if (!raw) { console.log('jobs-indexing: GSC_SERVICE_ACCOUNT_JSON not set, skipped'); process.exit(0); }
if (dry) { console.log(`jobs-indexing: dry run, would publish ${URLS.join(', ')}`); process.exit(0); }

const sa = JSON.parse(raw);
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

try {
  const token = await accessToken();
  for (const url of URLS) {
    const r = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    console.log(r.ok ? `✓ indexing: ${url}` : `! indexing ${url}: ${r.status} ${(await r.text()).slice(0, 200)} (is the Indexing API enabled for this service account?)`);
  }
} catch (e) {
  console.log(`! indexing skipped: ${e.message}`);
}
