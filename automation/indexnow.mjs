// IndexNow ping after every deploy (added 30 Oct 2026).
// WHY: Search Console showed 2 indexed pages after 4.5 months; Google never read
// sitemap-0.xml. IndexNow tells Bing, DuckDuckGo, Yandex and the AI search engines
// that use Bing's index about new/changed URLs within minutes instead of waiting
// to be crawled. Google ignores IndexNow, so the GSC sitemap stays the Google path.
// The key is public by design (it only proves we control the domain): the file
// site/public/<key>.txt serves the same string.
const KEY = '20a5f2020f8504abe91d1295fb751b1d';
const HOST = 'sqwod.life';
const SITEMAP = `https://${HOST}/sitemap-0.xml`;

const xml = await (await fetch(SITEMAP)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) { console.error('indexnow: sitemap had no URLs'); process.exit(1); }

// IndexNow accepts up to 10,000 URLs per POST. Submit all of them: the engines
// dedupe, and unchanged URLs cost nothing.
const res = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`indexnow: sent ${urls.length} URLs, status ${res.status}`);
if (res.status >= 400) { console.error(await res.text()); process.exit(1); }
