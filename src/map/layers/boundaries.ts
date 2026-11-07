import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { MultiPolygon, Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import type { FeatureLike } from 'ol/Feature';
import type { Geometry } from 'ol/geom';

/**
 * TRACON (SimAware) and ARTCC/FIR (VATSpy) outlines, always visible. Colours match VATSIM Radar's
 * CTR (green700) and APP (citrus600) styles (Cole, 2026-11-07); here they mark facility type only,
 * not staffing — every facility gets the same style. Data built by scripts/build-boundaries.mjs.
 */

const DATA_URL = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

// Values from VATSIM Radar app/utils/colors.ts + render/sectors/style.ts + airports/layers/airport-style.ts.
const FIR_RGB = '59, 126, 28'; // green700 #3B7E1C
const TRACON_RGB = '238, 121, 1'; // citrus600 #EE7901
const C = {
  firStroke: `rgba(${FIR_RGB}, 0.5)`,
  firFill: `rgba(${FIR_RGB}, 0.07)`,
  firLabel: '#e0e0e0', // lightGray500
  firLabelBorder: `rgb(${FIR_RGB})`,
  traconStroke: `rgba(${TRACON_RGB}, 0.7)`,
  traconLabel: `rgb(${TRACON_RGB})`,
  labelBg: '#1a1a1a', // darkGray900
  traconHoverStroke: `rgb(${TRACON_RGB})`,
  traconHoverFill: `rgba(${TRACON_RGB}, 0.25)`,
  firHoverStroke: `rgba(${FIR_RGB}, 0.6)`,
  firHoverFill: `rgba(${FIR_RGB}, 0.2)`,
  hoverLabelText: '#f2f2f7', // lightGray200
};

/** Which layer a boundary belongs to. */
export type BoundaryKind = 'tracon' | 'fir';

/** Resolution thresholds (m/px) below which labels are drawn. */
export const LABEL_MAX_RESOLUTION: Record<BoundaryKind, number> = {
  fir: 9_800, // ≈ zoom 4.5
  tracon: 4_900, // ≈ zoom 5.5
};

// ---------- hover state (one facility at a time, all of its pieces) ----------
let hovered: { kind: BoundaryKind; id: string } | null = null;

export function isHovered(kind: BoundaryKind, id: string): boolean {
  return hovered?.kind === kind && hovered.id === id;
}

/** Returns true if the hovered facility changed (caller should call layer.changed()). */
export function setHovered(next: { kind: BoundaryKind; id: string } | null): boolean {
  if (hovered?.kind === next?.kind && hovered?.id === next?.id) return false;
  hovered = next;
  return true;
}

const ATTRIBUTION =
  'Boundaries: <a href="https://github.com/vatsimnetwork/simaware-tracon-project" target="_blank" rel="noopener">SimAware TRACON Project</a>, ' +
  '<a href="https://github.com/vatsimnetwork/vatspy-data-project" target="_blank" rel="noopener">VATSpy Data Project</a> ' +
  '(<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>)';

export const LABEL_FONT = '600 10px "Roboto Mono", ui-monospace, monospace';
/** Must match labelStyle(): Text padding [top, right, bottom, left] in CSS px. */
export const LABEL_PADDING = [1, 3, 0, 3] as const;

/** Label anchor: explicit label point if the dataset has one, else interior point of the largest polygon. */
export function labelPoint(feature: FeatureLike): Point | undefined {
  const cached = feature.get('_labelPoint') as Point | undefined;
  if (cached) return cached;

  const lon = feature.get('labelLon') as number | undefined;
  const lat = feature.get('labelLat') as number | undefined;
  let point: Point | undefined;
  if (lon != null && lat != null && Number.isFinite(lon) && Number.isFinite(lat)) {
    point = new Point(fromLonLat([lon, lat]));
  } else {
    // No explicit label point (all SimAware TRACONs): put the box on the top-left vertex of the
    // largest piece, like VATSIM Radar does — keeps it off the airport in the middle.
    const geom = feature.getGeometry();
    if (geom instanceof MultiPolygon) {
      let best = -1;
      for (const poly of geom.getPolygons()) {
        const area = poly.getArea();
        if (area <= best) continue;
        best = area;
        const ring = poly.getLinearRing(0)?.getCoordinates() ?? [];
        const [minX, , , maxY] = poly.getExtent();
        let corner = ring[0];
        let cornerDist = Infinity;
        for (const c of ring) {
          const dist = c[0]! - minX! + (maxY! - c[1]!);
          if (dist < cornerDist) {
            cornerDist = dist;
            corner = c;
          }
        }
        if (corner) point = new Point(corner);
      }
    }
  }
  if (point && 'set' in feature) feature.set('_labelPoint', point, true);
  return point;
}

function labelStyle(
  text: string,
  color: string,
  zIndex: number,
  active = false,
  border = color,
  borderWidth = 1,
): Style {
  return new Style({
    geometry: (f) => labelPoint(f) as Geometry,
    text: new Text({
      text,
      font: LABEL_FONT,
      fill: new Fill({ color: active ? C.hoverLabelText : color }),
      backgroundFill: new Fill({ color: active ? border : C.labelBg }),
      backgroundStroke: new Stroke({ color: border, width: borderWidth, lineJoin: 'round' }),
      padding: [...LABEL_PADDING],
      overflow: true,
    }),
    // Hovered label always wins declutter against neighbours.
    zIndex: active ? zIndex + 100 : zIndex,
  });
}

/** Cache keyed by `${id}|${active}` so styles are built once per facility/state. */
function cachedLabel(
  cache: Map<string, Style>,
  id: string,
  color: string,
  zIndex: number,
  active: boolean,
  border = color,
  borderWidth = 1,
) {
  const key = `${id}|${active ? 1 : 0}`;
  let s = cache.get(key);
  if (!s) cache.set(key, (s = labelStyle(id, color, zIndex, active, border, borderWidth)));
  return s;
}

// ---------- FIR / ARTCC ----------
const firLine = new Style({
  stroke: new Stroke({ color: C.firStroke, width: 1, lineJoin: 'round' }),
  fill: new Fill({ color: C.firFill }),
});
const firLineOceanic = new Style({
  stroke: new Stroke({ color: C.firStroke, width: 1, lineDash: [8, 5], lineJoin: 'round' }),
  fill: new Fill({ color: C.firFill }),
});
const firHover = new Style({
  stroke: new Stroke({ color: C.firHoverStroke, width: 1, lineJoin: 'round' }),
  fill: new Fill({ color: C.firHoverFill }),
  zIndex: 5,
});
const firLabelCache = new Map<string, Style>();

function firStyle(feature: FeatureLike, resolution: number): Style[] {
  const id = feature.get('id') as string;
  const active = isHovered('fir', id);
  const styles = [active ? firHover : feature.get('oceanic') ? firLineOceanic : firLine];
  // Labels from roughly zoom 4.5 so the world view isn't a wall of text.
  if (feature.get('primary') && resolution < LABEL_MAX_RESOLUTION.fir) {
    styles.push(cachedLabel(firLabelCache, id, C.firLabel, 1, active, C.firLabelBorder));
  }
  return styles;
}

// ---------- TRACON ----------
const traconArea = new Style({
  stroke: new Stroke({ color: C.traconStroke, width: 2, lineJoin: 'round' }),
  // Transparent fill keeps the interior hit-testable for hover.
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
});
const traconHover = new Style({
  stroke: new Stroke({ color: C.traconHoverStroke, width: 2, lineJoin: 'round' }),
  fill: new Fill({ color: C.traconHoverFill }),
  zIndex: 5,
});
const traconLabelCache = new Map<string, Style>();

function traconStyle(feature: FeatureLike, resolution: number): Style[] {
  const id = feature.get('id') as string;
  const active = isHovered('tracon', id);
  const styles = [active ? traconHover : traconArea];
  // Labels from roughly zoom 5.5.
  if (feature.get('primary') && resolution < LABEL_MAX_RESOLUTION.tracon) {
    styles.push(cachedLabel(traconLabelCache, id, C.traconLabel, 2, active, C.traconLabel, 2));
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
    properties: { name: 'firs', boundaryKind: 'fir' satisfies BoundaryKind },
    zIndex: 10,
  });
}

export function createTraconLayer(): VectorLayer<VectorSource> {
  return new VectorLayer({
    source: new VectorSource({ url: DATA_URL('tracons.geojson'), format: new GeoJSON() }),
    style: traconStyle,
    declutter: 'boundaries',
    updateWhileInteracting: false,
    properties: { name: 'tracons', boundaryKind: 'tracon' satisfies BoundaryKind },
    zIndex: 11,
  });
}
