import { describe, expect, it } from 'vitest';
import { isDst, towerState, tzOffset, type TowerHours } from './towerHours';

const ALL = 0b1111111;
const WKDAYS = 0b0111110;
const WKEND = 0b1000001;

// 2026-11-06 is a Friday (US on standard time since Nov 1). 2026-07-15 is a Wednesday (daylight time).
const at = (iso: string) => new Date(iso);

describe('time zone helpers', () => {
  it('offsets and DST', () => {
    expect(tzOffset(at('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(tzOffset(at('2026-11-06T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(isDst(at('2026-07-15T12:00:00Z'), 'America/Denver')).toBe(true);
    expect(isDst(at('2026-11-06T12:00:00Z'), 'America/Denver')).toBe(false);
    expect(isDst(at('2026-07-15T12:00:00Z'), 'America/Phoenix')).toBe(false);
  });
});

describe('towerState', () => {
  const pvu: TowerHours = { k: 'sched', seg: [{ d: ALL, s: 420, e: 1260, z: false, dst: false }] }; // 0700-2100 local

  it('24h and vary', () => {
    expect(towerState({ k: 'h24' }, 'America/Denver')).toBe('open');
    expect(towerState({ k: 'vary' }, 'America/Denver')).toBe('unknown');
  });

  it('local hours in Mountain time (PVU 0700-2100)', () => {
    // 2026-11-06 Denver is UTC-7: 13:59Z = 06:59 local, 14:00Z = 07:00 local, 04:00Z(+1) = 21:00 local
    expect(towerState(pvu, 'America/Denver', at('2026-11-06T13:59:00Z'))).toBe('closed');
    expect(towerState(pvu, 'America/Denver', at('2026-11-06T14:00:00Z'))).toBe('open');
    expect(towerState(pvu, 'America/Denver', at('2026-11-07T03:59:00Z'))).toBe('open');
    expect(towerState(pvu, 'America/Denver', at('2026-11-07T04:00:00Z'))).toBe('closed');
  });

  it('weekday/weekend split (PDK 0630-2300 M-F, 0700-2300 S/S)', () => {
    const pdk: TowerHours = {
      k: 'sched',
      seg: [
        { d: WKDAYS, s: 390, e: 1380, z: false, dst: false },
        { d: WKEND, s: 420, e: 1380, z: false, dst: false },
      ],
    };
    // Fri 06:45 EST = 11:45Z → open; Sat 06:45 EST → closed; Sat 07:00 → open
    expect(towerState(pdk, 'America/New_York', at('2026-11-06T11:45:00Z'))).toBe('open');
    expect(towerState(pdk, 'America/New_York', at('2026-11-07T11:45:00Z'))).toBe('closed');
    expect(towerState(pdk, 'America/New_York', at('2026-11-07T12:00:00Z'))).toBe('open');
  });

  it('overnight Zulu window with ++ shifts an hour earlier in daylight time', () => {
    const z: TowerHours = { k: 'sched', seg: [{ d: ALL, s: 720, e: 240, z: true, dst: true }] }; // 1200-0400Z++
    // Standard time: 1200Z-0400Z
    expect(towerState(z, 'America/New_York', at('2026-11-06T11:59:00Z'))).toBe('closed');
    expect(towerState(z, 'America/New_York', at('2026-11-06T12:00:00Z'))).toBe('open');
    expect(towerState(z, 'America/New_York', at('2026-11-07T03:59:00Z'))).toBe('open');
    expect(towerState(z, 'America/New_York', at('2026-11-07T04:00:00Z'))).toBe('closed');
    // Daylight time: 1100Z-0300Z
    expect(towerState(z, 'America/New_York', at('2026-07-15T11:00:00Z'))).toBe('open');
    expect(towerState(z, 'America/New_York', at('2026-07-16T03:00:00Z'))).toBe('closed');
  });

  it('overnight weekday-only window carries into Saturday morning, not Saturday night', () => {
    const z: TowerHours = { k: 'sched', seg: [{ d: WKDAYS, s: 720, e: 240, z: true, dst: false }] }; // 1200-0400Z M-F
    expect(towerState(z, 'America/Chicago', at('2026-11-07T02:00:00Z'))).toBe('open'); // Sat 02Z, from Fri
    expect(towerState(z, 'America/Chicago', at('2026-11-07T13:00:00Z'))).toBe('closed'); // Sat 13Z
  });
});
