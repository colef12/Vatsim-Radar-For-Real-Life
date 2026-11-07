import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { Aircraft, ProviderId, TrafficSnapshot } from '@/data/aircraft';
import type { PollerStatus } from '@/data/poller';
import { PROXY_URL } from '@/config';

export interface RouteInfo {
  /** ICAO codes, e.g. ["KATL", "EGLL"] (a midpoint is included when adsbdb has one). */
  airports: string[] | null;
  airline: string | null;
}

/** adsbdb.com callsign lookup: free, CORS-enabled, called straight from the browser (tested 2026-11-06). */
const ADSBDB = 'https://api.adsbdb.com/v0/callsign/';

interface AdsbdbAirport {
  icao_code?: string;
}
interface AdsbdbResponse {
  response?:
    | string
    | {
        flightroute?: {
          airline?: { name?: string } | null;
          origin?: AdsbdbAirport;
          midpoint?: AdsbdbAirport | null;
          destination?: AdsbdbAirport;
        };
      };
}

export function parseAdsbdbRoute(body: AdsbdbResponse): RouteInfo {
  const fr = typeof body.response === 'object' ? body.response.flightroute : undefined;
  if (!fr) return { airports: null, airline: null };
  const airports = [fr.origin?.icao_code, fr.midpoint?.icao_code, fr.destination?.icao_code].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return { airports: airports.length >= 2 ? airports : null, airline: fr.airline?.name ?? null };
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
    const cs = byHex.value.get(hex)?.callsign;
    if (!cs || routes.value[cs]) return;
    let info: RouteInfo = { airports: null, airline: null };
    try {
      const res = await fetch(`${ADSBDB}${encodeURIComponent(cs)}`);
      // 404 = unknown callsign (normal for GA / tail-number callsigns)
      if (res.ok) info = parseAdsbdbRoute((await res.json()) as AdsbdbResponse);
    } catch {
      /* route is optional */
    }
    routes.value = { ...routes.value, [cs]: info };
  }

  return { byHex, provider, status, dataTime, selectedHex, selected, routes, count, applySnapshot, select };
});
