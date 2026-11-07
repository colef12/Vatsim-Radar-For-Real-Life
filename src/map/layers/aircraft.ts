import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Circle, Fill, Icon, Stroke, Style, Text } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import type { Aircraft, ProviderId } from '@/data/aircraft';
import { PROVIDER_INFO } from '@/data/aircraft';
import { resolveAircraftIcon } from '@/map/aircraftIcons';

/**
 * Live aircraft: VATSIM Radar type icons (recoloured SVG), rotated by track, callsign label.
 * Colours from VATSIM Radar aircraftStatusColors (default blue500, hover orange500, active orange600,
 * emergency red500).
 */
export const AIRCRAFT_COLORS = {
  default: '#3B6CEC',
  hover: '#FFA940',
  selected: '#D88500',
  emergency: '#D32C00',
} as const;
type ColorKey = keyof typeof AIRCRAFT_COLORS;

const LABEL_COLOR = '#5d8bf4';
/** Callsign labels below this resolution (≈ zoom 7.4). */
const LABEL_MAX_RESOLUTION = 900;
/** Aircraft on the ground are hidden when zoomed out further than this (≈ zoom 9). */
const GROUND_MAX_RESOLUTION = 300;

// ---------- SVG loading + recolouring ----------
const svgText = new Map<string, string | Promise<void>>();
const dataUris = new Map<string, string>();
let onIconLoaded: (() => void) | null = null;

function iconUri(icon: string, color: ColorKey): string | null {
  const key = `${icon}|${color}`;
  const hit = dataUris.get(key);
  if (hit) return hit;
  const svg = svgText.get(icon);
  if (typeof svg !== 'string') {
    if (!svg) {
      svgText.set(
        icon,
        fetch(`${import.meta.env.BASE_URL}icons/aircraft/${icon}.svg`)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
          .then((t) => {
            svgText.set(icon, t);
            onIconLoaded?.();
          })
          .catch(() => {
            svgText.delete(icon);
          }),
      );
    }
    return null;
  }
  // Same substitution VATSIM Radar does in reColorSvg(): white body → status colour, black outline stays.
  const c = AIRCRAFT_COLORS[color];
  const recoloured = svg
    .replaceAll('\n', '')
    .replaceAll('white', c)
    .replaceAll('#F8F8FA', c)
    .replaceAll('#FFFFFF', c)
    .replaceAll('#FFF', c);
  const uri = `data:image/svg+xml,${encodeURIComponent(recoloured).replace(/'/g, '%27').replace(/"/g, '%22')}`;
  dataUris.set(key, uri);
  return uri;
}

// ---------- interaction state ----------
let hoveredHex: string | null = null;
let selectedHex: string | null = null;

export function setAircraftHover(hex: string | null): boolean {
  if (hex === hoveredHex) return false;
  hoveredHex = hex;
  return true;
}
export function setAircraftSelected(hex: string | null): boolean {
  if (hex === selectedHex) return false;
  selectedHex = hex;
  return true;
}

// ---------- styles ----------
const fallbackDot = new Style({
  image: new Circle({ radius: 3, fill: new Fill({ color: AIRCRAFT_COLORS.default }) }),
});

interface FeatureStyleCache {
  key: string;
  icon: Style;
}

function aircraftStyle(feature: FeatureLike, resolution: number): Style[] | undefined {
  const a = feature.get('ac') as Aircraft;
  if (a.alt === 'ground' && resolution > GROUND_MAX_RESOLUTION) return undefined;

  const color: ColorKey = a.emergency
    ? 'emergency'
    : a.hex === selectedHex
      ? 'selected'
      : a.hex === hoveredHex
        ? 'hover'
        : 'default';
  const { icon, size } = resolveAircraftIcon(a.type, a.category);
  const uri = iconUri(icon, color);
  const styles: Style[] = [];

  if (!uri) styles.push(fallbackDot);
  else {
    const key = `${icon}|${color}`;
    const f = feature as Feature;
    let c = f.get('_style') as FeatureStyleCache | undefined;
    if (!c || c.key !== key) {
      c = {
        key,
        icon: new Style({
          image: new Icon({ src: uri, width: size, rotateWithView: true, declutterMode: 'none' }),
          zIndex: color === 'default' ? 1 : 10,
        }),
      };
      f.set('_style', c, true);
    }
    c.icon.getImage()?.setRotation(((a.track ?? 0) * Math.PI) / 180);
    styles.push(c.icon);
  }

  if (resolution < LABEL_MAX_RESOLUTION || color !== 'default') {
    const text = a.callsign ?? a.reg ?? a.hex.toUpperCase();
    styles.push(
      new Style({
        text: new Text({
          text,
          font: '600 11px "Libre Franklin", Arial, sans-serif',
          offsetY: size / 2 + 9,
          fill: new Fill({ color: color === 'default' ? LABEL_COLOR : AIRCRAFT_COLORS[color] }),
          stroke: new Stroke({ color: 'rgba(19, 19, 22, 0.85)', width: 3 }),
        }),
        zIndex: color === 'default' ? 1 : 10,
      }),
    );
  }
  return styles;
}

// ---------- layer ----------
export interface AircraftLayer {
  layer: VectorLayer<VectorSource>;
  update: (aircraft: Aircraft[], provider: ProviderId | null) => void;
  redraw: () => void;
  dispose: () => void;
}

export function createAircraftLayer(): AircraftLayer {
  const source = new VectorSource();
  const layer = new VectorLayer({
    source,
    style: aircraftStyle,
    declutter: 'aircraft',
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    properties: { name: 'aircraft' },
    zIndex: 30,
  });
  onIconLoaded = () => layer.changed();

  let lastProvider: ProviderId | null = null;

  function update(aircraft: Aircraft[], provider: ProviderId | null) {
    const keep = new Set<string>();
    const add: Feature[] = [];
    for (const a of aircraft) {
      keep.add(a.hex);
      const coord = fromLonLat([a.lon, a.lat]);
      const f = source.getFeatureById(a.hex) as Feature | null;
      if (f) {
        (f.getGeometry() as Point).setCoordinates(coord);
        f.set('ac', a);
      } else {
        const nf = new Feature({ geometry: new Point(coord), ac: a });
        nf.setId(a.hex);
        add.push(nf);
      }
    }
    for (const f of source.getFeatures()) if (!keep.has(f.getId() as string)) source.removeFeature(f);
    if (add.length) source.addFeatures(add);

    if (provider !== lastProvider) {
      lastProvider = provider;
      const p = provider ? PROVIDER_INFO[provider] : null;
      source.setAttributions(
        p ? `Traffic: <a href="${p.url}" target="_blank" rel="noopener">${p.name}</a>` : undefined,
      );
    }
  }

  return {
    layer,
    update,
    redraw: () => layer.changed(),
    dispose: () => {
      onIconLoaded = null;
    },
  };
}
