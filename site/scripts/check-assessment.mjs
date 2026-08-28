#!/usr/bin/env node
// Sqwod Score integrity check — does the headline match the bars underneath it?
//
// A review page shows a big "Sqwod Assessment" number and, directly below it, the
// per-criterion bars it is supposed to summarise. A reader — or a brand's marketing
// team — will average those bars and expect the headline back. On 2026-08-28 that
// held for 30 of 58 reviews. 28 drift by more than a point — 15 read HIGHER than
// their own bars and 13 read lower — the worst being AG1 at 72 over bars averaging 59.
//
// `assessment.score` is authored by hand, so nothing stopped it drifting from the
// criteria list beside it. This check is what stops it drifting again.
//
// It is deliberately NOT a clean pass/fail over the whole corpus. The 28 reviews
// that already drifted are listed in GRANDFATHERED below: they warn, they do not
// fail, because rescoring a published number is an editorial act that needs a
// corrections-log entry, not a silent code change. Everything else fails hard at
// the first tenth of a point.
//
// The list only ever shrinks. Rescore a review, drop its slug, and the build tells
// you if you were wrong. When GRANDFATHERED is empty the debt is paid and this
// becomes an ordinary invariant.
//
//   node scripts/check-assessment.mjs           # fail on new drift, warn on known
//   node scripts/check-assessment.mjs --strict  # fail on ALL drift, ignore the list
//
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/reviews';
// Rounding in the source files is coarse (bars are one decimal, headlines whole
// numbers), so a hair of slack keeps honest entries from tripping the build.
const TOLERANCE = 1.0;
const STRICT = process.argv.includes('--strict');

// Known drift as of 2026-08-28. DO NOT ADD TO THIS LIST — that is what the check
// exists to prevent. Removing entries is the only intended edit.
const GRANDFATHERED = new Set([
  'ag1-athletic-greens', 'apple-watch-11', 'apple-watch-9', 'blackroll-standard',
  'compex-sp-80', 'eight-sleep-pod-4', 'eight-sleep-pod-5', 'esn-ultrapure-creatine',
  'garmin-forerunner-965', 'hyperice-hypervolt-2', 'loop-quiet-2', 'manta-sleep-mask',
  'muse-s-athena', 'myprotein-impact-whey', 'new-balance-1080-v14', 'nike-pegasus-42',
  'oura-ring-5', 'oura-ring-gen3', 'peloton-bike', 'pushpress',
  'ten-thousand-interval-short', 'trainingpeaks', 'vivobarefoot-primus-lite',
  'vuori-kore-short', 'wahoo-kickr-core', 'whoop-4', 'whoop-5', 'withings-scanwatch-2',
]);

const frontmatter = (t) => t.split('---')[1] ?? '';
const num = (fm, re) => { const m = fm.match(re); return m ? Number(m[1]) : null; };

const rows = [];
for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith('.md')) continue;
  const fm = frontmatter(readFileSync(join(DIR, file), 'utf8'));
  if (/^draft:\s*true/m.test(fm)) continue;

  const stated = num(fm, /^assessment:\s*\n\s*score:\s*([\d.]+)/m);
  // criteria live between `assessment:` and the next top-level key (`value:`)
  const block = fm.match(/^assessment:[\s\S]*?(?=^value:)/m)?.[0] ?? '';
  const criteria = [...block.matchAll(/score:\s*([\d.]+)\s*\}/g)].map((m) => Number(m[1]));

  if (stated === null || criteria.length === 0) continue;
  const derived = (criteria.reduce((a, b) => a + b, 0) / criteria.length) * 10;
  rows.push({
    slug: file.replace(/\.(en|de)\.md$/, ''),
    file,
    stated,
    derived: Math.round(derived * 10) / 10,
    gap: Math.round((stated - derived) * 10) / 10,
  });
}

const drifted = rows.filter((r) => Math.abs(r.gap) > TOLERANCE);
const fresh = drifted.filter((r) => STRICT || !GRANDFATHERED.has(r.slug));
const known = drifted.filter((r) => !STRICT && GRANDFATHERED.has(r.slug));
// A slug that no longer drifts should come off the list, or the list stops meaning
// anything — it would quietly start granting amnesty to future regressions.
const healed = [...GRANDFATHERED].filter(
  (s) => rows.some((r) => r.slug === s) && !drifted.some((r) => r.slug === s),
);

console.log(`Sqwod Score integrity · ${rows.length} review files · tolerance ±${TOLERANCE}`);

if (known.length) {
  console.log(`\n  ${known.length} known drift (grandfathered 2026-08-28, pending rescore):`);
  for (const r of known.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 5)) {
    console.log(`    ~ ${r.file}: shows ${r.stated}, bars average ${r.derived} (${r.gap > 0 ? '+' : ''}${r.gap})`);
  }
  if (known.length > 5) console.log(`    ~ …and ${known.length - 5} more`);
}

if (healed.length) {
  console.log(`\n  ${healed.length} slug(s) no longer drift — remove them from GRANDFATHERED:`);
  for (const s of healed) console.log(`    ✓ ${s}`);
}

if (fresh.length) {
  console.error(`\n✗ ${fresh.length} review(s) where the headline contradicts its own bars:\n`);
  for (const r of fresh.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))) {
    console.error(`  ${r.file}`);
    console.error(`    assessment.score is ${r.stated}, but its criteria average ${r.derived} (${r.gap > 0 ? '+' : ''}${r.gap})`);
  }
  console.error(
    `\n  The page prints those bars directly under that number, so a reader who averages\n` +
    `  them expects it back. Either set assessment.score to the criteria average, or fix\n` +
    `  the criteria — do not add the slug to GRANDFATHERED.\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ No new drift.` +
  (known.length ? ` ${known.length} known case(s) still awaiting rescore.` : ' Corpus is clean.'),
);
