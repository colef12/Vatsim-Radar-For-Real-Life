import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { MultiPolygon, Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import type { FeatureLike } from 'ol/Feature';
import type { Geometry } from 'ol/geom';

/**
 * TRACON (SimAware) and ARTCC/FIR (VATSpy) outlines. Always visible, never imply staffing:
 * one neutral style per type, no "active" colouring. Data built by scripts/build-boundaries.mjs.
 */

const DATA_URL = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

// Colours from src/styles/_colors.scss (canvas styles can't read SCSS vars).
const C = {
  firStroke: 'rgba(151, 151, 157, 0.30)', // lightGray900 @ 30%
  firLabel: '#97979d',
  traconStroke: 'rgba(89, 135, 255, 0.75)', // blue400
  traconFill: 'rgba(89, 135, 255, 0.05)',
  traconLabel: '#5987ff',
  labelBg: 'rgba(24, 24, 27, 0.85)', // darkGray800
};

const ATTRIBUTION =
  'Boundaries: <a href="https://github.com/vatsimnetwork/simaware-tracon-project" target="_blank" rel="noopener">SimAware TRACON Project</a>, ' +
  '<a href="https://github.com/vatsimnetwork/vatspy-data-project" target="_blank" rel="noopener">VATSpy Data Project</a> ' +
  '(<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>)';

const LABEL_FONT = '600 10px "Roboto Mono", ui-monospace, monospace';

/** Label anchor: explicit label point if the dataset has one, else interior point of the largest polygon. */
function labelPoint(feature: FeatureLike): Point | undefined {
  const cached = feature.get('_labelPoint') as Point | undefined;
  if (cached) return cached;

  const lon = feature.get('labelLon') as number | undefined;
  const lat = feature.get('labelLat') as number | undefined;
  let point: Point | undefined;
  if (lon != null && lat != null && Number.isFinite(lon) && Number.isFinite(lat)) {
    point = new Point(fromLonLat([lon, lat]));
  } else {
    const geom = feature.getGeometry();
    if (geom instanceof MultiPolygon) {
      let best = -1;
      for (const poly of geom.getPolygons()) {
        const area = poly.getArea();
        if (area > best) {
          best = area;
          point = poly.getInteriorPoint();
        }
      }
    }
  }
  if (point && 'set' in feature) feature.set('_labelPoint', point, true);
  return point;
}

function labelStyle(text: string, color: string, zIndex: number): Style {
  return new Style({
    geometry: (f) => labelPoint(f) as Geometry,
    text: new Text({
      text,
      font: LABEL_FONT,
      fill: new Fill({ color }),
      backgroundFill: new Fill({ color: C.labelBg }),
      backgroundStroke: new Stroke({ color, width: 1 }),
      padding: [1, 3, 0, 3],
      overflow: true,
    }),
    zIndex,
  });
}

// ---------- FIR / ARTCC ----------
const firLine = new Style({ stroke: new Stroke({ color: C.firStroke, width: 1 }) });
const firLineOceanic = new Style({ stroke: new Stroke({ color: C.firStroke, width: 1, lineDash: [6, 4] }) });
const firLabelCache = new Map<string, Style>();

function firStyle(feature: FeatureLike, resolution: number): Style[] {
  const styles = [feature.get('oceanic') ? firLineOceanic : firLine];
  // Labels from roughly zoom 4.5 (≈ 9.8 km/px) so the world view isn't a wall of text.
  if (feature.get('primary') && resolution < 9_800) {
    const id = feature.get('id') as string;
    let s = firLabelCache.get(id);
    if (!s) firLabelCache.set(id, (s = labelStyle(id, C.firLabel, 1)));
    styles.push(s);
  }
  return styles;
}

// ---------- TRACON ----------
const traconArea = new Style({
  stroke: new Stroke({ color: C.traconStroke, width: 1.25 }),
  fill: new Fill({ color: C.traconFill }),
});
const traconLabelCache = new Map<string, Style>();

function traconStyle(feature: FeatureLike, resolution: number): Style[] {
  const styles = [traconArea];
  // Labels from roughly zoom 5.5 (≈ 4.9 km/px).
  if (feature.get('primary') && resolution < 4_900) {
    const id = feature.get('id') as string;
    let s = traconLabelCache.get(id);
    if (!s) traconLabelCache.set(id, (s = labelStyle(id, C.traconLabel, 2)));
    styles.push(s);
  }
  return styles;
}

export function createFirLayer(): VectorLayer<VectorSource> {
  return new VectorLayer({
    source: new VectorSource({
      url: DATA_URL('firs.geojson'),
      format: new GeoJSON(),
      attributions: ATTRIBUTION,
    }),
    style: firStyle,
    declutter: 'boundaries',
    updateWhileInteracting: false,
    properties: { name: 'firs' },
    zIndex: 10,
  });
}

export function createTraconLayer(): VectorLayer<VectorSource> {
  return new VectorLayer({
    source: new VectorSource({ url: DATA_URL('tracons.geojson'), format: new GeoJSON() }),
    style: traconStyle,
    declutter: 'boundaries',
    updateWhileInteracting: false,
    properties: { name: 'tracons' },
    zIndex: 11,
  });
}
