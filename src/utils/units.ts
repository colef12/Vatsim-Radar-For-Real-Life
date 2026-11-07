/** US transition altitude. Above this, show flight levels. */
export const TRANSITION_ALT_FT = 18_000;

/** Format a barometric altitude: "FL350" above transition, "4,500 ft" below, "GND" on ground. */
export function formatAltitude(altFt: number | 'ground' | null | undefined): string {
  if (altFt === 'ground') return 'GND';
  if (altFt == null || Number.isNaN(altFt)) return '—';
  if (altFt >= TRANSITION_ALT_FT) return `FL${String(Math.round(altFt / 100)).padStart(3, '0')}`;
  return `${Math.round(altFt).toLocaleString('en-US')} ft`;
}

/** Ground speed in knots, whole number. */
export function formatSpeed(kt: number | null | undefined): string {
  return kt == null ? '—' : `${Math.round(kt)} kt`;
}

/** Vertical rate in fpm, rounded to 100, signed. */
export function formatVerticalRate(fpm: number | null | undefined): string {
  if (fpm == null) return '—';
  const r = Math.round(fpm / 100) * 100;
  return r === 0 ? '0 fpm' : `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('en-US')} fpm`;
}
