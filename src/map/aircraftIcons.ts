import data from './aircraftIcons.json';

/**
 * ICAO type → icon, ported from VATSIM Radar app/utils/icons.ts getAircraftIcon() (CC BY-NC 4.0).
 * Lookup order: prefix rule → alias table → icon named after the type → ADS-B emitter category → A320.
 */

const ICONS = new Set<string>(data.icons);
const ALIAS = data.alias as Record<string, string>;
const PREFIX = data.prefix as Record<string, string>;
const SIZES = data.sizes as Record<string, number>;

/** Used only when the type is missing or unknown. */
const CATEGORY_FALLBACK: Record<string, string> = {
  A1: 'c172', // light < 15.5k lb
  A2: 'c25b', // small 15.5–75k lb
  A3: 'a320', // large 75–300k lb
  A4: 'b752', // B757
  A5: 'b77w', // heavy > 300k lb
  A6: 'f16', // high performance
  A7: 'ec45', // rotorcraft
  B1: 'glid', // glider
  B2: 'ball', // lighter than air
  B4: 'c172', // ultralight
};

export interface ResolvedIcon {
  icon: string;
  /** Rendered width in CSS px (VATSIM Radar standardCoef 30, clamped 12–35). */
  size: number;
}

const cache = new Map<string, ResolvedIcon>();

export function resolveAircraftIcon(type: string | null, category: string | null): ResolvedIcon {
  const key = `${type ?? ''}|${category ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const t = type?.toUpperCase().split('/')[0] ?? '';
  let icon: string | undefined;
  if (t) {
    for (const [p, i] of Object.entries(PREFIX)) if (t.startsWith(p)) icon = i;
    icon ??= ALIAS[t];
    if (!icon && ICONS.has(t.toLowerCase())) icon = t.toLowerCase();
  }
  if (!icon && category) icon = CATEGORY_FALLBACK[category.toUpperCase()];
  if (!icon || !ICONS.has(icon)) icon = data.defaultIcon;

  const resolved = { icon, size: SIZES[icon] ?? 18 };
  cache.set(key, resolved);
  return resolved;
}
