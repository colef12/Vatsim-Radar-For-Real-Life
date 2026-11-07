import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Stroke, Style } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import { altitudeColor, type TrailPoint, type TrailStore } from '@/data/trails';

/**
 * Trail for the selected aircraft only (Cole, 2026-11-07): everything recorded, coloured by altitude,
 * drawn under the aircraft icons.
 */
const fullCasing = new Style({ stroke: new Stroke({ color: 'rgba(19, 19, 22, 0.8)', width: 5 }), zIndex: 1 });
const fullStyles = new Map<string, Style>();

function trailStyle(feature: FeatureLike): Style[] {
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
  update: (selectedHex: string | null) => void;
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

  let full: Feature[] = [];

  function update(selectedHex: string | null) {
    for (const f of full) source.removeFeature(f);
    full = [];
    if (!selectedHex) return;
    full = colourRuns(store.get(selectedHex)).map(
      (r) => new Feature({ geometry: new LineString(r.points.map(project)), color: r.color }),
    );
    if (full.length) source.addFeatures(full);
  }

  return { layer, update };
}
