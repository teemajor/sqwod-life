/**
 * CoachThinking — Sqwod Coach "thinking" indicator.
 * Diamond-seeded abstract morph whose motion + pace matches the query intent.
 *
 * • Zero dependencies (React only). No animation libraries.
 * • One <svg>/<path>; morph is plain math in a requestAnimationFrame loop.
 * • Monochrome: inherits `currentColor` → chalk on dark, ink on light, automatically.
 *
 *   <CoachThinking intent="lift" size={24} />
 *
 * intent: 'recover' | 'lift' | 'burn' | 'nourish' | 'plan' | 'idle'  (default 'idle')
 * size:   px (default 24)
 */
import { useEffect, useRef } from 'react';

/* ---------------- shape vocabulary ---------------- */
const NP = 48, TAU = Math.PI * 2;
const lerp = (a, b, f) => a + (b - a) * f;
const smoother = x => x * x * x * (x * (x * 6 - 15) + 10);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const rot2 = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };

const GEN = {
  circle: u => { const a = u * TAU; return [Math.cos(a), Math.sin(a)]; },
  seed:   u => { const a = -Math.PI / 2 + u * TAU; const r = 1 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))); return [r * Math.cos(a), r * Math.sin(a)]; },
  square: u => { const a = -Math.PI / 2 + u * TAU; const r = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); return [r * Math.cos(a), r * Math.sin(a)]; },
  heart:  u => { const t = u * TAU; const x = 16 * Math.pow(Math.sin(t), 3);
                 const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); return [x, -y]; },
  leaf:   u => { const t = u * TAU; const x = 0.62 * Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 1.7); return rot2([x, -Math.cos(t)], 0.34); },
};
function makeDrop() {
  const A = [0, -1], C = [0, 0.28], R = 0.7, Tr = [0.585, -0.103], Tl = [-0.585, -0.103];
  const aR = -33.2 * Math.PI / 180, aL = 213.2 * Math.PI / 180, out = [];
  for (let i = 0; i < 24; i++) { const u = i / 24; out.push([A[0] + (Tr[0] - A[0]) * u, A[1] + (Tr[1] - A[1]) * u]); }
  for (let i = 0; i <= 200; i++) { const a = aR + (aL - aR) * (i / 200); out.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); }
  for (let i = 0; i < 24; i++) { const u = i / 24; out.push([Tl[0] + (A[0] - Tl[0]) * u, Tl[1] + (A[1] - Tl[1]) * u]); }
  return out;
}
function makeTri() {
  const C = [[0, -1], [0.9, 0.62], [-0.9, 0.62]], out = [], per = 140;
  for (let e = 0; e < 3; e++) { const a = C[e], b = C[(e + 1) % 3]; for (let i = 0; i < per; i++) { const u = i / per; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); } }
  return out;
}
const DENSE = { drop: makeDrop(), triangle: makeTri() };

function buildShape(name) {
  const dense = DENSE[name] || Array.from({ length: 360 }, (_, i) => GEN[name](i / 360));
  let cx = 0, cy = 0; dense.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= dense.length; cy /= dense.length;
  const pts = [];
  for (let i = 0; i < NP; i++) {
    const ang = -Math.PI / 2 + (i / NP) * TAU, dx = Math.cos(ang), dy = Math.sin(ang); let bt = null;
    for (let j = 0; j < dense.length; j++) {
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], det = ex * dy - dx * ey;
      if (Math.abs(det) < 1e-9) continue;
      const t = (-(a[0] - cx) * ey + ex * (a[1] - cy)) / det;
      const s = (dx * (a[1] - cy) - dy * (a[0] - cx)) / det;
      if (s >= -1e-3 && s <= 1 + 1e-3 && t > 1e-4 && (bt === null || t < bt)) bt = t;
    }
    pts.push([cx + dx * (bt ?? 1), cy + dy * (bt ?? 1)]);
  }
  let ax = 0, ay = 0; pts.forEach(p => { ax += p[0]; ay += p[1]; }); ax /= NP; ay /= NP;
  const cen = pts.map(p => [p[0] - ax, p[1] - ay]);
  let mx = 0; cen.forEach(p => { const d = Math.hypot(p[0], p[1]); if (d > mx) mx = d; });
  return cen.map(p => [p[0] / mx, p[1] / mx]);
}
const SHAPES = {};
['circle', 'seed', 'square', 'heart', 'drop', 'leaf', 'triangle'].forEach(n => (SHAPES[n] = buildShape(n)));
const K = { circle: 1.0, seed: 0.6, square: 0.72, heart: 0.95, drop: 0.95, leaf: 0.9, triangle: 0.58 };

/* ---------------- motion engine ---------------- */
function catmullClosed(pts, k) {
  const n = pts.length; let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6 * k, c1y = p1.y + (p2.y - p0.y) / 6 * k;
    const c2x = p2.x - (p3.x - p1.x) / 6 * k, c2y = p2.y - (p3.y - p1.y) / 6 * k;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return d + 'Z';
}
function shapeAt(family, loop, t) {
  const fam = family.map(n => SHAPES[n]), kf = family.map(n => K[n]), n = fam.length;
  if (n === 1) return { pts: fam[0].map(p => ({ x: p[0], y: p[1] })), k: kf[0] };
  const seg = loop / n, tt = ((t % loop) + loop) % loop, i = Math.floor(tt / seg), f = smoother(clamp01((tt - i * seg) / seg));
  const a = fam[i], b = fam[(i + 1) % n];
  return { pts: a.map((p, idx) => ({ x: lerp(p[0], b[idx][0], f), y: lerp(p[1], b[idx][1], f) })), k: lerp(kf[i], kf[(i + 1) % n], f) };
}
function transform(pts, rotDeg, sx, sy, R) {
  const r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(p => { const x = p.x * R * sx, y = p.y * R * sy; return { x: x * c - y * s + 50, y: x * s + y * c + 50 }; });
}
function repCurve(tn) { // strength: slow eccentric load → brief hold → fast drive → settle
  let sy;
  if (tn < 0.42) sy = lerp(1, 0.7, smoother(tn / 0.42));
  else if (tn < 0.56) sy = 0.7;
  else if (tn < 0.74) sy = lerp(0.7, 1.24, 1 - Math.pow(1 - (tn - 0.56) / 0.18, 2));
  else sy = lerp(1.24, 1, smoother((tn - 0.74) / 0.26));
  return { sx: 1 / Math.sqrt(sy), sy, rot: 0 };
}
function heartBeat(tn) { // cardio: lub-dub double thump
  const g = (c, w) => Math.exp(-Math.pow((tn - c) / w, 2));
  const s = 1 + 0.1 * (g(0.1, 0.045) * 1.0 + g(0.26, 0.055) * 0.62);
  return { sx: s, sy: s, rot: 0 };
}
const breathe = (amp, sp = 1) => tn => { const s = 1 + amp * Math.sin(TAU * sp * tn); return { sx: s, sy: s, rot: 0 }; };

/* ---------------- intents: query type → motion ---------------- */
export const INTENTS = {
  recover: { family: ['circle', 'seed'],            loop: 3400, drive: breathe(0.045, 1) },
  lift:    { family: ['seed'],                       loop: 2300, drive: repCurve },
  burn:    { family: ['circle', 'heart'],            loop: 1300, drive: heartBeat },
  nourish: { family: ['leaf', 'drop', 'circle'],     loop: 2600, drive: tn => { const s = 1 + 0.03 * Math.sin(TAU * tn); return { sx: s, sy: s, rot: Math.sin(TAU * tn) * 4 }; } },
  plan:    { family: ['seed', 'triangle', 'square'], loop: 1800, drive: tn => { const s = 1 + 0.02 * Math.sin(TAU * 2 * tn); return { sx: s, sy: s, rot: Math.sin(TAU * tn) * 3 }; } },
  idle:    { family: ['seed'],                       loop: 4200, drive: breathe(0.03, 1) },
};

/* ---------------- component ---------------- */
export default function CoachThinking({ intent = 'idle', size = 24, className, style }) {
  const pathRef = useRef(null);
  const intentRef = useRef(intent);
  intentRef.current = intent;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const R = 30;
    let raf, t = 0, last = performance.now();

    const draw = () => {
      const m = INTENTS[intentRef.current] || INTENTS.idle;
      const { pts, k } = shapeAt(m.family, m.loop, t);
      const tn = (((t % m.loop) + m.loop) % m.loop) / m.loop;
      const d = reduced ? { sx: 1, sy: 1, rot: 0 } : m.drive(tn);
      if (pathRef.current) pathRef.current.setAttribute('d', catmullClosed(transform(pts, d.rot || 0, d.sx, d.sy, R), k));
    };
    const frame = now => { t += now - last; last = now; draw(); raf = requestAnimationFrame(frame); };
    draw();
    if (!reduced) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={className} style={{ display: 'block', ...style }}
      role="img" aria-label="Coach is thinking"
    >
      <path ref={pathRef} fill="currentColor" />
    </svg>
  );
}
