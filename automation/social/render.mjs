#!/usr/bin/env node
// Renders this week's boards to PNG.
//
//   node automation/social/render.mjs [--week 2026-W38]
//
// Reads out/week.json (written by pick.mjs), writes out/png/<week>/*.png.
// File names sort in posting order: 01-verified-post.png, 01-verified-story.png, …
//
// Chromium is used at deviceScaleFactor 1 because the boards are already
// authored at final pixel size (1080 wide), so no downscale is involved and
// type stays crisp. Fonts come from Google Fonts; the run fails loudly if Geist
// did not load, because a fallback font silently reflows every board.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { board, variantFor } from './templates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');

const args = process.argv.slice(2);
const flagWeek = args[args.indexOf('--week') + 1];

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'week.json'), 'utf8'));
const week = flagWeek && args.includes('--week') ? flagWeek : manifest.week;
const dir = path.join(OUT, 'png', week);
fs.mkdirSync(dir, { recursive: true });

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);

const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const written = [];

for (const unit of manifest.units) {
  const variant = variantFor(unit);
  for (const fmt of ['post', 'story']) {
    const { w, h } = fmt === 'post' ? { w: 1080, h: 1350 } : { w: 1080, h: 1920 };
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(board(unit, fmt), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const fontOk = await page.evaluate(() => document.fonts.check('600 78px Geist'));
    if (!fontOk) {
      await browser.close();
      throw new Error('Geist did not load — boards would render in a fallback font. Check network access to fonts.googleapis.com.');
    }

    // A board that overflows its frame is a broken board, not a tall one.
    const overflow = await page.evaluate(() => {
      const el = document.getElementById('board');
      return { over: el.scrollHeight - el.clientHeight, h: el.clientHeight };
    });
    if (overflow.over > 2) {
      console.error(`  ! ${unit.code} ${fmt}: content overflows by ${overflow.over}px — tighten the copy or the size steps`);
    }

    const name = `${String(unit.slot).padStart(2, '0')}-${slug(unit.stream)}-${slug(unit.title)}-${fmt}.png`;
    const file = path.join(dir, name);
    await page.locator('#board').screenshot({ path: file });
    await page.close();
    written.push({ unit: unit.code, variant, fmt, file, name });
    console.error(`  ${unit.code} ${variant.padEnd(8)} ${fmt.padEnd(5)} → ${name}`);
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'render.json'), JSON.stringify({ week, dir, written }, null, 2));
console.log(`${week}: rendered ${written.length} PNGs into ${dir}`);
