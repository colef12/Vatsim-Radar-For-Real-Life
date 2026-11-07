import { describe, expect, it } from 'vitest';
import { resolveAircraftIcon } from './aircraftIcons';

describe('resolveAircraftIcon', () => {
  it.each([
    ['B738', null, 'b738', 17],
    ['B739', null, 'b739', undefined],
    ['A21N', null, 'a321', undefined],
    ['E75L', null, 'e75s', undefined],
    ['EC35', null, 'ec45', 12],
    ['P28A', null, 'p28x', undefined],
    ['A388', null, 'a388', 35],
    ['C172', 'A1', 'c172', 12],
  ])('%s → %s', (type, cat, icon, size) => {
    const r = resolveAircraftIcon(type, cat);
    expect(r.icon).toBe(icon);
    if (size != null) expect(r.size).toBe(size);
  });

  it('falls back to emitter category, then A320', () => {
    expect(resolveAircraftIcon(null, 'A7').icon).toBe('ec45');
    expect(resolveAircraftIcon('ZZZZ', 'A5').icon).toBe('b77w');
    expect(resolveAircraftIcon(null, null).icon).toBe('a320');
  });
});
