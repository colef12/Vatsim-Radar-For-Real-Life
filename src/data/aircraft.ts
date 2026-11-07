/**
 * Internal aircraft model + normaliser for ADSBExchange-v2-shaped responses (adsb.lol, airplanes.live, adsb.fi).
 * Provider differences are handled in the relay; this only maps fields and drops unusable records.
 */

export type ProviderId = 'adsblol' | 'airplaneslive' | 'adsbfi';

export interface Aircraft {
  hex: string;
  callsign: string | null;
  reg: string | null;
  type: string | null;
  /** ADS-B emitter category, e.g. A3 (large), A7 (rotorcraft). */
  category: string | null;
  lat: number;
  lon: number;
  /** Barometric altitude in ft, or 'ground'. */
  alt: number | 'ground' | null;
  altGeom: number | null;
  gs: number | null;
  /** Track over ground, degrees true. Falls back to true heading. */
  track: number | null;
  /** fpm, baro rate preferred. */
  vs: number | null;
  squawk: string | null;
  emergency: boolean;
  /** Seconds since last position. */
  seenPos: number;
  /** adsb_icao, mlat, tisb_*, adsr_*, mode_s… */
  source: string | null;
}

export interface TrafficSnapshot {
  aircraft: Aircraft[];
  provider: ProviderId | null;
  /** Server time of the data, ms epoch. */
  now: number;
}

/** Positions older than this are dropped (matches ADSBx semantics for "valid" lat/lon). */
export const MAX_POSITION_AGE_S = 60;

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

export function normaliseAircraft(raw: Record<string, unknown>): Aircraft | null {
  const hex = str(raw.hex)?.toLowerCase();
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!hex || lat == null || lon == null) return null;
  const seenPos = num(raw.seen_pos) ?? num(raw.seen) ?? 0;
  if (seenPos > MAX_POSITION_AGE_S) return null;

  const altBaro = raw.alt_baro === 'ground' ? 'ground' : num(raw.alt_baro);
  const squawk = str(raw.squawk);
  const emergencyField = str(raw.emergency);

  return {
    hex,
    callsign: str(raw.flight)?.toUpperCase() ?? null,
    reg: str(raw.r)?.toUpperCase() ?? null,
    type: str(raw.t)?.toUpperCase() ?? null,
    category: str(raw.category)?.toUpperCase() ?? null,
    lat,
    lon,
    alt: altBaro,
    altGeom: num(raw.alt_geom),
    gs: num(raw.gs),
    track: num(raw.track) ?? num(raw.true_heading) ?? num(raw.mag_heading),
    vs: num(raw.baro_rate) ?? num(raw.geom_rate),
    squawk,
    emergency:
      (squawk != null && EMERGENCY_SQUAWKS.has(squawk)) ||
      (emergencyField != null && emergencyField !== 'none'),
    seenPos,
    source: str(raw.type),
  };
}

export function normaliseSnapshot(body: Record<string, unknown>): TrafficSnapshot {
  const list = Array.isArray(body.ac) ? body.ac : Array.isArray(body.aircraft) ? body.aircraft : [];
  const seen = new Set<string>();
  const aircraft: Aircraft[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const a = normaliseAircraft(raw as Record<string, unknown>);
    if (!a || seen.has(a.hex)) continue;
    seen.add(a.hex);
    aircraft.push(a);
  }
  const src = body.src;
  return {
    aircraft,
    provider: src === 'adsblol' || src === 'airplaneslive' || src === 'adsbfi' ? src : null,
    now: num(body.now) ?? Date.now(),
  };
}

export const PROVIDER_INFO: Record<ProviderId, { name: string; url: string }> = {
  adsblol: { name: 'adsb.lol', url: 'https://adsb.lol' },
  airplaneslive: { name: 'airplanes.live', url: 'https://airplanes.live' },
  adsbfi: { name: 'adsb.fi', url: 'https://adsb.fi' },
};
