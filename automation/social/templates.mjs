// Board templates for the weekly social run.
//
// Layout comes from the Claude Design canvas "Sqwod Life Social - EN".
// COLOUR comes from Sqwod V1 Visual Direction, which overrides the canvas:
// six semantic tokens, monochrome, light canonical. The acid green the canvas
// used is gone. `signal` (the one living colour) is reserved for live
// physiology and is deliberately NOT available here — a social board is never
// live physiology, so these boards are pure greyscale.
//
// The inversion device replaces the accent: half the week runs on warm
// off-white, half on near-black, and the CTA always fills with the opposite
// end of the scale. Contrast does the work colour used to do.
//
// Six variants, one per content stream:
//   score    light — a single Sqwod Verified review (giant score)
//   guide    light — a report or buyer's guide
//   analysis light — Move/Build/Gear analysis
//   signal   dark  — Signal-lane analysis, the sharpest headline of the week
//   journal  dark  — a Sqwod Pod Journal post
//   daily    dark  — the weekday brief, three lines swapped each run

// --- V1 tokens ---------------------------------------------------------------

const LIGHT = {
  bg: '#FAFAF9', // surface — warm off-white ground
  raised: '#FFFFFF', // surface-raised
  fg: '#0B0B0C', // ink — primary text / CTA fill
  muted: '#52525B', // ink-muted — secondary, reasoning
  faint: '#A1A1AA', // ink-faint — faint, inactive
  rule: 'rgba(11,11,12,0.14)',
  barOff: 'rgba(11,11,12,0.18)',
  cta: { bg: '#0B0B0C', fg: '#FAFAF9' },
};

// Dark is the shipping app's tokens, mapped 1:1 — roles hold, luminance flips.
// Warm chalk is the dark-mode CTA fill.
const DARK = {
  bg: '#0B0B0C',
  raised: '#141416',
  fg: '#F4EFE6',
  muted: '#A1A1AA',
  faint: '#52525B',
  rule: '#26262A',
  barOff: '#2A2A2E',
  cta: { bg: '#F4EFE6', fg: '#0B0B0C' },
};

const SANS = "Geist,system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = "'Geist Mono',ui-monospace,'SF Mono',monospace";

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Cut on a word boundary, and prefer a sentence end if one sits close to the
// limit — "a compact 40cm foot…" reads like a bug; a clean sentence does not.
const clamp = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const sentence = head.lastIndexOf('. ');
  if (sentence > n * 0.55) return head.slice(0, sentence + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).replace(/[,;:–—-]$/, '') + '…';
};

// Display type is Geist 600 at tight tracking. Length picks the size so a short
// verdict still fills the board and a long one never overflows it.
const fit = (text, steps) => {
  const n = String(text || '').length;
  for (const [max, size] of steps) if (n <= max) return size;
  return steps[steps.length - 1][1];
};

const POST_HEAD = [[46, 92], [70, 82], [96, 76], [128, 68], [170, 60], [999, 52]];
const STORY_HEAD = [[30, 104], [52, 92], [76, 82], [104, 72], [999, 62]];

const dateLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, '0')} ${mon} ${d.getUTCFullYear()}`;
};

// The story caption is a signpost, not a clickable link — the real URL rides on
// the sticker. A full article slug wraps to three lines and looks like a bug, so
// long paths are cut back to the section.
const urlLabel = (url) => {
  const bare = String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (bare.length <= 44) return bare.toUpperCase();
  const [host, ...parts] = bare.split('/');
  let out = host;
  for (const p of parts) {
    if ((out + '/' + p).length > 44) break;
    out += '/' + p;
  }
  return out.toUpperCase();
};

// --- shared pieces -----------------------------------------------------------

// The official chamfered SQWOD wordmark, as data URIs, injected by render.mjs
// from site/public/sqwod-black.png and sqwod-white.png — the same two files the
// site header serves. Set before any board is built.
let LOGO = { black: '', white: '' };
export function setLogos(logos) {
  LOGO = { ...LOGO, ...logos };
}

// The lockup is the wordmark image plus ".life" set in Geist, exactly as the
// site header pairs them. `onDark` picks the file by the colour BEHIND the mark,
// not by the board's theme — the Daily masthead is a filled bar, so it flips.
const lockup = (t, height, { onDark = true, suffix = t.faint } = {}) => {
  const src = onDark ? LOGO.white : LOGO.black;
  const w = Math.round(height * (423 / 111));
  return `<span style="display:inline-flex;align-items:baseline;gap:3px">
    <img src="${src}" alt="Sqwod" width="${w}" height="${height}" style="display:block;width:${w}px;height:${height}px;transform:translateY(${Math.round(height * 0.06)}px)" />
    <span style="font-size:${Math.round(height * 1.12)}px;font-weight:600;letter-spacing:-0.03em;color:${suffix}">.life</span>
  </span>`;
};

const wordmark = (t, size) => lockup(t, Math.round(size * 0.74), { onDark: t.bg === '#0B0B0C' });

// The Daily masthead sits on a bar filled with t.fg, so the mark flips against
// the board: a dark board gets a chalk bar and therefore the black wordmark.
const mastheadMark = (t, height, label) =>
  `<span style="display:inline-flex;align-items:baseline;gap:14px">
    <img src="${t.bg === '#0B0B0C' ? LOGO.black : LOGO.white}" alt="Sqwod" style="display:block;width:${Math.round(
      height * (423 / 111)
    )}px;height:${height}px;transform:translateY(${Math.round(height * 0.08)}px)" />
    <span style="font-family:${MONO};font-size:${Math.round(height * 1.05)}px;font-weight:500;letter-spacing:0.14em">${esc(label)}</span>
  </span>`;

const kicker = (text, color, size = 24) =>
  `<span style="font-family:${MONO};font-size:${size}px;letter-spacing:0.16em;color:${color}">${esc(text)}</span>`;

const header = (t, label, size = 32) =>
  `<div style="display:flex;align-items:baseline;justify-content:space-between">${wordmark(t, size)}${kicker(label, t.muted, size === 32 ? 24 : 22)}</div>`;

// Mono key/value rows on hairline rules — the system's workhorse block.
const rows = (t, items, { size = 25, pad = 20 } = {}) =>
  `<div style="display:flex;flex-direction:column;font-family:${MONO};font-size:${size}px">` +
  items
    .map(
      (r, i) =>
        `<div style="display:flex;justify-content:space-between;gap:30px;padding:${pad}px 0;border-top:1.5px solid ${t.rule}${
          i === items.length - 1 ? `;border-bottom:1.5px solid ${t.rule}` : ''
        }"><span style="color:${t.muted}">${esc(r[0])}</span><span style="color:${t.fg}">${esc(r[1])}</span></div>`
    )
    .join('') +
  `</div>`;

const pillPost = (t, label) =>
  `<span style="background:${t.cta.bg};color:${t.cta.fg};border-radius:14px;padding:22px 38px;font-size:29px;font-weight:600;letter-spacing:-0.01em">${esc(label)}</span>`;

const pillStory = (t, label) =>
  `<span style="background:${t.cta.bg};color:${t.cta.fg};border-radius:999px;padding:30px;font-size:34px;font-weight:600;letter-spacing:-0.01em;text-align:center">${esc(label)}</span>`;

const footNote = (t, html) =>
  `<span style="font-family:${MONO};font-size:22px;color:${t.faint};text-align:right;line-height:1.4;max-width:460px">${html}</span>`;

const progress = (t, active, total) =>
  `<div style="flex:none;display:flex;gap:12px">` +
  Array.from(
    { length: total },
    (_, i) => `<span style="flex:1;height:6px;border-radius:3px;background:${i === active ? t.fg : t.barOff}"></span>`
  ).join('') +
  `</div>`;

const storyUrl = (t, url) =>
  `<span style="display:block;font-family:${MONO};font-size:22px;color:${t.faint};text-align:center;letter-spacing:0.04em">${esc(urlLabel(url))}</span>`;

const quote = (t, text, size) =>
  `<div style="border-left:4px solid ${t.fg};padding-left:36px;font-size:${size}px;line-height:1.36;color:${t.muted};text-wrap:pretty">${esc(text)}</div>`;

// Story frame. The canvas pinned the CTA to the bottom and centred the content,
// which left a dead band between them whenever the copy was short. Here the
// content block bottoms out directly above the CTA and all the air collects at
// the top, so a big headline sits low on the frame with the button under it.
const storyFrame = (t, { active, total, head, content, cta, url }) => `
${progress(t, active, total)}
<div style="flex:none;padding-top:40px">${head}</div>
<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:40px;padding-bottom:64px">${content}</div>
<div style="flex:none;display:flex;flex-direction:column;gap:18px">${pillStory(t, cta)}${storyUrl(t, url)}</div>`;

// --- board bodies ------------------------------------------------------------

function scorePost(u, t) {
  const crit = (u.criteria || []).slice(0, 3);
  const list = [...crit.map((c) => [c.name.toUpperCase(), `${c.score}/10`]), ['CONFIDENCE', u.score.confidence]].slice(0, 4);
  return `
${header(t, u.kicker || 'SQWOD VERIFIED')}
<div style="display:flex;flex-direction:column;gap:32px">
  <div style="font-size:${fit(u.title, [[24, 84], [40, 74], [999, 64]])}px;font-weight:600;letter-spacing:-0.038em;line-height:1.02;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
  <div style="display:flex;gap:70px;align-items:baseline">
    <div style="display:flex;flex-direction:column;gap:10px"><span style="font-family:${MONO};font-variant-numeric:tabular-nums;font-size:150px;line-height:0.8;letter-spacing:-0.055em;color:${t.fg}">${u.score.value}</span><span style="font-family:${MONO};font-size:24px;letter-spacing:0.14em;color:${t.muted}">SQWOD SCORE</span></div>
    ${u.price ? `<div style="display:flex;flex-direction:column;gap:10px"><span style="font-family:${MONO};font-variant-numeric:tabular-nums;font-size:72px;line-height:1;letter-spacing:-0.04em;color:${t.muted}">${esc(u.price)}</span><span style="font-family:${MONO};font-size:24px;letter-spacing:0.14em;color:${t.faint}">BEST PRICE</span></div>` : ''}
  </div>
  <div style="font-size:31px;line-height:1.42;color:${t.muted};text-wrap:pretty">${esc(clamp(u.headline, 175))}</div>
</div>
${rows(t, list)}
<div style="display:flex;align-items:center;justify-content:space-between;gap:30px">
  ${pillPost(t, 'Read the review')}
  ${footNote(t, 'AFFILIATE LINKS ARE LABELLED.<br />SCORES ARE SET BY THE METHODOLOGY.')}
</div>`;
}

function scoreStory(u, t) {
  return storyFrame(t, {
    active: 0,
    total: 3,
    head: header(t, 'VERIFIED', 30),
    url: u.url,
    cta: 'Read the review',
    content: `
  <div style="font-family:${MONO};font-variant-numeric:tabular-nums;font-size:300px;line-height:0.8;letter-spacing:-0.06em;color:${t.fg}">${u.score.value}</div>
  <div style="font-size:${fit(u.title, [[22, 76], [40, 64], [999, 54]])}px;font-weight:600;letter-spacing:-0.032em;line-height:1.06;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
  <div style="font-size:32px;line-height:1.4;color:${t.muted};text-wrap:pretty">${esc(clamp(u.headline, 185))}</div>`,
  });
}

function guidePost(u, t) {
  const list = (u.figures || []).slice(0, 3).map((f) => [String(f.label || '').toUpperCase(), String(f.value)]);
  const fallback = [['LANE', u.kicker || 'SIGNAL'], ['FOR', 'Coaches · founders · operators']];
  return `
${header(t, u.subtitle || 'SQWOD REPORT')}
<div style="display:flex;flex-direction:column;gap:26px">
  ${kicker(u.kicker || 'REPORT', t.muted)}
  <div style="font-size:${fit(u.title, POST_HEAD)}px;font-weight:600;letter-spacing:-0.038em;line-height:1.02;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
</div>
${rows(t, list.length ? list : fallback, { size: 27, pad: 22 })}
<div style="display:flex;align-items:center;justify-content:space-between;gap:30px">
  ${pillPost(t, 'Read the report')}
  ${footNote(t, 'SOURCED FIGURES<br />METHODOLOGY PUBLISHED')}
</div>`;
}

function guideStory(u, t) {
  const figs = (u.figures || []).slice(0, 4);
  return storyFrame(t, {
    active: 1,
    total: 3,
    head: header(t, u.subtitle || 'REPORT', 30),
    url: u.url,
    cta: 'Read the report',
    content: `
  ${kicker(u.kicker || 'REPORT', t.muted)}
  <div style="font-size:${fit(u.title, STORY_HEAD)}px;font-weight:600;letter-spacing:-0.04em;line-height:1.0;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
  ${
    figs.length
      ? `<div style="display:flex;flex-direction:column;font-family:${MONO};font-size:30px">${figs
          .map(
            (f, i) =>
              `<div style="display:flex;justify-content:space-between;gap:24px;padding:24px 0;border-top:1.5px solid ${t.rule}${
                i === figs.length - 1 ? `;border-bottom:1.5px solid ${t.rule}` : ''
              }"><span style="color:${t.muted}">${esc(clamp(String(f.label).toUpperCase(), 30))}</span><span style="color:${t.fg}">${esc(f.value)}</span></div>`
          )
          .join('')}</div>`
      : `<div style="font-size:32px;line-height:1.4;color:${t.muted};text-wrap:pretty">${esc(clamp(u.headline, 190))}</div>`
  }`,
  });
}

function articlePost(u, t, { cta, source }) {
  const list = [
    ['LANE', u.stream === 'pod' ? 'Sqwod Pod' : (u.kicker || 'SIGNAL').replace(/^(.)(.*)$/, (_, a, b) => a + b.toLowerCase())],
    ['FOR', 'Coaches · founders · operators'],
  ];
  // Headline, standfirst and rows are one block. Left as three siblings of a
  // space-between column they drift apart and open a hole in the middle of the
  // board; grouped, the air collects at the edges where it belongs.
  return `
${header(t, u.kicker)}
<div style="display:flex;flex-direction:column;gap:36px">
  <div style="font-size:${fit(u.title, POST_HEAD)}px;font-weight:600;letter-spacing:-0.04em;line-height:1.01;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
  <div style="font-size:31px;line-height:1.42;color:${t.muted};text-wrap:pretty">${esc(clamp(u.headline, 180))}</div>
  ${rows(t, list)}
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:30px">
  ${pillPost(t, cta)}
  ${kicker(source, t.faint)}
</div>`;
}

function articleStory(u, t, { cta }) {
  return storyFrame(t, {
    active: 0,
    total: 2,
    head: header(t, u.kicker, 30),
    url: u.url,
    cta,
    content: `
  <div style="font-size:${fit(u.title, STORY_HEAD)}px;font-weight:600;letter-spacing:-0.042em;line-height:1.0;color:${t.fg};text-wrap:pretty">${esc(u.title)}</div>
  ${quote(t, clamp(u.headline, 155), 36)}`,
  });
}

// The Daily keeps the canvas's full-bleed masthead. With the accent gone the bar
// is the inverse of the board, which is what makes it readable at thumbnail size.
function dailyPost(u, t) {
  const lines = (u.lines || []).slice(0, 3);
  return `
<div style="flex:none;background:${t.fg};color:${t.bg};padding:38px 64px;display:flex;align-items:baseline;justify-content:space-between">
  ${mastheadMark(t, 26, 'DAILY')}
  <span style="font-family:${MONO};font-size:28px;letter-spacing:0.06em">${esc(dateLabel(u.date))}</span>
</div>
<div style="flex:1;padding:56px 64px 0;display:flex;flex-direction:column;justify-content:space-between;gap:40px">
<div style="display:flex;flex-direction:column;gap:18px">
  <div style="font-size:60px;font-weight:600;letter-spacing:-0.034em;line-height:1.06;color:${t.fg};text-wrap:pretty">The business of fitness, in five minutes</div>
  <div style="font-family:${MONO};font-size:25px;color:${t.muted};letter-spacing:0.08em">MONEY MOVEMENT · THE LESSON · ONE THING TO DO</div>
</div>
<div style="display:flex;flex-direction:column">
${lines
  .map(
    (l, i) =>
      `<div style="display:flex;gap:34px;padding:34px 0;border-top:1.5px solid ${t.rule}${
        i === lines.length - 1 ? `;border-bottom:1.5px solid ${t.rule}` : ''
      }"><span style="font-family:${MONO};font-size:26px;color:${t.faint};flex:none;width:52px">0${i + 1}</span><span style="font-size:${
        l.length > 42 ? 32 : 38
      }px;font-weight:500;letter-spacing:-0.02em;line-height:1.22;color:${t.fg};text-wrap:pretty">${esc(l)}</span></div>`
  )
  .join('')}
</div>
</div>
<div style="flex:none;padding:44px 64px 56px;display:flex;align-items:center;justify-content:space-between;gap:30px">
  ${pillPost(t, 'Listen · 5 min')}
  ${footNote(t, 'EVERY WEEKDAY · EN &amp; DE<br />FREE')}
</div>`;
}

function dailyStory(u, t) {
  const lines = (u.lines || []).slice(0, 3);
  return `
<div style="flex:none;padding:64px 64px 0">${progress(t, 0, 3)}</div>
<div style="flex:none;margin-top:40px;background:${t.fg};color:${t.bg};padding:34px 64px;display:flex;align-items:baseline;justify-content:space-between">
  ${mastheadMark(t, 24, 'DAILY')}
  <span style="font-family:${MONO};font-size:26px;letter-spacing:0.06em">${esc(dateLabel(u.date))}</span>
</div>
<div style="flex:1;padding:0 64px 64px;display:flex;flex-direction:column;justify-content:flex-end;gap:44px">
  <div style="font-size:72px;font-weight:600;letter-spacing:-0.038em;line-height:1.04;color:${t.fg};text-wrap:pretty">Get smarter in five minutes</div>
  <div style="display:flex;flex-direction:column">
${lines
  .map(
    (l, i) =>
      `<div style="display:flex;gap:32px;padding:32px 0;border-top:1.5px solid ${t.rule}${
        i === lines.length - 1 ? `;border-bottom:1.5px solid ${t.rule}` : ''
      }"><span style="font-family:${MONO};font-size:26px;color:${t.faint};flex:none;width:52px">0${i + 1}</span><span style="font-size:${
        l.length > 42 ? 34 : 40
      }px;font-weight:500;letter-spacing:-0.02em;line-height:1.2;color:${t.fg};text-wrap:pretty">${esc(l)}</span></div>`
  )
  .join('')}
  </div>
  <div style="font-size:30px;line-height:1.4;color:${t.muted};text-wrap:pretty">Built for the commute, the warm-up, or the dog walk.</div>
</div>
<div style="flex:none;padding:0 64px;display:flex;flex-direction:column;gap:18px">${pillStory(t, 'Listen free')}${storyUrl(t, u.url)}</div>`;
}

// --- variant routing ---------------------------------------------------------

export function variantFor(unit) {
  if (unit.stream === 'verified') return 'score';
  if (unit.stream === 'report') return 'guide';
  if (unit.stream === 'daily') return 'daily';
  if (unit.stream === 'pod') return 'journal';
  return (unit.kicker || '').toUpperCase() === 'SIGNAL' ? 'signal' : 'analysis';
}

// Light is canonical; the dark boards are there so a week of four reads as a
// set rather than a stack of the same board.
const VARIANTS = {
  score: { theme: LIGHT, bleed: false, post: scorePost, story: scoreStory },
  guide: { theme: LIGHT, bleed: false, post: guidePost, story: guideStory },
  analysis: {
    theme: LIGHT,
    bleed: false,
    post: (u, t) => articlePost(u, t, { cta: 'Read the analysis', source: 'SQWOD.LIFE' }),
    story: (u, t) => articleStory(u, t, { cta: 'Read the analysis' }),
  },
  signal: {
    theme: DARK,
    bleed: false,
    post: (u, t) => articlePost(u, t, { cta: 'Read the signal', source: 'MARKET DATA · TRENDS · POLICY' }),
    story: (u, t) => articleStory(u, t, { cta: 'Read the signal' }),
  },
  journal: {
    theme: DARK,
    bleed: false,
    post: (u, t) => articlePost(u, t, { cta: 'Read in the Journal', source: 'SQWODPOD.COM' }),
    story: (u, t) => articleStory(u, t, { cta: 'Read in the Journal' }),
  },
  daily: { theme: DARK, bleed: true, post: dailyPost, story: dailyStory },
};

export function board(unit, format) {
  const v = VARIANTS[variantFor(unit)];
  const t = v.theme;
  const isStory = format === 'story';
  const h = isStory ? 1920 : 1350;
  const padding = v.bleed ? (isStory ? '0 0 150px' : '0') : isStory ? '64px 64px 150px' : '64px';
  const justify = isStory || v.bleed ? 'flex-start' : 'space-between';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
  html,body{margin:0;padding:0;background:${t.bg}}
  *{box-sizing:border-box}
  #board{width:1080px;height:${h}px;background:${t.bg};color:${t.fg};
    font-family:${SANS};letter-spacing:-0.005em;
    padding:${padding};display:flex;flex-direction:column;justify-content:${justify};overflow:hidden}
</style></head><body><div id="board">${v[isStory ? 'story' : 'post'](unit, t)}</div></body></html>`;
}

export const themes = { LIGHT, DARK };
