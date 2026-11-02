// Sqwod site search index (1 Nov 2026). Runs after `astro build`:
//   1. Pagefind indexes every built page that carries data-pagefind-body (Base.astro marks
//      content pages only, so listings, legal and landing pages stay out). The <html lang>
//      attribute splits the index into EN and DE automatically.
//   2. Jobs, deals and investors are rows on list pages, not pages of their own, so they are
//      added as custom records from /data/search-records.json with anchor URLs.
// Output: dist/pagefind/ (JS, WASM, index chunks). The site loads it on first search.
import * as pagefind from 'pagefind';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const t0 = Date.now();
const { index, errors } = await pagefind.createIndex({ verbose: false });
if (errors?.length) { console.error(errors.join('\n')); process.exit(1); }

const pages = await index.addDirectory({ path: DIST });
if (pages.errors?.length) { console.error(pages.errors.join('\n')); process.exit(1); }

let custom = 0;
const recPath = join(DIST, 'data', 'search-records.json');
if (existsSync(recPath)) {
  const records = JSON.parse(readFileSync(recPath, 'utf8'));
  for (const r of records) {
    const res = await index.addCustomRecord({
      url: r.url, content: r.content, language: r.lang,
      meta: { title: r.title, kind: r.kind, sub: r.sub || '', date: r.date || '' },
      filters: { kind: [r.kind] },
      sort: r.date ? { date: r.date } : undefined,
    });
    if (res.errors?.length) console.error(r.url, res.errors.join('; '));
    else custom++;
  }
}
const out = await index.writeFiles({ outputPath: join(DIST, 'pagefind') });
if (out.errors?.length) { console.error(out.errors.join('\n')); process.exit(1); }
await pagefind.close();
console.log(`search index: ${pages.page_count} pages + ${custom} records in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
