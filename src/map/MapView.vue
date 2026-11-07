<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { createBasemap } from './basemap';
import { createFirLayer, createTraconLayer } from './layers/boundaries';
import { createAirportLayer } from './layers/airports';
import { attachBoundaryHover, type HoverInfo } from './interactions/boundaryHover';
import { useMapStore } from '@/stores/map';

const store = useMapStore();
const el = useTemplateRef<HTMLDivElement>('mapEl');
const tooltipEl = useTemplateRef<HTMLDivElement>('tooltipEl');
const map = shallowRef<OlMap | null>(null);
const hoverInfo = ref<HoverInfo | null>(null);
let detachHover: (() => void) | null = null;
let disposeAirports: (() => void) | null = null;

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

  map.value = new OlMap({
    target: el.value,
    layers: [createBasemap(), firLayer, traconLayer, airports.layer],
    view,
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false } }).extend([
      new ScaleLine({ units: 'nautical' }),
    ]),
  });

  if (tooltipEl.value) {
    detachHover = attachBoundaryHover(
      map.value,
      { tracon: traconLayer, fir: firLayer, airport: airports.layer },
      tooltipEl.value,
      (info) => (hoverInfo.value = info),
    );
  }

  map.value.on('moveend', () => {
    const c = view.getCenter();
    const z = view.getZoom();
    if (!c || z == null) return;
    const [lon, lat] = toLonLat(c) as [number, number];
    store.view = { center: [+lon.toFixed(4), +lat.toFixed(4)], zoom: +z.toFixed(2) };
  });
});

onBeforeUnmount(() => {
  detachHover?.();
  disposeAirports?.();
  map.value?.setTarget(undefined);
  map.value = null;
});
</script>

<template>
  <div ref="mapEl" class="map" />
  <!-- Positioned by an OpenLayers Overlay; kept in the DOM so the Overlay can own it. -->
  <div
    ref="tooltipEl"
    class="boundary-tip"
    :class="{
      'boundary-tip--fir': hoverInfo?.kind === 'fir',
      'boundary-tip--open': hoverInfo?.state === 'open',
      'boundary-tip--closed': hoverInfo?.state === 'closed',
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
