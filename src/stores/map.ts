import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { readJson, writeJson } from '@/utils/storage';

export interface MapViewState {
  /** [lon, lat] in degrees */
  center: [number, number];
  zoom: number;
}

const STORAGE_KEY = 'rwr.map.view';
// Default: Eastern US, centred near KTYS.
const DEFAULT_VIEW: MapViewState = { center: [-84.5, 36.0], zoom: 6 };

export const useMapStore = defineStore('map', () => {
  const view = ref<MapViewState>(readJson(STORAGE_KEY, DEFAULT_VIEW));
  watch(view, (v) => writeJson(STORAGE_KEY, v), { deep: true });
  return { view };
});
