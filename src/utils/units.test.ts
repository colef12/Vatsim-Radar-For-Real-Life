import { describe, expect, it } from 'vitest';
import { formatAltitude, formatSpeed, formatVerticalRate } from './units';

describe('formatAltitude', () => {
  it.each([
    ['ground' as const, 'GND'],
    [null, '—'],
    [0, '0 ft'],
    [4_500, '4,500 ft'],
    [17_999, '17,999 ft'],
    [18_000, 'FL180'],
    [35_025, 'FL350'],
    [41_000, 'FL410'],
  ])('%s → %s', (input, expected) => {
    expect(formatAltitude(input)).toBe(expected);
  });
});

describe('formatSpeed / formatVerticalRate', () => {
  it('formats knots', () => expect(formatSpeed(452.6)).toBe('453 kt'));
  it('formats climb', () => expect(formatVerticalRate(1_472)).toBe('+1,500 fpm'));
  it('formats descent', () => expect(formatVerticalRate(-832)).toBe('−800 fpm'));
  it('formats level', () => expect(formatVerticalRate(30)).toBe('0 fpm'));
});
