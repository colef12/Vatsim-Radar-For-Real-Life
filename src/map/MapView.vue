<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { createBasemap } from './basemap';
import { createFirLayer, createTraconLayer } from './layers/boundaries';
import { createAirportLayer } from './layers/airports';
import { createAircraftLayer, setAircraftSelected } from './layers/aircraft';
import { createTrailLayer } from './layers/trails';
import { TrailStore } from '@/data/trails';
import type { Aircraft } from '@/data/aircraft';
import { attachBoundaryHover, type HoverInfo } from './interactions/boundaryHover';
import { useMapStore } from '@/stores/map';
import { useTrafficStore } from '@/stores/traffic';
import { queryForViewport, TrafficPoller } from '@/data/poller';
import { PROXY_URL, TRAFFIC_POLL_MS } from '@/config';
import AircraftCard from '@/components/AircraftCard.vue';
import type Feature from 'ol/Feature';

const store = useMapStore();
const traffic = useTrafficStore();
const el = useTemplateRef<HTMLDivElement>('mapEl');
const tooltipEl = useTemplateRef<HTMLDivElement>('tooltipEl');
const map = shallowRef<OlMap | null>(null);
const hoverInfo = ref<HoverInfo | null>(null);
let detachHover: (() => void) | null = null;
let disposeAirports: (() => void) | null = null;
let poller: TrafficPoller | null = null;
let disposeAircraft: (() => void) | null = null;

onMounted(() => {
  if (!el.value) return;
  const view = new View({
    center: fromLonLat(store.view.center),
    zoom: store.view.zoom,
    minZoom: 2,
    maxZoom: 18,
    enableRotation: false,
  });

  const firLayer = createFirLayer();
  const traconLayer = createTraconLayer();
  const airports = createAirportLayer();
  disposeAirports = airports.dispose;
  const aircraft = createAircraftLayer();
  disposeAircraft = aircraft.dispose;
  const trailStore = new TrailStore();
  const trails = createTrailLayer(trailStore);
  let lastAircraft: Aircraft[] = [];

  map.value = new OlMap({
    target: el.value,
    layers: [createBasemap(), firLayer, traconLayer, airports.layer, trails.layer, aircraft.layer],
    view,
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false } }).extend([
      new ScaleLine({ units: 'nautical' }),
    ]),
  });

  if (tooltipEl.value) {
    detachHover = attachBoundaryHover(
      map.value,
      { tracon: traconLayer, fir: firLayer, airport: airports.layer, aircraft: aircraft.layer },
      tooltipEl.value,
      (info) => (hoverInfo.value = info),
    );
  }

  // ---- live traffic ----
  const viewportQuery = () => {
    const size = map.value?.getSize();
    const c = view.getCenter();
    if (!size || !c) return null;
    const [minX, minY, maxX, maxY] = view.calculateExtent(size) as [number, number, number, number];
    const corners = [
      [minX, minY],
      [minX, maxY],
      [maxX, minY],
      [maxX, maxY],
    ].map((p) => toLonLat(p) as [number, number]);
    return queryForViewport(toLonLat(c) as [number, number], corners);
  };

  poller = new TrafficPoller(
    PROXY_URL,
    TRAFFIC_POLL_MS,
    (snap) => {
      const now = Date.now();
      traffic.applySnapshot(snap);
      trailStore.add(snap.aircraft, now);
      lastAircraft = snap.aircraft;
      trails.update(snap.aircraft, traffic.selectedHex, now);
      aircraft.update(snap.aircraft, snap.provider);
    },
    (status) => (traffic.status = status),
  );
  poller.start();

  // Click an aircraft → card; click empty map → close card.
  map.value.on('singleclick', (e) => {
    const f = map.value?.forEachFeatureAtPixel(e.pixel, (feat) => feat as Feature, {
      layerFilter: (l) => l === aircraft.layer,
      hitTolerance: 4,
    });
    traffic.select(f ? (f.getId() as string) : null);
  });
  watch(
    () => traffic.selectedHex,
    (hex) => {
      if (setAircraftSelected(hex)) aircraft.redraw();
      trails.update(lastAircraft, hex, Date.now());
    },
  );

  map.value.on('moveend', () => {
    const c = view.getCenter();
    const z = view.getZoom();
    if (!c || z == null) return;
    const [lon, lat] = toLonLat(c) as [number, number];
    store.view = { center: [+lon.toFixed(4), +lat.toFixed(4)], zoom: +z.toFixed(2) };
    const q = viewportQuery();
    if (q) poller?.setViewport(q);
  });
  const q0 = viewportQuery();
  if (q0) poller.setViewport(q0);
});

onBeforeUnmount(() => {
  detachHover?.();
  disposeAirports?.();
  poller?.stop();
  disposeAircraft?.();
  map.value?.setTarget(undefined);
  map.value = null;
});
</script>

<template>
  <div ref="mapEl" class="map" />
  <AircraftCard />
  <!-- Positioned by an OpenLayers Overlay; kept in the DOM so the Overlay can own it. -->
  <div
    ref="tooltipEl"
    class="boundary-tip"
    :class="{
      'boundary-tip--fir': hoverInfo?.kind === 'fir',
      'boundary-tip--open': hoverInfo?.state === 'open',
      'boundary-tip--closed': hoverInfo?.state === 'closed',
      'boundary-tip--aircraft': hoverInfo?.kind === 'aircraft',
    }"
  >
    <template v-if="hoverInfo">
      <div class="boundary-tip__name">{{ hoverInfo.name }}</div>
      <div class="boundary-tip__detail">{{ hoverInfo.detail }}</div>
      <div v-if="hoverInfo.extra" class="boundary-tip__detail">{{ hoverInfo.extra }}</div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.boundary-tip {
  pointer-events: none;
  min-width: 140px;
  padding: 8px 10px;
  border: 1px solid var(--stroke);
  border-left: 3px solid var(--brand);
  border-radius: 8px;
  background: var(--bg-2);
  box-shadow: 0 6px 20px rgb(0 0 0 / 45%);
  white-space: nowrap;

  &:empty {
    display: none;
  }

  &--fir {
    border-left-color: var(--text-2);
  }

  &--open {
    border-left-color: #4a9c25;
  }

  &--closed {
    border-left-color: var(--text-2);
  }

  &--aircraft {
    border-left-color: #ffa940;
  }

  &__name {
    color: var(--text-1);
    font-size: 14px;
    font-weight: 600;
  }

  &__detail {
    margin-top: 2px;
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 11px;
  }
}

.map {
  position: absolute;
  inset: 0;
  background: var(--bg-1);
}

:deep(.ol-zoom) {
  top: 12px;
  left: 12px;
}

:deep(.ol-zoom button),
:deep(.ol-attribution button) {
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--stroke);
}

:deep(.ol-attribution) {
  background: color-mix(in srgb, var(--bg-1) 80%, transparent);
  color: var(--text-2);
  bottom: 32px;
}

:deep(.ol-attribution a) {
  color: var(--text-2);
}

:deep(.ol-scale-line) {
  background: color-mix(in srgb, var(--bg-2) 85%, transparent);
  bottom: 40px;
}

:deep(.ol-scale-line-inner) {
  border-color: var(--text-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 10px;
}

:deep(.ol-attribution ul) {
  color: var(--text-2);
  text-shadow: none;
}
</style>
