import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Icon, Style } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import { towerState, type TowerHours, type TowerState } from '@/data/towerHours';

/**
 * US towered airports with VATSIM Radar-style D / G / T / A position badges.
 * Data: FAA NASR via scripts/build-airports.mjs. Badges show positions the tower *has*;
 * they dim when the published tower hours say it is closed.
 */

export interface AirportRecord {
  id: string;
  faa: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  tz: string;
  pos: string;
  hrs: TowerHours;
  hrsRaw: string;
}

const DATA_URL = `${import.meta.env.BASE_URL}data/airports-us.json`;
const ATTRIBUTION = 'Airports &amp; tower hours: FAA NASR';

/** Badge colours sampled from VATSIM Radar's public/icons/atc/{D,G,T,A}.png (CC BY-NC 4.0). */
export const BADGE_COLORS: Record<string, string> = {
  D: '#2C5AD9',
  G: '#4A9C25',
  T: '#D32C00',
  A: '#F0BB01',
};
export const POSITION_NAMES: Record<string, string> = { D: 'Delivery', G: 'Ground', T: 'Tower', A: 'ATIS' };

/** Markers drawn below this resolution (m/px) ≈ zoom 5.9. */
export const AIRPORT_MAX_RESOLUTION = 2_600;

const ICAO_FONT = '600 11px "Libre Franklin", Arial, sans-serif';
const BADGE_FONT = '700 9px Jura, "Libre Franklin", Arial, sans-serif';
const BADGE = 13; // px
const GAP = 1;
const RADIUS = 3;

// ---------- marker canvas ----------
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: [number, number, number, number],
) {
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
  ctx.lineTo(x + r[3], y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.quadraticCurveTo(x, y, x + r[0], y);
  ctx.closePath();
}

/** Layout (CSS px, origin = top-left of canvas). The airport position sits at (anchorX, anchorY). */
export function markerLayout(icaoWidth: number, badgeCount: number) {
  const badgesW = badgeCount * BADGE + Math.max(0, badgeCount - 1) * GAP;
  const width = Math.ceil(Math.max(icaoWidth, badgesW)) + 4;
  const textH = 12;
  const anchorY = textH + 4; // dot sits 4 px below the ICAO text
  const badgesTop = anchorY + 4;
  const height = badgesTop + (badgeCount ? BADGE : 0) + 1;
  return { width, height, anchorX: width / 2, anchorY, badgesW, badgesTop, textH };
}

function drawMarker(
  icao: string,
  pos: string,
  state: TowerState,
): { canvas: HTMLCanvasElement; anchor: [number, number]; dpr: number } {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const letters = pos.split('');
  const L = markerLayout(measure(icao, ICAO_FONT), letters.length);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(L.width * dpr);
  canvas.height = Math.ceil(L.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, anchor: [L.anchorX * dpr, L.anchorY * dpr], dpr };
  ctx.scale(dpr, dpr);

  const closed = state === 'closed';

  // ICAO
  ctx.font = ICAO_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(19, 19, 22, 0.9)'; // halo for legibility over tiles/fills
  ctx.strokeText(icao, L.anchorX, 0);
  ctx.fillStyle = closed ? '#97979d' : '#f2f2f7';
  ctx.fillText(icao, L.anchorX, 0);

  // Position dot
  ctx.beginPath();
  ctx.arc(L.anchorX, L.anchorY, 2, 0, Math.PI * 2);
  ctx.fillStyle = closed ? '#6b6b73' : '#c9c9d1';
  ctx.fill();

  // Badges
  ctx.globalAlpha = closed ? 0.3 : 1;
  ctx.font = BADGE_FONT;
  ctx.textBaseline = 'middle';
  let x = L.anchorX - L.badgesW / 2;
  letters.forEach((letter, i) => {
    const first = i === 0;
    const last = i === letters.length - 1;
    roundRect(ctx, x, L.badgesTop, BADGE, BADGE, [
      first ? RADIUS : 0,
      last ? RADIUS : 0,
      last ? RADIUS : 0,
      first ? RADIUS : 0,
    ]);
    ctx.fillStyle = closed ? '#55555d' : (BADGE_COLORS[letter] ?? '#55555d');
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(letter, x + BADGE / 2, L.badgesTop + BADGE / 2 + 0.5);
    x += BADGE + GAP;
  });
  ctx.globalAlpha = 1;

  return { canvas, anchor: [L.anchorX * dpr, L.anchorY * dpr], dpr };
}

const styleCache = new Map<string, Style>();

function airportStyle(feature: FeatureLike, resolution: number): Style | undefined {
  if (resolution >= AIRPORT_MAX_RESOLUTION) return undefined;
  const id = feature.get('id') as string;
  const pos = feature.get('pos') as string;
  const state = feature.get('state') as TowerState;
  const key = `${id}|${pos}|${state}`;
  let style = styleCache.get(key);
  if (!style) {
    const { canvas, anchor, dpr } = drawMarker(id, pos, state);
    style = new Style({
      image: new Icon({
        img: canvas,
        width: canvas.width / dpr,
        height: canvas.height / dpr,
        anchor,
        anchorXUnits: 'pixels',
        anchorYUnits: 'pixels',
      }),
      // Open towers win declutter over closed ones.
      zIndex: state === 'closed' ? 1 : 2,
    });
    styleCache.set(key, style);
  }
  return style;
}

// ---------- layer ----------
function refreshStates(source: VectorSource, now = new Date()) {
  for (const f of source.getFeatures()) {
    const next = towerState(f.get('hrs') as TowerHours, f.get('tz') as string, now);
    if (f.get('state') !== next) f.set('state', next);
  }
}

export function createAirportLayer(): { layer: VectorLayer<VectorSource>; dispose: () => void } {
  const source = new VectorSource({ attributions: ATTRIBUTION });
  const layer = new VectorLayer({
    source,
    style: airportStyle,
    declutter: 'airports',
    properties: { name: 'airports' },
    zIndex: 20,
  });

  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  fetch(DATA_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${DATA_URL}`))))
    .then((data: { airports: AirportRecord[] }) => {
      if (disposed) return;
      const now = new Date();
      source.addFeatures(
        data.airports.map((a) => {
          const f = new Feature({ geometry: new Point(fromLonLat([a.lon, a.lat])), ...a });
          f.set('state', towerState(a.hrs, a.tz, now), true);
          f.setId(a.id);
          return f;
        }),
      );
      // Re-evaluate tower hours every minute.
      timer = setInterval(() => refreshStates(source), 60_000);
    })
    .catch((err) => console.error('Airports failed to load', err));

  // Canvas markers drawn before web fonts load would keep the fallback font: redraw once fonts are ready.
  document.fonts?.ready.then(() => {
    if (disposed) return;
    styleCache.clear();
    layer.changed();
  });

  return {
    layer,
    dispose: () => {
      disposed = true;
      clearInterval(timer);
    },
  };
}

/** Human summary for tooltips: "Tower open · 0700-2100 local". */
export function describeAirport(f: Feature): {
  name: string;
  detail: string;
  positions: string;
  state: TowerState;
} {
  const state = f.get('state') as TowerState;
  const raw = (f.get('hrsRaw') as string) || '';
  const hrs = f.get('hrs') as TowerHours;
  const hoursText = hrs.k === 'h24' ? '24 hr' : raw;
  const stateText = state === 'open' ? 'Tower open' : state === 'closed' ? 'Tower closed' : 'Hours vary';
  const name = (f.get('name') as string)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bIntl\b/, 'Intl');
  return {
    name: `${f.get('id') as string} · ${name}`,
    detail: `${stateText} · ${hoursText}`,
    positions: (f.get('pos') as string)
      .split('')
      .map((p) => POSITION_NAMES[p])
      .join(' · '),
    state,
  };
}
