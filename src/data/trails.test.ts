import { describe, expect, it } from 'vitest';
import type { Aircraft } from './aircraft';
import { altitudeColor, altitudeHue, TrailStore } from './trails';

const ac = (hex: string, lat: number, lon: number, alt: Aircraft['alt'] = 10_000): Aircraft => ({
  hex,
  callsign: null,
  reg: null,
  type: null,
  category: null,
  lat,
  lon,
  alt,
  altGeom: null,
  gs: null,
  track: null,
  vs: null,
  squawk: null,
  emergency: false,
  seenPos: 0,
  source: null,
});

describe('TrailStore', () => {
  it('records movement, skips duplicates, keeps order', () => {
    const s = new TrailStore();
    s.add([ac('a', 35, -84)], 0);
    s.add([ac('a', 35, -84)], 5_000); // no movement → skipped
    s.add([ac('a', 35.01, -84)], 10_000); // 0.6 nm
    s.add([ac('a', 35.01, -84, 10_500)], 15_000); // climb 500 ft → kept
    expect(s.get('a').map((p) => p.t)).toEqual([0, 10_000, 15_000]);
  });

  it('caps length, forgets stale aircraft, restarts on impossible jumps', () => {
    const s = new TrailStore({ maxPoints: 3, forgetAfterMs: 60_000, minMoveNm: 0.05, minAltFt: 100 });
    for (let i = 0; i < 5; i++) s.add([ac('a', 35 + i * 0.01, -84)], i * 5_000);
    expect(s.get('a')).toHaveLength(3);
    s.add([ac('a', 40, -84)], 30_000); // 300 nm in 5 s
    expect(s.get('a')).toHaveLength(1);
    s.add([ac('b', 30, -80)], 200_000); // 'a' unseen for 170 s → forgotten
    expect(s.get('a')).toHaveLength(0);
    expect(s.size).toBe(1);
  });

  it('recent() returns the tail plus one anchor point', () => {
    const s = new TrailStore();
    for (let i = 0; i < 10; i++) s.add([ac('a', 35 + i * 0.01, -84)], i * 10_000);
    expect(s.recent('a', 30_000, 90_000).map((p) => p.t)).toEqual([50_000, 60_000, 70_000, 80_000, 90_000]);
  });

  it('ground is recorded as 0 ft', () => {
    const s = new TrailStore();
    s.add([ac('g', 35, -84, 'ground')], 0);
    expect(s.get('g')[0]?.alt).toBe(0);
  });
});

describe('altitude colours', () => {
  it('hue rises with altitude', () => {
    const hs = [0, 2_000, 5_000, 10_000, 20_000, 35_000, 45_000].map(altitudeHue);
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThanOrEqual(hs[i - 1]!);
    expect(altitudeHue(45_000)).toBe(300);
  });
  it('ground grey, unknown blue', () => {
    expect(altitudeColor(0)).toBe('#8a8a92');
    expect(altitudeColor(null)).toBe('#5987ff');
    expect(altitudeColor(35_000)).toMatch(/^hsl\(\d+, 88%, 55%\)$/);
  });
});
