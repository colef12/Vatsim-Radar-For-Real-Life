import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Stroke, Style } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import type { Aircraft } from '@/data/aircraft';
import { altitudeColor, type TrailPoint, type TrailStore } from '@/data/trails';

/**
 * Two kinds of trail, drawn under the aircraft icons:
 *  - tail: last TAIL_MS for every aircraft, faint brand blue
 *  - full: everything recorded for the selected aircraft, coloured by altitude
 */
export const TAIL_MS = 2 * 60_000;
/** Tails hidden when zoomed out past this (≈ zoom 6.5) — they'd just be noise. */
const TAIL_MAX_RESOLUTION = 1_800;
/** Ground traffic is hidden below ≈ zoom 9 (aircraft layer), so its tail is too. */
const GROUND_MAX_RESOLUTION = 300;

const tailStyle = new Style({ stroke: new Stroke({ color: 'rgba(89, 135, 255, 0.35)', width: 1.25 }) });
const fullCasing = new Style({ stroke: new Stroke({ color: 'rgba(19, 19, 22, 0.8)', width: 5 }), zIndex: 1 });
const fullStyles = new Map<string, Style>();

function trailStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
  const kind = feature.get('kind') as 'tail' | 'full';
  if (kind === 'tail') {
    if (resolution > TAIL_MAX_RESOLUTION) return undefined;
    if (feature.get('ground') && resolution > GROUND_MAX_RESOLUTION) return undefined;
    return tailStyle;
  }
  const color = feature.get('color') as string;
  let s = fullStyles.get(color);
  if (!s) {
    s = new Style({
      stroke: new Stroke({ color, width: 2.5, lineCap: 'round', lineJoin: 'round' }),
      zIndex: 2,
    });
    fullStyles.set(color, s);
  }
  return [fullCasing, s];
}

const project = (p: TrailPoint) => fromLonLat([p.lon, p.lat]);

/**
 * Split a trail into runs of the same colour so each run is one LineString (≈ 10–40 features for a
 * 2 h flight instead of one per point). Consecutive runs share their boundary point so there are no gaps.
 */
export function colourRuns(points: readonly TrailPoint[]): { color: string; points: TrailPoint[] }[] {
  const runs: { color: string; points: TrailPoint[] }[] = [];
  for (const p of points) {
    // Bucket altitude to 1,000 ft so the colour steps are visible and runs stay long.
    const c = altitudeColor(
      p.alt == null ? null : p.alt <= 0 ? 0 : Math.max(1, Math.round(p.alt / 1000) * 1000),
    );
    const run = runs[runs.length - 1];
    if (run && run.color === c) run.points.push(p);
    else {
      if (run) run.points.push(p); // close the previous run at this point
      runs.push({ color: c, points: [p] });
    }
  }
  return runs.filter((r) => r.points.length >= 2);
}

export interface TrailLayer {
  layer: VectorLayer<VectorSource>;
  update: (aircraft: Aircraft[], selectedHex: string | null, now: number) => void;
}

export function createTrailLayer(store: TrailStore): TrailLayer {
  const source = new VectorSource();
  const layer = new VectorLayer({
    source,
    style: trailStyle,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    properties: { name: 'trails' },
    zIndex: 25,
  });

  const tails = new Map<string, Feature<LineString>>();
  let full: Feature[] = [];

  function update(aircraft: Aircraft[], selectedHex: string | null, now: number) {
    // Tails for everyone except the selected aircraft (it gets the full trail).
    const keep = new Set<string>();
    const add: Feature[] = [];
    for (const a of aircraft) {
      if (a.hex === selectedHex) continue;
      const pts = store.recent(a.hex, TAIL_MS, now);
      if (pts.length < 2) continue;
      keep.add(a.hex);
      const coords = pts.map(project);
      const f = tails.get(a.hex);
      if (f) {
        f.getGeometry()?.setCoordinates(coords);
        f.set('ground', a.alt === 'ground');
      } else {
        const nf = new Feature({
          geometry: new LineString(coords),
          kind: 'tail',
          ground: a.alt === 'ground',
        });
        tails.set(a.hex, nf);
        add.push(nf);
      }
    }
    for (const [hex, f] of tails) {
      if (!keep.has(hex)) {
        source.removeFeature(f);
        tails.delete(hex);
      }
    }
    if (add.length) source.addFeatures(add);

    // Full altitude-coloured trail for the selected aircraft.
    for (const f of full) source.removeFeature(f);
    full = [];
    if (selectedHex) {
      full = colourRuns(store.get(selectedHex)).map(
        (r) => new Feature({ geometry: new LineString(r.points.map(project)), kind: 'full', color: r.color }),
      );
      if (full.length) source.addFeatures(full);
    }
  }

  return { layer, update };
}
