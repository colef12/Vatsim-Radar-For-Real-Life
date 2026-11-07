import { normaliseSnapshot, type TrafficSnapshot } from './aircraft';

export type PollerStatus =
  | { state: 'disabled' }
  | { state: 'loading' }
  | { state: 'ok'; at: number }
  | { state: 'error'; message: string; retryInMs: number };

export interface ViewportQuery {
  lat: number;
  lon: number;
  /** Radius in nm, 1–250. */
  nm: number;
}

const BACKOFF_MS = [5_000, 10_000, 20_000, 60_000];
export const MAX_RADIUS_NM = 250;

/** Great-circle distance in nm. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Query circle that covers the viewport: centre + distance to the farthest corner, clamped to 10–250 nm. */
export function queryForViewport(center: [number, number], corners: [number, number][]): ViewportQuery {
  const [lon, lat] = center;
  const far = Math.max(...corners.map(([cLon, cLat]) => distanceNm(lat, lon, cLat, cLon)));
  return {
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
    nm: Math.round(Math.min(MAX_RADIUS_NM, Math.max(10, far))),
  };
}

/**
 * Polls the relay for the current viewport. Pauses while the tab is hidden, backs off on errors
 * (5 → 10 → 20 → 60 s), and never has two requests in flight.
 */
export class TrafficPoller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: AbortController | null = null;
  private failures = 0;
  private stopped = true;
  private query: ViewportQuery | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly intervalMs: number,
    private readonly onData: (s: TrafficSnapshot) => void,
    private readonly onStatus: (s: PollerStatus) => void,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  start() {
    if (!this.baseUrl) {
      this.onStatus({ state: 'disabled' });
      return;
    }
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onStatus({ state: 'loading' });
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.inflight?.abort();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** New viewport: fetch right away if it differs meaningfully from the last one. */
  setViewport(q: ViewportQuery) {
    const prev = this.query;
    this.query = q;
    if (this.stopped || !prev) {
      if (!this.stopped) this.schedule(0);
      return;
    }
    const moved = distanceNm(prev.lat, prev.lon, q.lat, q.lon);
    if (moved > prev.nm * 0.25 || Math.abs(q.nm - prev.nm) > prev.nm * 0.25) this.schedule(250);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.schedule(0);
    else clearTimeout(this.timer);
  };

  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick() {
    if (this.stopped || document.visibilityState === 'hidden' || !this.query) return;
    if (this.inflight) return; // a viewport change while a request runs is picked up by the next tick
    const q = this.query;
    const ctrl = new AbortController();
    this.inflight = ctrl;
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v2/point/${q.lat}/${q.lon}/${q.nm}`,
        {
          signal: ctrl.signal,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snap = normaliseSnapshot((await res.json()) as Record<string, unknown>);
      this.failures = 0;
      this.onData(snap);
      this.onStatus({ state: 'ok', at: Date.now() });
      this.schedule(this.intervalMs);
    } catch (err) {
      if (ctrl.signal.aborted && this.stopped) return;
      const retryInMs = BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length - 1)]!;
      this.failures++;
      this.onStatus({ state: 'error', message: err instanceof Error ? err.message : 'error', retryInMs });
      this.schedule(retryInMs);
    } finally {
      if (this.inflight === ctrl) this.inflight = null;
    }
  }
}
