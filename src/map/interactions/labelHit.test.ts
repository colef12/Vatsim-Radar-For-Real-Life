import { describe, expect, it } from 'vitest';
import { boxContains, labelBox, LABEL_LINE_HEIGHT } from './labelHit';

describe('labelBox', () => {
  const pad = [1, 3, 0, 3] as const;
  const box = labelBox([100, 50], 18, pad, 0);

  it('centres the box on the anchor and adds padding', () => {
    expect(box.left).toBe(100 - (18 + 6) / 2);
    expect(box.right).toBe(100 + (18 + 6) / 2);
    expect(box.bottom - box.top).toBe(LABEL_LINE_HEIGHT + 1);
  });

  it('hits inside, misses outside', () => {
    expect(boxContains(box, [100, 50])).toBe(true);
    expect(boxContains(box, [box.left, box.top])).toBe(true);
    expect(boxContains(box, [box.right + 1, 50])).toBe(false);
    expect(boxContains(box, [100, box.bottom + 1])).toBe(false);
  });

  it('slop widens the target', () => {
    const loose = labelBox([100, 50], 18, pad, 3);
    expect(boxContains(loose, [box.right + 2, 50])).toBe(true);
  });
});
