import type { Aircraft } from './aircraft';
import { distanceNm } from './poller';

/** One recorded position. alt: ft, 0 = on the ground, null = unknown. */
export interface TrailPoint {
  lon: number;
  lat: number;
  alt: number | null;
  /** ms epoch */
  t: number;
}

export interface TrailOptions {
  /** Max points kept per aircraft (≈ 2 h at 5 s polling). */
  maxPoints: number;
  /** Forget an aircraft after this long without an update. */
  forgetAfterMs: number;
  /** Skip a new point unless it moved at least this far (nm) or changed altitude by `minAltFt`. */
  minMoveNm: number;
  minAltFt: number;
}

export const DEFAULT_TRAIL_OPTIONS: TrailOptions = {
  maxPoints: 1500,
  forgetAfterMs: 10 * 60_000,
  minMoveNm: 0.05,
  minAltFt: 100,
};

/**
 * Client-side flight history: there is no free CORS-enabled history API, so the page records
 * positions itself from the moment it first sees an aircraft.
 */
export class TrailStore {
  private trails = new Map<string, TrailPoint[]>();
  private lastSeen = new Map<string, number>();

  constructor(private readonly opts: TrailOptions = DEFAULT_TRAIL_OPTIONS) {}

  add(aircraft: Aircraft[], now: number): void {
    for (const a of aircraft) {
      this.lastSeen.set(a.hex, now);
      const alt = a.alt === 'ground' ? 0 : a.alt;
      const p: TrailPoint = { lon: a.lon, lat: a.lat, alt, t: now };
      let list = this.trails.get(a.hex);
      if (!list) {
        this.trails.set(a.hex, [p]);
        continue;
      }
      const last = list[list.length - 1]!;
      const moved = distanceNm(last.lat, last.lon, p.lat, p.lon);
      const climbed = last.alt != null && alt != null ? Math.abs(alt - last.alt) : 0;
      if (moved < this.opts.minMoveNm && climbed < this.opts.minAltFt) continue;
      // A jump > 60 nm between polls is a bad position or a different aircraft reusing the hex: restart.
      if (moved > 60 && now - last.t < 60_000) list = [];
      list.push(p);
      if (list.length > this.opts.maxPoints) list.splice(0, list.length - this.opts.maxPoints);
      this.trails.set(a.hex, list);
    }
    for (const [hex, seen] of this.lastSeen) {
      if (now - seen > this.opts.forgetAfterMs) {
        this.lastSeen.delete(hex);
        this.trails.delete(hex);
      }
    }
  }

  get(hex: string): readonly TrailPoint[] {
    return this.trails.get(hex) ?? [];
  }

  /** Points recorded in the last `ms` milliseconds. */
  recent(hex: string, ms: number, now: number): readonly TrailPoint[] {
    const list = this.trails.get(hex);
    if (!list) return [];
    let i = list.length;
    while (i > 0 && now - list[i - 1]!.t <= ms) i--;
    return list.slice(Math.max(0, i - 1));
  }

  get size(): number {
    return this.trails.size;
  }
}

/**
 * Altitude → colour for trail segments (tar1090-style hue ramp: orange low, green ~10k, blue/purple high).
 * Ground = grey, unknown = brand blue.
 */
const HUE_STOPS: [number, number][] = [
  [0, 20],
  [2_000, 32],
  [4_000, 43],
  [6_000, 54],
  [8_000, 72],
  [9_000, 85],
  [11_000, 140],
  [40_000, 300],
];

export function altitudeHue(ft: number): number {
  if (ft <= HUE_STOPS[0]![0]) return HUE_STOPS[0]![1];
  for (let i = 1; i < HUE_STOPS.length; i++) {
    const [a0, h0] = HUE_STOPS[i - 1]!;
    const [a1, h1] = HUE_STOPS[i]!;
    if (ft <= a1) return h0 + ((ft - a0) / (a1 - a0)) * (h1 - h0);
  }
  return HUE_STOPS[HUE_STOPS.length - 1]![1];
}

export function altitudeColor(alt: number | null): string {
  if (alt == null) return '#5987ff';
  if (alt <= 0) return '#8a8a92';
  return `hsl(${Math.round(altitudeHue(alt))}, 88%, 55%)`;
}
