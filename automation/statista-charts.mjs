#!/usr/bin/env node
/**
 * Sqwod Intelligence — CHART BANK extractor (reliable numbers from Statista PPTX).
 *
 * Reads every Statista .pptx under research/statista/ (private, gitignored) and pulls
 * the REAL chart data straight out of each slide's embedded chart XML — categories,
 * series names and values exactly as Statista plotted them. No OCR, no text parsing,
 * no axis-tick confusion (the failure mode of the old PDF text extraction).
 *
 * Output (committed): automation/intelligence-charts/<studyId>.json — figures + provenance
 * only. The PPTX files themselves never leave the Mac.
 *
 *   node automation/statista-charts.mjs            # rebuild the whole chart bank
 *   node automation/statista-charts.mjs --stats     # just print what it would find
 *
 * Needs `unzip` on PATH (macOS and GitHub runners both have it).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'research', 'statista');
const OUT = join(__dirname, 'intelligence-charts');
const args = new Set(process.argv.slice(2));

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const unz = (file, entry) => { try { return execFileSync('unzip', ['-p', file, entry], { maxBuffer: 64 << 20 }).toString('utf8'); } catch { return ''; } };
const list = (file) => { try { return execFileSync('unzip', ['-Z1', file], { maxBuffer: 64 << 20 }).toString('utf8').split('\n'); } catch { return []; } };
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const texts = (xml) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => dec(m[1]).trim()).filter(Boolean);
const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const isYear = (s) => /^(19|20)\d{2}\*?$/.test(String(s).trim()) || /^(Q[1-4]\s*)?(19|20)\d{2}$/.test(String(s).trim()) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(19|20)\d{2}$/i.test(String(s).trim());

// Statista slide text comes as: "Description: … | Read more | Note(s): … | Source(s): … | <page> | <Title> | <Short title>"
function meta(slideTexts) {
  const t = slideTexts.join(' | ');
  const grab = (a, b) => { const m = t.match(new RegExp(`${a}\\s*\\|?\\s*([\\s\\S]*?)\\s*\\|\\s*${b}`)); return m ? m[1].replace(/\s*\|\s*/g, ' ').trim() : ''; };
  const description = grab('Description:', 'Read more');
  const note = grab('Note\\(s\\):', 'Source\\(s\\):');
  let source = '', title = '', short = '';
  const i = slideTexts.findIndex((s) => /^Source\(s\):$/.test(s));
  if (i >= 0) {
    const rest = slideTexts.slice(i + 1);
    const pg = rest.findIndex((s) => /^\d{1,3}$/.test(s));
    source = (pg > 0 ? rest.slice(0, pg) : rest.slice(0, 1)).join(' ').trim();
    title = (rest[pg + 1] || '').trim();
    short = (rest[pg + 2] || '').trim();
  }
  return { description, note, source, title, short };
}

function parseChart(xml) {
  const out = [];
  for (const ser of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
    const b = ser[1];
    const name = (b.match(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/) || [])[1] || '';
    const cat = (b.match(/<c:cat>([\s\S]*?)<\/c:cat>/) || [])[1] || '';
    const val = (b.match(/<c:val>([\s\S]*?)<\/c:val>/) || [])[1] || '';
    const cats = [...cat.matchAll(/<c:pt idx="(\d+)">\s*<c:v>([^<]*)<\/c:v>/g)].map((m) => dec(m[2]).trim());
    const vals = [...val.matchAll(/<c:pt idx="(\d+)">\s*<c:v>([^<]*)<\/c:v>/g)].map((m) => num(m[2]));
    if (!vals.length || vals.every((v) => v === null)) continue;
    out.push({ name: dec(name).trim(), cats, values: vals });
  }
  return out;
}

function extract(file) {
  const entries = list(file);
  const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const charts = [];
  for (const s of slides) {
    const n = s.match(/slide(\d+)\.xml/)[1];
    const rels = unz(file, `ppt/slides/_rels/slide${n}.xml.rels`);
    const chartRefs = [...rels.matchAll(/Target="\.\.\/charts\/(chart\d+\.xml)"/g)].map((m) => m[1]);
    if (!chartRefs.length) continue;
    const m = meta(texts(unz(file, s)));
    for (const c of chartRefs) {
      const series = parseChart(unz(file, `ppt/charts/${c}`));
      if (!series.length) continue;
      const cats = series[0].cats;
      const timeseries = cats.length >= 3 && cats.filter(isYear).length >= Math.ceil(cats.length * 0.8);
      const unit = ((m.title.match(/\(([^()]*)\)\s*$/) || [])[1] || '').replace(/^in\s+/i, '');
      const clean = (n) => (/^(column|series|data|row)\s*\d*$/i.test(n) ? '' : n);
      charts.push({ slide: +n, title: m.title, short: m.short, unit, description: m.description, note: m.note, source: m.source,
        kind: timeseries ? 'timeseries' : 'categorical', categories: cats, series: series.map((x, k) => ({ name: clean(x.name) || (series.length === 1 ? '' : `#${k + 1}`), values: x.values })) });
    }
  }
  return charts;
}

// one JSON per study id. Duplicate downloads ("(1)", " DE") can be NEWER than the
// original, so pick the copy whose charts reach the latest year (tie: most charts).
const files = walk(SRC).filter((f) => /\.pptx$/i.test(f) && !/~\$/.test(basename(f)));
// recency score = sum of each chart's latest year, so a re-download with one more year of data wins
const maxYear = (charts) => charts.reduce((a, c) => a + Math.max(0, ...c.categories.map((y) => parseInt(String(y).match(/(19|20)\d{2}/)?.[0] || 0, 10))), 0);
const byId = new Map();
for (const f of files) {
  const id = (basename(f).match(/study_id(\d+)/) || [])[1]; if (!id) continue;
  const charts = extract(f);
  const cand = { f, charts, y: maxYear(charts), n: charts.length, de: / DE\.pptx$/i.test(f) ? 1 : 0 };
  const cur = byId.get(id);
  if (!cur || cand.y > cur.y || (cand.y === cur.y && cand.n > cur.n) || (cand.y === cur.y && cand.n === cur.n && cand.de < cur.de)) byId.set(id, cand);
}
mkdirSync(OUT, { recursive: true });
let totalCharts = 0, totalTs = 0;
for (const [id, { f, charts }] of [...byId].sort((a, b) => +a[0] - +b[0])) {
  const ts = charts.filter((c) => c.kind === 'timeseries').length;
  totalCharts += charts.length; totalTs += ts;
  const study = basename(f).replace(/\.pptx$/i, '').replace(/^study_id\d+[_-]?/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[-_]+/g, ' ').trim();
  console.log(`${id.padStart(6)}  ${String(charts.length).padStart(3)} charts (${String(ts).padStart(2)} time-series)  ${study}`);
  if (args.has('--stats')) continue;
  writeFileSync(join(OUT, `study_id${id}.json`), JSON.stringify({ studyId: id, study, file: relative(ROOT, f), extractedAt: new Date().toISOString().slice(0, 10), charts }, null, 1));
}
console.log(`\n${byId.size} studies · ${totalCharts} charts · ${totalTs} time-series${args.has('--stats') ? ' (stats only, nothing written)' : ` → automation/intelligence-charts/`}`);
