#!/usr/bin/env node
// Sqwod Score integrity check. Two invariants, both visible to readers:
//
//  1. HEADLINE vs BARS. A review page shows a big "Sqwod Assessment" number and,
//     directly below it, the per-criterion bars it summarises. A reader (or a
//     brand's marketing team) will average those bars and expect the headline back.
//     assessment.score must equal mean(criteria) x 10, within TOLERANCE.
//
//  2. TOTAL vs PARTS. The methodology page says the Sqwod Score is 45% crowd,
//     40% assessment and 15% value. sqwodScore must equal that blend, within
//     TOLERANCE.
//
// History: on 2026-08-28, 28 of 58 reviews broke rule 1 (worst: AG1, 72 over bars
// averaging 59) and were grandfathered as warnings. All 28 were rescored on
// 2026-10-17 (corrections log entry of that date) and the amnesty list was
// removed. Rule 2 was added the same day after 5 reviews were found off their own
// blend. Both rules now fail the build. There is no exception list: if a score
// is wrong, fix the score.
//
//   node scripts/check-assessment.mjs
//
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/reviews';
// Bars are one decimal and headlines whole numbers, so a hair of slack keeps
// honest entries from tripping the build.
const TOLERANCE = 1.0;
const W = { crowd: 0.45, assessment: 0.40, value: 0.15 };

const frontmatter = (t) => t.split('---')[1] ?? '';
const num = (fm, re) => { const m = fm.match(re); return m ? Number(m[1]) : null; };
const r1 = (x) => Math.round(x * 10) / 10;

const rows = [];
for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith('.md')) continue;
  const fm = frontmatter(readFileSync(join(DIR, file), 'utf8'));
  if (/^draft:\s*true/m.test(fm)) continue;

  const stated = num(fm, /^assessment:\s*\n\s*score:\s*([\d.]+)/m);
  const crowd = num(fm, /^crowd:\s*\n\s*score:\s*([\d.]+)/m);
  const value = num(fm, /^value:\s*\n\s*score:\s*([\d.]+)/m);
  const total = num(fm, /^sqwodScore:\s*([\d.]+)/m);
  // criteria live between `assessment:` and the next top-level key (`value:`)
  const block = fm.match(/^assessment:[\s\S]*?(?=^value:)/m)?.[0] ?? '';
  const criteria = [...block.matchAll(/score:\s*([\d.]+)\s*\}/g)].map((m) => Number(m[1]));
  if (stated === null || criteria.length === 0) continue;

  const derived = (criteria.reduce((a, b) => a + b, 0) / criteria.length) * 10;
  const blend = crowd !== null && value !== null ? W.crowd * crowd + W.assessment * stated + W.value * value : null;
  rows.push({
    file, stated, total,
    derived: r1(derived), gap: r1(stated - derived),
    blend: blend === null ? null : r1(blend), blendGap: blend === null || total === null ? 0 : r1(total - blend),
  });
}

const bars = rows.filter((r) => Math.abs(r.gap) > TOLERANCE);
const blends = rows.filter((r) => Math.abs(r.blendGap) > TOLERANCE);

console.log(`Sqwod Score integrity · ${rows.length} review files · tolerance ±${TOLERANCE}`);

if (bars.length) {
  console.error(`\n✗ ${bars.length} review(s) where the Assessment headline contradicts its own bars:\n`);
  for (const r of bars.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))) {
    console.error(`  ${r.file}: assessment.score is ${r.stated}, criteria average ${r.derived} (${r.gap > 0 ? '+' : ''}${r.gap})`);
  }
  console.error(`\n  Set assessment.score to the criteria average, or fix the criteria.`);
}
if (blends.length) {
  console.error(`\n✗ ${blends.length} review(s) where sqwodScore is not 45% crowd + 40% assessment + 15% value:\n`);
  for (const r of blends.sort((a, b) => Math.abs(b.blendGap) - Math.abs(a.blendGap))) {
    console.error(`  ${r.file}: sqwodScore is ${r.total}, the blend is ${r.blend} (${r.blendGap > 0 ? '+' : ''}${r.blendGap})`);
  }
  console.error(`\n  Set sqwodScore to the rounded blend. The methodology page promises these weights.`);
}
if (bars.length || blends.length) {
  console.error(`\n  A changed published score is an editorial act: add a corrections-log entry.\n`);
  process.exit(1);
}

console.log('\n✓ Every headline matches its bars and every Sqwod Score matches its blend.');
