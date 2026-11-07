import { describe, expect, it } from 'vitest';
import { normaliseAircraft, normaliseSnapshot } from './aircraft';

const base = {
  hex: 'A1B2C3',
  type: 'adsb_icao',
  flight: 'DAL1128 ',
  r: 'n123dl',
  t: 'b739',
  category: 'A3',
  lat: 40.6,
  lon: -111.9,
  alt_baro: 35025,
  alt_geom: 36100,
  gs: 452.3,
  track: 151.2,
  baro_rate: -64,
  squawk: '3301',
  emergency: 'none',
  seen_pos: 0.4,
};

describe('normaliseAircraft', () => {
  it('maps ADSBx v2 fields', () => {
    expect(normaliseAircraft(base)).toEqual({
      hex: 'a1b2c3',
      callsign: 'DAL1128',
      reg: 'N123DL',
      type: 'B739',
      category: 'A3',
      lat: 40.6,
      lon: -111.9,
      alt: 35025,
      altGeom: 36100,
      gs: 452.3,
      track: 151.2,
      vs: -64,
      squawk: '3301',
      emergency: false,
      seenPos: 0.4,
      source: 'adsb_icao',
    });
  });

  it('keeps ground, falls back to heading, flags emergencies', () => {
    const a = normaliseAircraft({
      ...base,
      alt_baro: 'ground',
      track: undefined,
      true_heading: 90,
      squawk: '7700',
    });
    expect(a).toMatchObject({ alt: 'ground', track: 90, emergency: true });
    expect(normaliseAircraft({ ...base, emergency: 'minfuel' })?.emergency).toBe(true);
  });

  it('drops records without a position or with a stale one', () => {
    expect(normaliseAircraft({ ...base, lat: undefined })).toBeNull();
    expect(normaliseAircraft({ ...base, seen_pos: 75 })).toBeNull();
    expect(normaliseAircraft({ ...base, hex: '' })).toBeNull();
  });
});

describe('normaliseSnapshot', () => {
  it('reads ac or aircraft, de-duplicates hex, keeps provider', () => {
    const s = normaliseSnapshot({
      ac: [base, base, { ...base, hex: 'ffffff' }, null],
      now: 123,
      src: 'airplaneslive',
    });
    expect(s.aircraft.map((a) => a.hex)).toEqual(['a1b2c3', 'ffffff']);
    expect(s.provider).toBe('airplaneslive');
    expect(s.now).toBe(123);
    expect(normaliseSnapshot({ aircraft: [base] }).aircraft).toHaveLength(1);
  });
});
