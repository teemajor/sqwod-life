// Per-page social preview cards (27 Oct 2026). Before this every page shared the podcast
// cover, so every LinkedIn post looked the same. Each article, report, Daily issue and the
// Deal Tracker now gets a 1200x630 PNG built from its own data at build time.
// Rendering: SVG -> PNG with sharp (librsvg). Fonts come from site/og/fonts via a private
// fontconfig file, so the cards look the same on a laptop and on the GitHub runner.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SITE = process.cwd();
const FONT_DIR = join(SITE, 'og', 'fonts');
let sharpMod: any = null;
async function sharp() {
  if (sharpMod) return sharpMod;
  const dir = join(tmpdir(), 'sqwod-og-fc');
  mkdirSync(join(dir, 'cache'), { recursive: true });
  const conf = join(dir, 'fonts.conf');
  writeFileSync(conf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${FONT_DIR}</dir><cachedir>${join(dir, 'cache')}</cachedir></fontconfig>`);
  process.env.FONTCONFIG_FILE = conf;
  sharpMod = (await import('sharp')).default;
  return sharpMod;
}

const b64 = (p: string) => (existsSync(p) ? readFileSync(p).toString('base64') : '');
const LOGO = `data:image/png;base64,${b64(join(SITE, 'public', 'sqwod-white.png'))}`;
let AVATAR = '';
async function avatar() {
  if (AVATAR) return AVATAR;
  const p = join(SITE, 'public', 'team', 'tee-major.jpg');
  if (!existsSync(p)) return '';
  const s = await sharp();
  const buf = await s(p).resize(112, 112, { fit: 'cover', position: 'attention' }).grayscale().jpeg({ quality: 82 }).toBuffer();
  AVATAR = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return AVATAR;
}

const C = { bg: '#0E0E0F', panel: '#19191B', line: '#2E2E31', chalk: '#F4F0EA', g2: '#A3A3A0', g3: '#8E8E8A', accent: '#7FB58C' };
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// Rough width of a line in Geist SemiBold, in em: narrow letters count less, capitals more.
const emWidth = (s: string) => [...s].reduce((w, ch) => w + (/[iljtf.,:;'!|\s]/.test(ch) ? 0.3 : /[mwMW@]/.test(ch) ? 0.86 : /[A-Z0-9$€£%]/.test(ch) ? 0.66 : 0.55), 0);
export function wrap(text: string, px: number, maxW: number, maxLines: number) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (emWidth(next) * px <= maxW || !cur) cur = next; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = keep[maxLines - 1].replace(/[\s,.;:]*\S*$/, '') + '…'; return keep; }
  return lines;
}
/** Pick the largest title size that fits in the given number of lines. */
function fitTitle(text: string, maxW: number, sizes: number[], maxLines: number) {
  for (const px of sizes) { const l = wrap(text, px, maxW, 99); if (l.length <= maxLines) return { px, lines: l }; }
  const px = sizes[sizes.length - 1]; return { px, lines: wrap(text, px, maxW, maxLines) };
}

export interface OgCard {
  kicker: string;          // "SQWOD INTELLIGENCE · REPORT"
  title: string;
  stat?: string;           // "+179%"
  statLabel?: string;      // "US free-weight sales · 2019 to 2023"
  bullets?: string[];      // Daily headlines
  byline?: boolean;        // show Tee Major
  footer?: string;         // "sqwod.life/en/intelligence"
}

export async function renderCard(card: OgCard): Promise<Buffer> {
  const W = 1200, H = 630, M = 72;
  const av = card.byline ? await avatar() : '';
  const hasStat = !!card.stat && card.stat.length <= 12;
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="6" fill="${C.accent}"/>`);
  parts.push(`<image href="${LOGO}" x="${M}" y="52" height="34" width="170" preserveAspectRatio="xMinYMid meet"/>`);
  parts.push(`<text x="${W - M}" y="76" text-anchor="end" font-family="Geist" font-weight="600" font-size="20" letter-spacing="3" fill="${C.g2}">${esc(card.kicker.toUpperCase())}</text>`);

  let y = 150;
  if (hasStat) {
    parts.push(`<text x="${M}" y="${y + 120}" font-family="Anton" font-size="150" fill="${C.accent}">${esc(card.stat!)}</text>`);
    if (card.statLabel) parts.push(`<text x="${M}" y="${y + 162}" font-family="Geist" font-weight="500" font-size="24" fill="${C.g2}">${esc(wrap(card.statLabel, 24, W - 2 * M, 1)[0])}</text>`);
    y += 205;
    const t = fitTitle(card.title, W - 2 * M, [44, 40, 36], 2);
    t.lines.forEach((l, i) => parts.push(`<text x="${M}" y="${y + 40 + i * t.px * 1.18}" font-family="Geist" font-weight="700" font-size="${t.px}" fill="${C.chalk}">${esc(l)}</text>`));
  } else if (card.bullets?.length) {
    const t = fitTitle(card.title, W - 2 * M, [52, 46, 40], 2);
    t.lines.forEach((l, i) => parts.push(`<text x="${M}" y="${y + 40 + i * t.px * 1.16}" font-family="Geist" font-weight="700" font-size="${t.px}" fill="${C.chalk}">${esc(l)}</text>`));
    y += 40 + t.lines.length * t.px * 1.16 + 24;
    card.bullets.slice(0, 3).forEach((b, i) => {
      const line = wrap(b, 27, W - 2 * M - 34, 1)[0];
      parts.push(`<rect x="${M}" y="${y + i * 46 - 16}" width="14" height="14" fill="${C.accent}"/>`);
      parts.push(`<text x="${M + 30}" y="${y + i * 46}" font-family="Geist" font-weight="500" font-size="27" fill="${C.g2}">${esc(line)}</text>`);
    });
  } else {
    const t = fitTitle(card.title, W - 2 * M, [72, 64, 56, 50], 4);
    t.lines.forEach((l, i) => parts.push(`<text x="${M}" y="${y + 70 + i * t.px * 1.12}" font-family="Geist" font-weight="700" font-size="${t.px}" fill="${C.chalk}">${esc(l)}</text>`));
  }

  // footer
  parts.push(`<line x1="${M}" y1="${H - 92}" x2="${W - M}" y2="${H - 92}" stroke="${C.line}" stroke-width="2"/>`);
  if (av) {
    parts.push(`<clipPath id="av"><circle cx="${M + 22}" cy="${H - 48}" r="22"/></clipPath>`);
    parts.push(`<image href="${av}" x="${M}" y="${H - 70}" width="44" height="44" clip-path="url(#av)"/>`);
    parts.push(`<text x="${M + 60}" y="${H - 41}" font-family="Geist" font-weight="600" font-size="23" fill="${C.chalk}">Tee Major</text>`);
  }
  parts.push(`<text x="${W - M}" y="${H - 41}" text-anchor="end" font-family="Geist" font-weight="500" font-size="22" fill="${C.g3}">${esc(card.footer || 'sqwod.life')}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  const s = await sharp();
  return s(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

/** Where a page's card lives; pages pass this to <Base image=…>. */
export const ogPath = (kind: 'analysis' | 'intelligence' | 'daily' | 'deals', lang: string, slug = 'index') => `/og/${lang}/${kind}/${slug}.png`;
