import type OlMap from 'ol/Map';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import Overlay from 'ol/Overlay';
import { buffer } from 'ol/extent';
import {
  LABEL_FONT,
  LABEL_MAX_RESOLUTION,
  LABEL_PADDING,
  labelPoint,
  setHovered,
  type BoundaryKind,
} from '@/map/layers/boundaries';
import { boxContains, labelBox } from './labelHit';
import { describeAirport } from '@/map/layers/airports';
import type { Point } from 'ol/geom';

export interface HoverInfo {
  kind: BoundaryKind | 'airport';
  id: string;
  name: string;
  detail: string;
  /** Airports: "Delivery · Ground · Tower · ATIS" */
  extra?: string;
  /** Airports: tower state, drives the card accent colour */
  state?: 'open' | 'closed' | 'unknown';
}

type Hit = { kind: BoundaryKind; feature: Feature } | { kind: 'airport'; feature: Feature };

/** Text widths per label string, measured once with the same font the canvas uses. */
const widthCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string): number {
  let w = widthCache.get(text);
  if (w != null) return w;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 6.6; // fallback ≈ Roboto Mono 10px advance
  measureCtx.font = LABEL_FONT;
  w = measureCtx.measureText(text).width;
  widthCache.set(text, w);
  return w;
}

function describe(kind: BoundaryKind, f: Feature): HoverInfo {
  const id = f.get('id') as string;
  if (kind === 'tracon') {
    return { kind, id, name: (f.get('name') as string) || id, detail: `${id} · TRACON / Approach` };
  }
  const oceanic = Boolean(f.get('oceanic'));
  return { kind, id, name: id, detail: oceanic ? 'Oceanic FIR' : 'ARTCC / FIR' };
}

/**
 * Hover (and tap) on a boundary ID label → highlight every piece of that facility
 * and show a tooltip card above the label. Hovering an airport marker shows its
 * positions and tower hours. Returns a cleanup function.
 */
export function attachBoundaryHover(
  map: OlMap,
  layers: Record<BoundaryKind, VectorLayer<VectorSource>> & { airport?: VectorLayer<VectorSource> },
  tooltipEl: HTMLElement,
  onChange: (info: HoverInfo | null) => void,
): () => void {
  const overlay = new Overlay({
    element: tooltipEl,
    positioning: 'bottom-center',
    offset: [0, -12],
    stopEvent: false,
  });
  map.addOverlay(overlay);

  // TRACON labels sit above FIR labels, so test them first.
  const order: BoundaryKind[] = ['tracon', 'fir'];

  function hitTest(pixel: [number, number]): Hit | null {
    // Airport markers sit on top of everything else.
    if (layers.airport) {
      const airportLayer = layers.airport;
      const f = map.forEachFeatureAtPixel(pixel, (feat) => feat as Feature, {
        layerFilter: (l) => l === airportLayer,
        hitTolerance: 2,
      });
      if (f) return { kind: 'airport', feature: f };
    }

    const view = map.getView();
    const resolution = view.getResolution();
    const size = map.getSize();
    if (resolution == null || !size) return null;
    const extent = buffer(view.calculateExtent(size), resolution * 40);

    for (const kind of order) {
      if (resolution >= LABEL_MAX_RESOLUTION[kind]) continue;
      const layer = layers[kind];
      if (!layer.getVisible()) continue;
      for (const feature of layer.getSource()?.getFeaturesInExtent(extent) ?? []) {
        if (!feature.get('primary')) continue;
        const anchor = labelPoint(feature);
        if (!anchor) continue;
        const px = map.getPixelFromCoordinate(anchor.getCoordinates());
        if (!px) continue;
        const box = labelBox([px[0]!, px[1]!], textWidth(feature.get('id') as string), LABEL_PADDING);
        if (boxContains(box, pixel)) return { kind, feature };
      }
    }
    return null;
  }

  let currentAirport: Feature | null = null;

  function apply(hit: Hit | null) {
    const airport = hit?.kind === 'airport' ? hit.feature : null;
    const boundary =
      hit && hit.kind !== 'airport' ? { kind: hit.kind, id: hit.feature.get('id') as string } : null;
    const boundaryChanged = setHovered(boundary);
    if (boundaryChanged) {
      layers.tracon.changed();
      layers.fir.changed();
    }
    if (!boundaryChanged && airport === currentAirport) return;
    currentAirport = airport;

    map.getTargetElement()?.style.setProperty('cursor', hit ? 'pointer' : '');
    if (airport) {
      const d = describeAirport(airport);
      overlay.setPosition((airport.getGeometry() as Point).getCoordinates());
      onChange({
        kind: 'airport',
        id: airport.get('id') as string,
        name: d.name,
        detail: d.detail,
        extra: d.positions,
        state: d.state,
      });
    } else if (hit && hit.kind !== 'airport') {
      overlay.setPosition(labelPoint(hit.feature)?.getCoordinates());
      onChange(describe(hit.kind, hit.feature));
    } else {
      overlay.setPosition(undefined);
      onChange(null);
    }
  }

  // Throttle pointermove to one hit test per animation frame.
  let pending: [number, number] | null = null;
  let raf = 0;
  const onMove = (e: MapBrowserEvent) => {
    if (e.dragging) return;
    pending = [e.pixel[0]!, e.pixel[1]!];
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pending) apply(hitTest(pending));
    });
  };
  // Tap support for touch screens: tap a label to highlight, tap elsewhere to clear.
  const onClick = (e: MapBrowserEvent) => apply(hitTest([e.pixel[0]!, e.pixel[1]!]));
  const onLeave = () => apply(null);
  // Re-anchor after pan/zoom: label pixel moves, and labels hide below the zoom threshold.
  const onMoveEnd = () => {
    if (pending) apply(hitTest(pending));
  };

  map.on('pointermove', onMove);
  map.on('singleclick', onClick);
  map.on('moveend', onMoveEnd);
  const viewport = map.getViewport();
  viewport?.addEventListener('pointerleave', onLeave);

  return () => {
    cancelAnimationFrame(raf);
    map.un('pointermove', onMove);
    map.un('singleclick', onClick);
    map.un('moveend', onMoveEnd);
    viewport?.removeEventListener('pointerleave', onLeave);
    map.removeOverlay(overlay);
    setHovered(null);
    currentAirport = null;
  };
}
