<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { createBasemap } from './basemap';
import { createFirLayer, createTraconLayer } from './layers/boundaries';
import { useMapStore } from '@/stores/map';

const store = useMapStore();
const el = useTemplateRef<HTMLDivElement>('mapEl');
const map = shallowRef<OlMap | null>(null);

onMounted(() => {
  if (!el.value) return;
  const view = new View({
    center: fromLonLat(store.view.center),
    zoom: store.view.zoom,
    minZoom: 2,
    maxZoom: 18,
    enableRotation: false,
  });

  map.value = new OlMap({
    target: el.value,
    layers: [createBasemap(), createFirLayer(), createTraconLayer()],
    view,
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false } }).extend([
      new ScaleLine({ units: 'nautical' }),
    ]),
  });

  map.value.on('moveend', () => {
    const c = view.getCenter();
    const z = view.getZoom();
    if (!c || z == null) return;
    const [lon, lat] = toLonLat(c) as [number, number];
    store.view = { center: [+lon.toFixed(4), +lat.toFixed(4)], zoom: +z.toFixed(2) };
  });
});

onBeforeUnmount(() => {
  map.value?.setTarget(undefined);
  map.value = null;
});
</script>

<template>
  <div ref="mapEl" class="map" />
</template>

<style scoped lang="scss">
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
