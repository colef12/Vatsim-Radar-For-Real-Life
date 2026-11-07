import { describe, expect, it } from 'vitest';
import {
  buildAirports,
  cycleToken,
  nasrCycles,
  parseCsv,
  parseDays,
  parseTowerHours,
  positionsFromFreqUse,
} from './nasr-lib.mjs';

const WKDAYS = 0b0111110;
const WKEND = 0b1000001;
const ALL = 0b1111111;

describe('parseCsv', () => {
  it('handles quotes, embedded commas, doubled quotes and CRLF', () => {
    const rows = parseCsv('"A","B","C"\r\n"1","x, y","say ""hi"""\r\n"2","",""\r\n');
    expect(rows).toEqual([
      { A: '1', B: 'x, y', C: 'say "hi"' },
      { A: '2', B: '', C: '' },
    ]);
  });
});

describe('NASR cycle', () => {
  it('finds the cycle in force and the one before', () => {
    const [cur, prev] = nasrCycles(new Date(Date.UTC(2026, 10, 6)));
    expect(cycleToken(cur)).toBe('29_Oct_2026');
    expect(cycleToken(prev)).toBe('01_Oct_2026');
  });
  it('rolls over on the effective date', () => {
    expect(cycleToken(nasrCycles(new Date(Date.UTC(2026, 10, 26)))[0])).toBe('26_Nov_2026');
  });
});

describe('positionsFromFreqUse', () => {
  it.each([
    ['LCL/P', ['T']],
    ['LCL/S', ['T']],
    ['GND/P', ['G']],
    ['CD/P', ['D']],
    ['CD PRE DEP CLNC', ['D']],
    ['D-ATIS', ['A']],
    ['ATIS', ['A']],
    ['APCH/P DEP/P IC', []],
    ['CLASS B', []],
    ['ANG COMD POST', []],
  ])('%s → %j', (use, expected) => {
    expect([...positionsFromFreqUse(use)].sort()).toEqual([...expected].sort());
  });
});

describe('parseDays', () => {
  it.each([
    ['MON-FRI', WKDAYS],
    ['M-F', WKDAYS],
    ['WKDAYS', WKDAYS],
    ['SAT & SUN', WKEND],
    ['SAT-SUN', WKEND],
    ['WKENDS', WKEND],
    ['TUE THRU FRI', 0b0111100],
    ['FRI-MON', 0b1100011],
    ['SUN', 0b0000001],
    ['MON-SUN', ALL],
    ['', 0],
  ])('%s', (text, mask) => expect(parseDays(text)).toBe(mask));
});

describe('parseTowerHours', () => {
  it('24-hour towers', () => {
    for (const t of ['24', 'H24', '24 EXC BY NOTAM', '24 HRS. SEE FLIP AP/1'])
      expect(parseTowerHours(t)).toEqual({ k: 'h24' });
  });

  it('simple local hours (PVU 0700-2100)', () => {
    expect(parseTowerHours('0700-2100')).toEqual({
      k: 'sched',
      seg: [{ d: ALL, s: 420, e: 1260, z: false, dst: false }],
    });
  });

  it('midnight close (HSV 0600-0000)', () => {
    expect(parseTowerHours('0600-0000').seg[0]).toMatchObject({ s: 360, e: 1440 });
  });

  it('weekday/weekend split without separator (PDK)', () => {
    expect(parseTowerHours('0630-2300 MON-FRI 0700-2300 SAT & SUN').seg).toEqual([
      { d: WKDAYS, s: 390, e: 1380, z: false, dst: false },
      { d: WKEND, s: 420, e: 1380, z: false, dst: false },
    ]);
  });

  it('days before times (FCS)', () => {
    const r = parseTowerHours('FRI-MON 1200-0600Z++   TUE-THUR 1100-0600Z++ CLSD NEW YEARS DAY');
    expect(r.seg.map((x) => x.d)).toEqual([0b1100011, 0b0011100]);
  });

  it('Zulu with ++ DST shift', () => {
    expect(parseTowerHours('1200-0400Z++ MON-FRI EXC FEDERAL HOL.').seg).toEqual([
      { d: WKDAYS, s: 720, e: 240, z: true, dst: true },
    ]);
  });

  it('closure remarks do not add open days (COF, CBM)', () => {
    expect(parseTowerHours('1300-0500Z++ MON-FRI; SAT-SUN CLSD; HOL CLSD.').seg).toHaveLength(1);
    const cbm = parseTowerHours('0700-1900 MON-FRI, 1200-1700 SUN, CLSD SAT & HOLS.');
    expect(cbm.seg.map((x) => x.d)).toEqual([WKDAYS, 0b0000001]);
  });

  it('marks seasonal / sunrise-sunset / NOTAM-only / odd formats as vary', () => {
    for (const t of [
      '0600-2200 MAY 15-SEP 30; 0600-2100 OCT 1-MAY 14',
      'OPR SR OR 1245Z++ (WHICHEVER IS LATER) TO SS MON-FRI',
      'BY NOTAM',
      '0700 MON TO 2300 FRI; 0700-2300 SAT; SUN 0800-0000',
      '',
    ]) {
      expect(parseTowerHours(t).k).toBe('vary');
    }
  });
});

describe('buildAirports', () => {
  const atcBase = [
    { FACILITY_ID: 'PVU', FACILITY_TYPE: 'ATCT', COUNTRY_CODE: 'US', ICAO_ID: 'KPVU', TWR_HRS: '0700-2100' },
    { FACILITY_ID: 'TYS', FACILITY_TYPE: 'ATCT-TRACON', COUNTRY_CODE: 'US', ICAO_ID: 'KTYS', TWR_HRS: '24' },
    { FACILITY_ID: 'XYZ', FACILITY_TYPE: 'NON-ATCT', COUNTRY_CODE: 'US', ICAO_ID: '', TWR_HRS: '' },
    { FACILITY_ID: 'NAS', FACILITY_TYPE: 'ATCT', COUNTRY_CODE: 'BS', ICAO_ID: 'MYNN', TWR_HRS: '24' },
  ];
  const frq = [
    { FACILITY: 'PVU', SERVICED_FACILITY: 'PVU', FREQ_USE: 'LCL/P' },
    { FACILITY: 'PVU', SERVICED_FACILITY: 'PVU', FREQ_USE: 'GND/P' },
    { FACILITY: 'PVU', SERVICED_FACILITY: 'PVU', FREQ_USE: 'ATIS' },
    { FACILITY: 'S56', SERVICED_FACILITY: 'PVU', FREQ_USE: 'CD/P' }, // TRACON row — must not add D
    { FACILITY: 'TYS', SERVICED_FACILITY: 'TYS', FREQ_USE: 'LCL/P' },
    { FACILITY: 'TYS', SERVICED_FACILITY: 'TYS', FREQ_USE: 'CD/P' },
    { FACILITY: 'TYS', SERVICED_FACILITY: 'TYS', FREQ_USE: 'GND/P' },
  ];
  const aptBase = [
    {
      ARPT_ID: 'PVU',
      ICAO_ID: 'KPVU',
      ARPT_NAME: 'PROVO MUNI',
      CITY: 'PROVO',
      STATE_CODE: 'UT',
      LAT_DECIMAL: '40.21916666',
      LONG_DECIMAL: '-111.72336111',
    },
    {
      ARPT_ID: 'TYS',
      ICAO_ID: 'KTYS',
      ARPT_NAME: 'MC GHEE TYSON',
      CITY: 'KNOXVILLE',
      STATE_CODE: 'TN',
      LAT_DECIMAL: '35.81109111',
      LONG_DECIMAL: '-83.99406722',
    },
  ];
  const atcAtis = [{ FACILITY_ID: 'TYS' }];
  const out = buildAirports({
    atcBase,
    atcAtis,
    frq,
    aptBase,
    tzLookup: (lat) => (lat > 38 ? 'America/Denver' : 'America/New_York'),
  });

  it('keeps US towers only, in D-G-T-A order, ignoring TRACON rows', () => {
    expect(out.map((a) => [a.id, a.pos, a.tz])).toEqual([
      ['KPVU', 'GTA', 'America/Denver'],
      ['KTYS', 'DGTA', 'America/New_York'],
    ]);
  });

  it('carries parsed hours and coordinates', () => {
    expect(out[0]).toMatchObject({
      faa: 'PVU',
      lat: 40.21917,
      lon: -111.72336,
      hrs: { k: 'sched' },
      hrsRaw: '0700-2100',
    });
    expect(out[1]?.hrs).toEqual({ k: 'h24' });
  });
});
