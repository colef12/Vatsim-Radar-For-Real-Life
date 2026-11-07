import { MapboxVectorLayer } from 'ol-mapbox-style';

/**
 * OpenFreeMap "dark" vector basemap (OpenMapTiles schema, OSM data).
 * No API key, no usage limits, CORS-enabled — verified from the live Pages origin 2026-11-06.
 * CARTO was dropped: it now requires an API key (tiles render an "API KEY REQUIRED" watermark).
 */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export function createBasemap(): MapboxVectorLayer {
  return new MapboxVectorLayer({
    styleUrl: BASEMAP_STYLE_URL,
    declutter: true,
    properties: { name: 'basemap' },
  });
}
