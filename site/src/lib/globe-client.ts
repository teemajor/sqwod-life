// Browser side of the Investor Globe: one mount function used by the full page and the hero banner.
// Loads globe.gl (three.js) so import it dynamically where the globe is optional.
//
// Clustering: investors share a city centre, so at a wide view each multi-investor city is one marker
// with a count pill; zoomed in (camera altitude below SPREAD_ALT) the city opens into a ring of
// individual dots with name labels you can click. Ring radius scales with altitude so the dots stay
// apart on screen at any zoom.
import Globe from 'globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import type { GlobePoint, GlobeArc } from './globe-data';

export type ArcMode = 'traffic' | 'all' | 'off';
export interface GlobeOptions {
  colors: Record<string, string>;
  reduce?: boolean;                 // prefers-reduced-motion
  compact?: boolean;                // hero banner: calmer camera, no zoom
  label?: (p: GlobePoint) => string;
  arcLabel?: (a: GlobeArc) => string;
  onSelect?: (p: GlobePoint) => void;
  onUserInput?: () => void;
  onSpinStop?: () => void;          // the globe stopped spinning on its own (a cluster was opened)
  home?: { lat: number; lng: number; altitude: number };
}
export interface GlobeHandle {
  globe: any;
  setData(points: GlobePoint[], arcs: GlobeArc[]): void;
  setArcMode(m: ArcMode): void;
  select(id: string | null): void;
  spin(on: boolean): void;
  flyTo(lat: number, lng: number, altitude: number, ms?: number): void;
  resize(): void;
  destroy(): void;
}
/** A point as displayed: lat/lng move when a city spreads; `cl` is the cluster size it stands for. */
interface Disp extends GlobePoint { lat0: number; lng0: number; ci: number; cn: number; cl: number; gc: number; glat: number; glng: number; gname: string; gmin: number; a: number; dy: number }
// cl: investors the marker stands for (1 = itself); gc: cities merged into it; glat/glng: where the marker sits; a: ring angle

const SPREAD_ALT = 0.5;             // below this camera altitude a city opens into a ring with name tags; above it, cities are pills
const SELECT_ALT = 0.32;            // where a selected investor is shown
const hex2rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
export const hasWebGL = () => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); };
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// soft radial sprite for the city glow (one shared texture)
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}
// label styles, injected once (the labels live outside any Astro-scoped markup)
let styled = false;
function injectStyles() {
  if (styled) return; styled = true;
  const st = document.createElement('style');
  st.textContent = `.gl-lab{position:relative;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;font:600 12px/1.2 var(--font,inherit);color:#f2efe8;white-space:nowrap;transition:opacity .2s}
.gl-lab-c{display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:rgba(8,11,9,.86);border:1px solid rgba(255,255,255,.22);box-shadow:0 4px 18px rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.gl-lab-c small{font-size:11px;color:#9aa49c;font-weight:500}
.gl-lab-c i{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#7FB58C;color:#0b0f0c;font-style:normal;font-size:11.5px;font-weight:700}
.gl-lab-c:hover{border-color:#7FB58C}
.gl-lab-n{display:inline-block;padding:3px 8px;border-radius:8px;background:rgba(8,11,9,.78);border:1px solid rgba(255,255,255,.14);font-weight:500;font-size:11.5px}
.gl-lab-n:hover,.gl-lab-n.is-sel{border-color:#7FB58C;color:#fff;background:rgba(8,11,9,.95)}
.gl-lab-n.is-sel{font-weight:700}`;
  document.head.append(st);
}
const angular = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = Math.PI / 180; const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) / r;
};

export function mountGlobe(el: HTMLElement, opts: GlobeOptions): GlobeHandle {
  injectStyles();
  const reduce = !!opts.reduce;
  const land = (feature(topo as any, (topo as any).objects.countries) as any).features;
  let selId: string | null = null;
  const colorOf = (p: Disp) => (p.id === selId ? '#ffffff' : opts.colors[p.t]);
  const globe = new Globe(el, { animateIn: !reduce, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })
    .width(el.clientWidth).height(el.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true).atmosphereColor('#7FB58C').atmosphereAltitude(0.22)
    .hexPolygonsData(land).hexPolygonResolution(3).hexPolygonMargin(0.6).hexPolygonUseDots(true).hexPolygonAltitude(0.004).hexPolygonColor(() => 'rgba(127,181,140,0.42)')
    .polygonsData(land).polygonAltitude(0.002).polygonCapColor(() => 'rgba(127,181,140,0.05)').polygonSideColor(() => 'rgba(0,0,0,0)').polygonStrokeColor(() => 'rgba(160,200,170,0.38)').polygonsTransitionDuration(0)
    .showGraticules(true)
    .pointsTransitionDuration(reduce ? 0 : 350)
    .pointLat('lat').pointLng('lng').pointColor((p: any) => colorOf(p))
    .pointAltitude((p: any) => (p.id === selId ? 0.05 : 0.006 + Math.min(p.a12, 10) * 0.004 + (p.cl > 1 ? 0.01 : 0)))
    .pointRadius((p: any) => (p.cl > 1 ? 0.3 + 0.1 * Math.sqrt(p.cl) : 0.18 + Math.min(p.a12, 10) * 0.03) * (p.id === selId ? 1.4 : 1)).pointResolution(16)
    .pointLabel((p: any) => (p.cl > 1 ? `<b>${esc(p.gname)}</b>${p.cl} investors${p.gc > 1 ? ` · ${p.gc} cities` : ''}` : opts.label ? opts.label(p) : `<b>${esc(p.n)}</b>`))
    .onPointClick((p: any) => { if (p.cl > 1) open(p); else opts.onSelect?.(p); })
    .ringColor((r: any) => (t: number) => hex2rgba(opts.colors[r.t], 0.9 * (1 - t))).ringMaxRadius(2.6).ringPropagationSpeed(reduce ? 0 : 1.4).ringRepeatPeriod(1400).ringAltitude(0.015)
    .arcStartLat('sLat').arcStartLng('sLng').arcEndLat('eLat').arcEndLng('eLng').arcColor((a: any) => [hex2rgba(opts.colors[a.t], 0.85), hex2rgba(opts.colors[a.t], 0.15)]).arcAltitudeAutoScale(0.45).arcStroke(0.32)
    .arcDashLength(0.45).arcDashGap(0.25).arcDashAnimateTime(reduce ? 0 : 2600).arcsTransitionDuration(700)
    .arcLabel((a: any) => (opts.arcLabel ? opts.arcLabel(a) : `<b>${esc(a.e)}</b>`))
    // city glow: an additive sprite under every marker, bigger for busier investors and bigger clusters
    .customLayerData([])
    .customThreeObject((p: any) => {
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(opts.colors[p.t]), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      return new THREE.Sprite(m);
    })
    .customThreeObjectUpdate((obj: any, p: any) => { Object.assign(obj.position, globe.getCoords(p.lat, p.lng, 0.006)); const k = 3 + Math.min(p.a12, 10) * 0.7 + (p.cl > 1 ? 2 * Math.sqrt(p.cl) : 0); obj.scale.set(k, k, 1); })
    // labels: a count pill per clustered city, a name tag per spread investor
    .htmlLat('lat').htmlLng('lng').htmlAltitude((d: any) => (d.cl > 1 ? 0.03 : 0.02))
    .htmlElement((d: any) => {
      const div = document.createElement('div'); div.className = 'gl-lab';
      if (d.cl > 1) { div.innerHTML = `<span class="gl-lab-c" style="transform:translateY(${d.dy || 0}px)">${esc(d.gname)}${d.gc > 1 ? ` <small>+${d.gc - 1}</small>` : ''}<i>${d.cl}</i></span>`; div.addEventListener('click', (e) => { e.stopPropagation(); open(d.src || d); }); }
      else { const sx = Math.sin(d.a), sy = -Math.cos(d.a); div.innerHTML = `<span class="gl-lab-n${d.id === selId ? ' is-sel' : ''}" style="transform:translate(${Math.round(sx * 55)}%,${Math.round(sy * 95 - 10)}%)">${esc(d.n)}</span>`; div.addEventListener('click', (e) => { e.stopPropagation(); opts.onSelect?.(d.src || d); }); }
      return div;
    })
    .htmlElementVisibilityModifier((elm: any, visible: boolean) => { elm.style.opacity = visible ? '1' : '0'; elm.style.pointerEvents = visible ? 'auto' : 'none'; });
  const mat = globe.globeMaterial() as any; mat.color.set('#0b0f0c'); mat.emissive.set('#0a1a10'); mat.emissiveIntensity = 0.35; mat.shininess = 4;
  const ctl = globe.controls(); ctl.autoRotate = !reduce; ctl.autoRotateSpeed = opts.compact ? 0.6 : 0.45; ctl.enablePan = false; ctl.minDistance = 115; ctl.maxDistance = 520; ctl.zoomSpeed = 0.8;
  if (opts.compact) ctl.enableZoom = false;
  const home = opts.home || { lat: 44, lng: 8, altitude: 1.7 };
  globe.pointOfView({ ...home, altitude: reduce ? home.altitude : home.altitude * 2 }, 0);
  if (!reduce) setTimeout(() => globe.pointOfView(home, 2200), 300);
  const ro = new ResizeObserver(() => globe.width(el.clientWidth).height(el.clientHeight)); ro.observe(el);
  if (opts.onUserInput) el.addEventListener('pointerdown', opts.onUserInput, { passive: true });

  // ---- clustering + layout ----
  let disp: Disp[] = [];
  let lastKey = '';
  function layout(force = false) {
    const pov = globe.pointOfView(); const alt = pov.altitude;
    const spread = alt < SPREAD_ALT;
    // quantise so a slow zoom does not relayout every frame; in spread mode the label set follows the camera
    const key = `${spread ? 's' : 'c'}:${Math.round(alt * 12)}:${Math.round(pov.lat / 3)}:${Math.round(pov.lng / 3)}`;
    if (!force && key === lastKey) return; lastKey = key;
    const shown: Disp[] = []; const labels: Disp[] = [];
    if (!spread) {
      // greedy grouping: cities closer than the merge radius (scales with altitude) share one marker, named after the biggest city
      const cities = new Map<string, Disp[]>(); for (const p of disp) { p.lat = p.lat0; p.lng = p.lng0; p.cl = 1; p.gc = 1; (cities.get(p.ck) || cities.set(p.ck, []).get(p.ck)!).push(p); }
      const sorted = [...cities.values()].sort((a, b) => b.length - a.length);
      const mergeR = alt * 6;           // wide view: nearby cities share a pill; mid view: one pill per city
      const groups: { lat: number; lng: number; name: string; members: Disp[]; cities: [number, number][] }[] = [];
      for (const m of sorted) {
        const g = groups.find((g) => angular(g.lat, g.lng, m[0].lat0, m[0].lng0) < mergeR);
        if (g) { g.members.push(...m); g.cities.push([m[0].lat0, m[0].lng0]); } else groups.push({ lat: m[0].lat0, lng: m[0].lng0, name: m[0].city || m[0].c, members: [...m], cities: [[m[0].lat0, m[0].lng0]] });
      }
      for (const g of groups) {
        if (g.members.length === 1) { shown.push(g.members[0]); continue; }
        const rep = [...g.members].sort((a, b) => b.a12 - a.a12)[0];
        // closest pair of cities in the group: opening the group must zoom in far enough to split them
        let gmin = 180; for (let i = 0; i < g.cities.length; i++) for (let j = i + 1; j < g.cities.length; j++) gmin = Math.min(gmin, angular(g.cities[i][0], g.cities[i][1], g.cities[j][0], g.cities[j][1]));
        rep.lat = g.lat; rep.lng = g.lng; rep.cl = g.members.length; rep.gc = g.cities.length; rep.gname = g.name; rep.glat = g.lat; rep.glng = g.lng; rep.gmin = gmin;
        shown.push(rep); labels.push(rep);
      }
    } else {
      const reach = alt * 28;               // labels only near the camera centre
      for (const p of disp) {
        p.cl = 1; p.gc = 1;
        if (p.cn === 1) { p.lat = p.lat0; p.lng = p.lng0; p.a = -Math.PI / 2; }
        else {
          // ring radius scales with altitude (so it keeps the same size on screen) and with the number of dots on it
          const r = Math.min(1.6, Math.max(0.08, alt * (1.4 + 0.6 * Math.sqrt(p.cn))));
          const a = (2 * Math.PI * p.ci) / p.cn - Math.PI / 2; p.a = a;
          p.lat = p.lat0 + r * Math.cos(a); p.lng = p.lng0 + (r * Math.sin(a)) / Math.max(0.3, Math.cos((p.lat0 * Math.PI) / 180));
        }
        shown.push(p);
        // ring labels only once the camera is close enough for them to be readable
        if (p.id === selId || angular(pov.lat, pov.lng, p.lat, p.lng) < reach) labels.push(p);
      }
      if (labels.length > 70) { labels.sort((a, b) => (b.id === selId ? 1 : 0) - (a.id === selId ? 1 : 0) || b.a12 - a.a12); labels.length = 70; }
    }
    // pills that would overlap on screen are nudged down, biggest first
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const p of labels.filter((l) => l.cl > 1).sort((a, b) => b.cl - a.cl)) {
      const sc = globe.getScreenCoords(p.lat, p.lng, 0.03); if (!sc) { p.dy = 0; continue; }
      const w = 9.5 * (p.gname.length + (p.gc > 1 ? 4 : 0)) + 64, h = 34; let dy = 0;
      for (let tries = 0; tries < 4; tries++) {
        const hit = placed.some((r) => Math.abs(r.x - sc.x) < (r.w + w) / 2 && Math.abs(r.y - (sc.y + dy)) < (r.h + h) / 2);
        if (!hit) break; dy += h + 2;
      }
      p.dy = dy; placed.push({ x: sc.x, y: sc.y + dy, w, h });
    }
    globe.pointsData(shown).customLayerData(shown).ringsData(shown.filter((p) => p.cl === 1 && p.open)).htmlElementsData(labels.map((p) => ({ ...p, src: p })));
  }
  let raf = 0;
  globe.onZoom(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => layout()); });
  function stopSpin() { if (ctl.autoRotate) { ctl.autoRotate = false; opts.onSpinStop?.(); } }
  function open(p: Disp) {
    opts.onUserInput?.(); stopSpin();
    const alt = globe.pointOfView().altitude;
    // a merged group splits at a closer altitude; a single city opens into its ring
    // a group splits once the merge radius at the new altitude is below the closest pair of its cities; if that is closer than the ring view, go straight to the ring
    let target = p.gc > 1 ? Math.min(alt * 0.45, (p.gmin / 4.5) * 0.85) : SELECT_ALT;
    if (target < SPREAD_ALT) target = SELECT_ALT;
    globe.pointOfView({ lat: p.glat ?? p.lat0, lng: p.glng ?? p.lng0, altitude: target }, reduce ? 0 : 900); setTimeout(() => layout(true), reduce ? 0 : 950);
  }

  // ---- arcs: 'traffic' fires a rolling window of random arcs like air traffic; 'all' shows every arc; 'off' none ----
  let allArcs: GlobeArc[] = []; let mode: ArcMode = 'traffic'; let timer = 0; let window_: GlobeArc[][] = [];
  function tick() {
    if (!allArcs.length) { globe.arcsData([]); return; }
    const batch: GlobeArc[] = []; const n = Math.min(allArcs.length, 5);
    for (let i = 0; i < n; i++) batch.push(allArcs[Math.floor(Math.random() * allArcs.length)]);
    window_ = [...window_.slice(-2), batch];
    globe.arcsData([...new Set(window_.flat())]);
  }
  function applyArcs() {
    clearInterval(timer);
    if (mode === 'off') globe.arcsData([]);
    else if (mode === 'all' || reduce) globe.arcsData(allArcs);
    else { window_ = []; tick(); timer = window.setInterval(tick, 1600); }
  }
  return {
    globe,
    setData(points, arcs) {
      // cities closer than 0.35° (Cambridge and Boston, Palo Alto and Menlo Park) share one ring
      const keys: { ck: string; lat: number; lng: number }[] = [];
      for (const p of points) { const k = keys.find((k) => angular(k.lat, k.lng, p.lat, p.lng) < 0.35); if (k) { p.ck = k.ck; p.lat = k.lat; p.lng = k.lng; } else keys.push({ ck: p.ck, lat: p.lat, lng: p.lng }); }
      const byCity = new Map<string, number>(); for (const p of points) byCity.set(p.ck, (byCity.get(p.ck) || 0) + 1);
      const idx = new Map<string, number>();
      disp = points.map((p) => { const ci = idx.get(p.ck) || 0; idx.set(p.ck, ci + 1); return { ...p, lat0: p.lat, lng0: p.lng, ci, cn: byCity.get(p.ck) || 1, cl: 1, gc: 1, glat: p.lat, glng: p.lng, gname: p.city || p.c, gmin: 180, a: -Math.PI / 2, dy: 0 }; });
      // arcs start at the displayed position's city centre (stable while a ring opens)
      allArcs = arcs; layout(true); applyArcs();
    },
    setArcMode(m) { mode = m; applyArcs(); },
    select(id) { selId = id; layout(true); },
    spin(on) { ctl.autoRotate = on; },
    flyTo(lat, lng, altitude, ms = 900) { if (altitude < SPREAD_ALT) stopSpin(); globe.pointOfView({ lat, lng, altitude }, reduce ? 0 : ms); setTimeout(() => layout(true), reduce ? 0 : ms + 50); },
    resize() { globe.width(el.clientWidth).height(el.clientHeight); },
    destroy() { clearInterval(timer); ro.disconnect(); globe._destructor?.(); },
  };
}
export { SELECT_ALT };
