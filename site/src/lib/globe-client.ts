// Browser side of the Investor Globe: one mount function used by the full page and the hero banner.
// Loads globe.gl (three.js) so import it dynamically where the globe is optional.
import Globe from 'globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import type { GlobePoint, GlobeArc } from './globe-data';

export type ArcMode = 'traffic' | 'all' | 'off';
export interface GlobeOptions {
  colors: Record<string, string>;
  reduce?: boolean;                 // prefers-reduced-motion
  compact?: boolean;                // hero banner: no tooltips text beyond the name, calmer camera
  label?: (p: GlobePoint) => string;
  arcLabel?: (a: GlobeArc) => string;
  onSelect?: (p: GlobePoint) => void;
  onUserInput?: () => void;
  home?: { lat: number; lng: number; altitude: number };
}
export interface GlobeHandle {
  globe: any;
  setData(points: GlobePoint[], arcs: GlobeArc[]): void;
  setArcMode(m: ArcMode): void;
  spin(on: boolean): void;
  flyTo(lat: number, lng: number, altitude: number, ms?: number): void;
  resize(): void;
  destroy(): void;
}

const hex2rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
export const hasWebGL = () => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); };

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

export function mountGlobe(el: HTMLElement, opts: GlobeOptions): GlobeHandle {
  const reduce = !!opts.reduce;
  const land = (feature(topo as any, (topo as any).objects.countries) as any).features;
  const globe = new Globe(el, { animateIn: !reduce, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })
    .width(el.clientWidth).height(el.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true).atmosphereColor('#7FB58C').atmosphereAltitude(0.22)
    .hexPolygonsData(land).hexPolygonResolution(3).hexPolygonMargin(0.58).hexPolygonUseDots(true).hexPolygonAltitude(0.004).hexPolygonColor(() => 'rgba(127,181,140,0.45)')
    .showGraticules(true)
    .pointLat('lat').pointLng('lng').pointColor((p: any) => opts.colors[p.t]).pointAltitude((p: any) => 0.008 + Math.min(p.a12, 10) * 0.006).pointRadius((p: any) => 0.2 + Math.min(p.a12, 10) * 0.035).pointResolution(16)
    .pointLabel((p: any) => (opts.label ? opts.label(p) : `<b>${p.n}</b>`))
    .onPointClick((p: any) => opts.onSelect?.(p))
    .ringColor((r: any) => (t: number) => hex2rgba(opts.colors[r.t], 0.9 * (1 - t))).ringMaxRadius(2.6).ringPropagationSpeed(reduce ? 0 : 1.4).ringRepeatPeriod(1400).ringAltitude(0.015)
    .arcStartLat('sLat').arcStartLng('sLng').arcEndLat('eLat').arcEndLng('eLng').arcColor((a: any) => [hex2rgba(opts.colors[a.t], 0.85), hex2rgba(opts.colors[a.t], 0.15)]).arcAltitudeAutoScale(0.45).arcStroke(0.32)
    .arcDashLength(0.45).arcDashGap(0.25).arcDashAnimateTime(reduce ? 0 : 2600).arcsTransitionDuration(700)
    .arcLabel((a: any) => (opts.arcLabel ? opts.arcLabel(a) : `<b>${a.e}</b>`))
    // city glow: an additive sprite under every dot, bigger for busier investors
    .customLayerData([])
    .customThreeObject((p: any) => {
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(opts.colors[p.t]), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(m); const k = 3.5 + Math.min(p.a12, 10) * 0.9; s.scale.set(k, k, 1); return s;
    })
    .customThreeObjectUpdate((obj: any, p: any) => { Object.assign(obj.position, globe.getCoords(p.lat, p.lng, 0.006)); });
  const mat = globe.globeMaterial() as any; mat.color.set('#0b0f0c'); mat.emissive.set('#0a1a10'); mat.emissiveIntensity = 0.35; mat.shininess = 4;
  const ctl = globe.controls(); ctl.autoRotate = !reduce; ctl.autoRotateSpeed = opts.compact ? 0.6 : 0.45; ctl.enablePan = false; ctl.minDistance = 130; ctl.maxDistance = 520; ctl.zoomSpeed = 0.8;
  if (opts.compact) ctl.enableZoom = false;
  const home = opts.home || { lat: 44, lng: 8, altitude: 1.7 };
  globe.pointOfView({ ...home, altitude: reduce ? home.altitude : home.altitude * 2 }, 0);
  if (!reduce) setTimeout(() => globe.pointOfView(home, 2200), 300);
  const ro = new ResizeObserver(() => globe.width(el.clientWidth).height(el.clientHeight)); ro.observe(el);
  if (opts.onUserInput) el.addEventListener('pointerdown', opts.onUserInput, { passive: true });

  // arcs: 'traffic' fires a rolling window of random arcs like air traffic; 'all' shows every arc; 'off' none
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
    setData(points, arcs) { globe.pointsData(points).ringsData(points.filter((p) => p.open)).customLayerData(points); allArcs = arcs; applyArcs(); },
    setArcMode(m) { mode = m; applyArcs(); },
    spin(on) { ctl.autoRotate = on; },
    flyTo(lat, lng, altitude, ms = 900) { globe.pointOfView({ lat, lng, altitude }, reduce ? 0 : ms); },
    resize() { globe.width(el.clientWidth).height(el.clientHeight); },
    destroy() { clearInterval(timer); ro.disconnect(); globe._destructor?.(); },
  };
}
