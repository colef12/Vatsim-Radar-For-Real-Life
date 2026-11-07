/**
 * Geometry of an OpenLayers Text label with a background box, centred on its anchor pixel.
 * Kept pure so it can be unit-tested without a canvas.
 */
export interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Line height OpenLayers uses for a 10px font is ~1.2×; box = line + vertical padding. */
export const LABEL_LINE_HEIGHT = 12;

/**
 * @param center   anchor pixel [x, y] (CSS px)
 * @param textWidth measured text width (CSS px)
 * @param padding  [top, right, bottom, left] as passed to ol/style/Text
 * @param slop     extra px on every side so the box is easy to hit
 */
export function labelBox(
  center: readonly [number, number],
  textWidth: number,
  padding: readonly [number, number, number, number],
  slop = 2,
): LabelBox {
  const [pt, pr, pb, pl] = padding;
  const w = textWidth + pl + pr;
  const h = LABEL_LINE_HEIGHT + pt + pb;
  return {
    left: center[0] - w / 2 - slop,
    right: center[0] + w / 2 + slop,
    top: center[1] - h / 2 - slop,
    bottom: center[1] + h / 2 + slop,
  };
}

export function boxContains(box: LabelBox, pixel: readonly [number, number]): boolean {
  return pixel[0] >= box.left && pixel[0] <= box.right && pixel[1] >= box.top && pixel[1] <= box.bottom;
}
