// Pure transforms for boundary datasets. Kept separate from I/O so Vitest can cover them.
//
// Sources (both CC BY-SA 4.0 — any modified output stays CC BY-SA 4.0, see CREDITS.md):
//   TRACON: vatsimnetwork/simaware-tracon-project  (release asset TRACONBoundaries.geojson)
//   FIR/ARTCC: vatsimnetwork/vatspy-data-project    (Boundaries.geojson)

/** Coordinate precision: 4 dp ≈ 11 m. Plenty for a traffic display, cuts file size ~45%. */
export const COORD_DP = 4;

/** SimAware suffixes that are NOT approach/TRACON airspace. */
const EXCLUDED_TRACON_SUFFIXES = new Set(['TWR', 'CTR']);

const round = (n) => Math.round(n * 10 ** COORD_DP) / 10 ** COORD_DP;

/** Round every position and drop consecutive duplicates created by rounding. Keeps rings closed. */
export function roundRing(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon), round(lat)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out;
}

/** Normalise Polygon | MultiPolygon to MultiPolygon with rounded rings; drop degenerate rings (< 4 points). */
export function toRoundedMultiPolygon(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const coordinates = polys
    .map((poly) => poly.map(roundRing).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length > 0);
  return { type: 'MultiPolygon', coordinates };
}

/** Planar area of the outer rings (degrees², unprojected) — only used to rank pieces of one facility. */
export function approxArea(multiPolygon) {
  let total = 0;
  for (const [outer] of multiPolygon.coordinates) {
    let a = 0;
    for (let i = 0; i < outer.length - 1; i++) {
      a += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
    }
    total += Math.abs(a) / 2;
  }
  return total;
}

/** Mark the largest piece of each id with properties.primary = true (the one that gets a label). */
export function markPrimary(features) {
  const best = new Map();
  for (const f of features) {
    const area = approxArea(f.geometry);
    const cur = best.get(f.properties.id);
    if (!cur || area > cur.area) best.set(f.properties.id, { f, area });
  }
  for (const f of features) f.properties.primary = best.get(f.properties.id)?.f === f;
  return features;
}

/** SimAware sometimes nests a FeatureCollection as a feature (VATSIM Radar handles the same case). */
function flatten(features) {
  return features.flatMap((f) => (f && f.type === 'FeatureCollection' ? f.features : [f]));
}

/**
 * TRACON features → display set.
 * - Drop tower/centre variants (suffix TWR/CTR).
 * - Drop DEP/APP variants when a base (no-suffix) polygon exists for the same id, to avoid double outlines.
 */
export function processTracons(collection) {
  const features = flatten(collection.features).filter(
    (f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  const idsWithBase = new Set(features.filter((f) => !f.properties?.suffix).map((f) => f.properties.id));

  const out = [];
  for (const f of features) {
    const { id, name, prefix, suffix, label_lat, label_lon } = f.properties ?? {};
    if (!id) continue;
    if (suffix && EXCLUDED_TRACON_SUFFIXES.has(suffix)) continue;
    if (suffix && idsWithBase.has(id)) continue;
    const geometry = toRoundedMultiPolygon(f.geometry);
    if (!geometry.coordinates.length) continue;
    const properties = { id, name: name ?? id, prefix: prefix ?? [] };
    if (label_lat != null && label_lon != null) {
      properties.labelLat = round(Number(label_lat));
      properties.labelLon = round(Number(label_lon));
    }
    out.push({ type: 'Feature', properties, geometry });
  }
  out.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return { type: 'FeatureCollection', features: markPrimary(out) };
}

/** VATSpy FIR/ARTCC features → display set. Keeps id, oceanic flag, label point, region. */
export function processFirs(collection) {
  const out = [];
  for (const f of flatten(collection.features)) {
    if (!f?.geometry || !f.properties?.id) continue;
    const p = f.properties;
    const geometry = toRoundedMultiPolygon(f.geometry);
    if (!geometry.coordinates.length) continue;
    out.push({
      type: 'Feature',
      properties: {
        id: p.id,
        oceanic: p.oceanic === '1' || p.oceanic === 1 || p.oceanic === true,
        labelLat: round(Number(p.label_lat)),
        labelLon: round(Number(p.label_lon)),
        region: p.region ?? null,
      },
      geometry,
    });
  }
  out.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return { type: 'FeatureCollection', features: markPrimary(out) };
}
