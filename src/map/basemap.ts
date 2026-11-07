import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';

/**
 * CARTO Dark Matter raster tiles (OSM data). Free for non-commercial use with attribution.
 * Swap for Protomaps later if we want vector styling closer to VATSIM Radar.
 */
export function createBasemap(): TileLayer<XYZ> {
  return new TileLayer({
    source: new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      tilePixelRatio: 2,
      crossOrigin: 'anonymous',
      maxZoom: 19,
      attributions:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      attributionsCollapsible: false,
    }),
    preload: 2,
  });
}
