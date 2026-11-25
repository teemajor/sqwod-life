#!/usr/bin/env node
// Chart data sanity check over src/content/articles (Nov 2026).
// Two report bugs reached the live site in Nov 2026; this stops them coming back:
//   1. FRACTION-AS-PERCENT: a "%" chart whose values are all between 0 and 1 (0.57 instead of 57),
//      so readers saw "0.57 %". Store shares as percentages.
//   2. LABEL/DATA SHIFT: a chart title says one year range (e.g. "2009-2023") but its data runs over
//      another (2019-2029). This is how the DE copy of a report ended up with every title one chart off.
//
//   npm run check:charts    exit 1 with a list of problems, 0 when clean
// A chart that really is all sub-1% values can opt out with `allowSmallPct: true` on that chart.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const DIR = fileURLToPath(new URL('../src/content/articles', import.meta.url));
const problems = [];
const years = (s) => (String(s).match(/\b(19|20)\d{2}\b/g) || []).map(Number);

for (const f of (await readdir(DIR)).filter((n) => /\.mdx?$/.test(n)).sort()) {
  const text = await readFile(join(DIR, f), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let d;
  try { d = yaml.load(m[1]); } catch { continue; }
  (d.charts || []).forEach((c, i) => {
    const where = `${f} chart ${i + 1} "${String(c.label).slice(0, 60)}"`;
    const vals = (c.series || []).flatMap((s) => (s.points || []).filter((p) => p != null));
    if (/%|prozent|percent/i.test(c.unit || '') && !c.allowSmallPct && vals.length >= 2 &&
        vals.every((v) => v >= 0 && v <= 1) && vals.some((v) => v > 0)) {
      problems.push(`${where}: unit is % but every value is 0-1 (e.g. ${vals[0]}). Store 57, not 0.57.`);
    }
    if (c.kind !== 'categorical') {
      const ly = years(c.label);
      const cy = (c.categories || []).flatMap(years);
      if (ly.length >= 2 && cy.length >= 2) {
        const [lf, ll] = [Math.min(...ly), Math.max(...ly)];
        const [cf, cl] = [Math.min(...cy), Math.max(...cy)];
        if (lf !== cf || ll !== cl) problems.push(`${where}: title says ${lf}-${ll} but the data runs ${cf}-${cl}. Title and data may be mismatched.`);
      }
    }
  });
}

if (problems.length) {
  console.error(`check:charts found ${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log('check:charts: all report charts OK');
