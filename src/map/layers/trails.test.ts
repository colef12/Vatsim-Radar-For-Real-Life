import { describe, expect, it } from 'vitest';
import { colourRuns } from './trails';
import type { TrailPoint } from '@/data/trails';

const pt = (alt: number | null, t: number): TrailPoint => ({ lon: -84 + t / 1000, lat: 35, alt, t });

describe('colourRuns', () => {
  it('groups by 1,000 ft bucket and shares boundary points', () => {
    const runs = colourRuns([pt(0, 0), pt(0, 1), pt(3_000, 2), pt(3_200, 3), pt(3_400, 4), pt(10_000, 5)]);
    expect(runs.map((r) => r.points.map((p) => p.t))).toEqual([
      [0, 1, 2], // ground run closes at the first 3,000 ft point
      [2, 3, 4, 5], // 3,000 ft bucket closes at the 10,000 ft point
    ]);
    expect(runs[0]?.color).toBe('#8a8a92');
  });

  it('drops single-point runs', () => {
    expect(colourRuns([pt(5_000, 0)])).toEqual([]);
  });
});
