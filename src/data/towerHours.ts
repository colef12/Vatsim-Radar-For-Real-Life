/**
 * Tower-hours evaluation for schedules produced by scripts/nasr-lib.mjs parseTowerHours().
 */
export interface HoursSegment {
  /** Day bitmask, bit 0 = Sunday … bit 6 = Saturday. */
  d: number;
  /** Start/end, minutes after midnight (0–1440). end ≤ start means the window runs past midnight. */
  s: number;
  e: number;
  /** Times are UTC ("Z"). */
  z: boolean;
  /** "++": during daylight time the window is one hour earlier in UTC. */
  dst: boolean;
}

export type TowerHours = { k: 'h24' } | { k: 'vary' } | { k: 'sched'; seg: HoursSegment[] };

export type TowerState = 'open' | 'closed' | 'unknown';

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Day of week and minutes after midnight in an IANA zone. */
export function zonedParts(date: Date, tz: string): { dow: number; min: number } {
  const parts = formatter(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { dow: WEEKDAY[get('weekday')] ?? 0, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** UTC offset of `tz` at `date`, in minutes (e.g. -240 for EDT). */
export function tzOffset(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  let diff = p.min - utcMin;
  const dayDiff = (p.dow - date.getUTCDay() + 7) % 7;
  if (dayDiff === 1) diff += 1440;
  else if (dayDiff === 6) diff -= 1440;
  return diff;
}

/** True when `tz` is observing daylight time at `date` (offset larger than its January/July minimum). */
export function isDst(date: Date, tz: string): boolean {
  const y = date.getUTCFullYear();
  const jan = tzOffset(new Date(Date.UTC(y, 0, 1)), tz);
  const jul = tzOffset(new Date(Date.UTC(y, 6, 1)), tz);
  if (jan === jul) return false;
  return tzOffset(date, tz) === Math.max(jan, jul);
}

const has = (mask: number, dow: number) => (mask & (1 << dow)) !== 0;

function inSegment(seg: HoursSegment, dow: number, min: number): boolean {
  if (seg.e > seg.s) return has(seg.d, dow) && min >= seg.s && min < seg.e;
  // Overnight (e.g. 1200-0400Z): opens on a listed day, runs into the next day.
  const prev = (dow + 6) % 7;
  return (has(seg.d, dow) && min >= seg.s) || (has(seg.d, prev) && min < seg.e);
}

/** Is the tower open at `now`? 'unknown' for schedules we can't evaluate (seasonal, NOTAM, SR/SS). */
export function towerState(hours: TowerHours, tz: string, now: Date = new Date()): TowerState {
  if (hours.k === 'h24') return 'open';
  if (hours.k === 'vary') return 'unknown';

  const local = zonedParts(now, tz);
  const dst = isDst(now, tz);
  const utc = { dow: now.getUTCDay(), min: now.getUTCHours() * 60 + now.getUTCMinutes() };

  for (const seg of hours.seg) {
    let { dow, min } = seg.z ? utc : local;
    if (seg.z && seg.dst && dst) {
      // "1200-0400Z++" means 1100-0300Z during daylight time: shift the clock forward an hour instead.
      min += 60;
      if (min >= 1440) {
        min -= 1440;
        dow = (dow + 1) % 7;
      }
    }
    if (inSegment(seg, dow, min)) return 'open';
  }
  return 'closed';
}
