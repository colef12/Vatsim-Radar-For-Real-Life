import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Aircraft, ProviderId, TrafficSnapshot } from '@/data/aircraft';
import type { PollerStatus } from '@/data/poller';
import { PROXY_URL } from '@/config';

export interface RouteInfo {
  /** "KSLC-KATL" style, from adsb.lol routeset. */
  airports: string | null;
  plausible: boolean | null;
}

export const useTrafficStore = defineStore('traffic', () => {
  const byHex = shallowRef<Map<string, Aircraft>>(new Map());
  const provider = ref<ProviderId | null>(null);
  const status = ref<PollerStatus>({ state: PROXY_URL ? 'loading' : 'disabled' });
  const dataTime = ref<number | null>(null);
  const selectedHex = ref<string | null>(null);
  const routes = ref<Record<string, RouteInfo>>({});

  const count = computed(() => byHex.value.size);
  const selected = computed(() => (selectedHex.value ? (byHex.value.get(selectedHex.value) ?? null) : null));

  function applySnapshot(s: TrafficSnapshot) {
    byHex.value = new Map(s.aircraft.map((a) => [a.hex, a]));
    provider.value = s.provider;
    dataTime.value = s.now;
  }

  function select(hex: string | null) {
    selectedHex.value = hex;
    if (hex) void loadRoute(hex);
  }

  async function loadRoute(hex: string) {
    const a = byHex.value.get(hex);
    if (!a?.callsign || !PROXY_URL || routes.value[a.callsign]) return;
    try {
      const res = await fetch(`${PROXY_URL.replace(/\/$/, '')}/routeset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planes: [{ callsign: a.callsign, lat: a.lat, lng: a.lon }] }),
      });
      if (!res.ok) return;
      const list = (await res.json()) as {
        callsign?: string;
        airport_codes?: string;
        plausible?: boolean | number;
      }[];
      const r = Array.isArray(list)
        ? list.find((x) => x.callsign?.trim().toUpperCase() === a.callsign)
        : undefined;
      routes.value = {
        ...routes.value,
        [a.callsign]: {
          airports: r?.airport_codes && r.airport_codes !== 'unknown' ? r.airport_codes : null,
          plausible: r?.plausible == null ? null : Boolean(r.plausible),
        },
      };
    } catch {
      /* route is optional */
    }
  }

  return { byHex, provider, status, dataTime, selectedHex, selected, routes, count, applySnapshot, select };
});
