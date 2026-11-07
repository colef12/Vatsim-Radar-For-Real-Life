// Pure helpers for FAA NASR 28-day subscription CSVs (public domain, US Government work).
// I/O lives in build-airports.mjs; everything here is unit-tested in nasr-lib.test.mjs.

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC-4180 CSV → array of objects keyed by the header row. Handles quoted commas, quotes and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------------------
// NASR cycle dates
// ---------------------------------------------------------------------------

/** Known NASR effective date. Cycles repeat every 28 days. */
const CYCLE_ANCHOR = Date.UTC(2026, 9, 29); // 2026-10-29
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Effective dates (newest first) of the cycle in force at `now` and the one before it. */
export function nasrCycles(now = new Date(), count = 2) {
  const n = Math.floor((now.getTime() - CYCLE_ANCHOR) / (28 * DAY));
  return Array.from({ length: count }, (_, i) => new Date(CYCLE_ANCHOR + (n - i) * 28 * DAY));
}

/** 2026-10-29 → "29_Oct_2026" (the token used in nfdc.faa.gov download URLs). */
export function cycleToken(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${d}_${MONTHS[date.getUTCMonth()]}_${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Positions (D / G / T / A) from FRQ.FREQ_USE
// ---------------------------------------------------------------------------

/**
 * Which VATSIM-style positions a single FREQ_USE string represents.
 * D = clearance delivery, G = ground, T = tower (local control), A = ATIS.
 */
export function positionsFromFreqUse(freqUse) {
  const u = ` ${String(freqUse).toUpperCase()} `;
  const out = new Set();
  if (/[\s;,]CD(\/[PS])?[\s;,]/.test(u) || /CLNC\s*DEL/.test(u)) out.add('D');
  if (/[\s;,]GND(\/[PS])?[\s;,]/.test(u)) out.add('G');
  if (/[\s;,]LCL\/[PS][\s;,]/.test(u)) out.add('T');
  if (/[\s;,]D-ATIS[\s;,]/.test(u) || /[\s;,]ATIS[\s;,]/.test(u)) out.add('A');
  return out;
}

export const POSITION_ORDER = ['D', 'G', 'T', 'A'];

// ---------------------------------------------------------------------------
// Tower hours (ATC_BASE.TWR_HRS)
// ---------------------------------------------------------------------------

const DOW = { SUN: 0, MON: 1, TUE: 2, TUES: 2, WED: 3, THU: 4, THUR: 4, THURS: 4, FRI: 5, SAT: 6 };
const ALL_DAYS = 0b1111111;
const WEEKDAYS = 0b0111110;
const WEEKEND = 0b1000001;
const MONTH_RE = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\b/;

function dayRange(a, b) {
  let mask = 0;
  for (let d = DOW[a]; ; d = (d + 1) % 7) {
    mask |= 1 << d;
    if (d === DOW[b]) break;
  }
  return mask;
}

/** Day mask from a segment ("MON-FRI", "SAT & SUN", "WKDAYS", "TUE THRU FRI", "SUN"). 0 = none found. */
export function parseDays(segment) {
  const s = segment
    .toUpperCase()
    .replace(/\s+(THRU|TO|THROUGH)\s+/g, '-')
    .replace(/\s*-\s*/g, '-');
  let mask = 0;
  if (/\bM-F\b|\bWKDAYS?\b|\bWEEKDAYS?\b|(\d|\b)WKD\b/.test(s)) mask |= WEEKDAYS;
  if (/\bWKENDS?\b|\bWEEKENDS?\b/.test(s)) mask |= WEEKEND;
  if (/\bDAILY\b/.test(s)) mask |= ALL_DAYS;
  const dayTok = '(SUN|MON|TUES?|WED|THURS?|THU|FRI|SAT)';
  const rangeRe = new RegExp(`${dayTok}-${dayTok}\\b`, 'g');
  let rest = s;
  for (const m of s.matchAll(rangeRe)) {
    mask |= dayRange(m[1], m[2]);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(new RegExp(`\\b${dayTok}\\b`, 'g'))) mask |= 1 << DOW[m[1]];
  return mask;
}

const TIME_RANGE_RE = /(\d{4})\s*(Z)?\s*(\+\+)?\s*-\s*(\d{4})\s*(Z)?\s*(\+\+)?/g;
const BARE_TIME_RE = /\b\d{4}Z?\b/;
/** Text after one of these words is a remark (closures, exceptions), never days the tower is open. */
const REMARK_CUT_RE =
  /\b(CLSD|CLOSED|EXC|EXCP|EXCEPT|EXCLD|EXCLUDING|OT|OTR|OTHER|IRREGULAR|CTC|CONTACT|AIR FIELD|AFLD)\b/;
const DAY_START_RE =
  /^(SUN|MON|TUES?|WED|THURS?|THU|FRI|SAT|M-F|WKD|WKDAYS?|WKENDS?|WEEKDAYS?|WEEKENDS?|DAILY)\b/;

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
const cutRemark = (t) => {
  const m = REMARK_CUT_RE.exec(t);
  return m ? t.slice(0, m.index) : t;
};

/**
 * Parse TWR_HRS into a machine-checkable schedule.
 *
 * Returns one of
 *   { k: 'h24' }                                     always open
 *   { k: 'sched', seg: [{ d, s, e, z, dst }] }       d = day bitmask (bit0 = SUN), s/e = minutes 0-1440,
 *                                                    z = times are UTC, dst = "++" (one hour earlier in DST)
 *   { k: 'vary' }                                    seasonal / sunrise-sunset / by NOTAM / unparseable
 *
 * Within a ";"-separated part, each time range takes the day words next to it: the words *before* it
 * when the part starts with a day ("MON-FRI 1400-0500Z++"), otherwise the words *after* it
 * ("0630-2300 MON-FRI 0700-2300 SAT & SUN"). Days in a Zulu segment are UTC days.
 */
export function parseTowerHours(raw) {
  const text = String(raw ?? '')
    .toUpperCase()
    .replace(/\bOPR\b/g, ' ')
    .replace(/\bHRS?\b\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');

  if (!text) return { k: 'vary' };
  // "24", "H24", "24 EXC BY NOTAM", "24 HRS. SEE FLIP…", "24 ++ MON-SUN"
  if (/^H?24(?![\d-])/.test(text) && !/^H?24\s*(FR|FROM)\b/.test(text)) return { k: 'h24' };
  if (MONTH_RE.test(text) || /\b(SR|SS|DALGT|STANDARD TIME|TRAINING|HX)\b/.test(text)) return { k: 'vary' };

  const seg = [];
  for (const partRaw of text.split(';')) {
    const part = partRaw.trim();
    if (!part) continue;
    const ranges = [...part.matchAll(TIME_RANGE_RE)];

    if (ranges.length === 0) {
      if (BARE_TIME_RE.test(part)) return { k: 'vary' }; // "0700 MON TO 2300 FRI"
      const head = cutRemark(part);
      if (/\bH24\b/.test(head))
        seg.push({ d: parseDays(head) || ALL_DAYS, s: 0, e: 1440, z: false, dst: false });
      continue; // pure remark: "SAT-SUN CLSD", "OTHER TIMES BY NOTAM"
    }

    // Any 4-digit time left over after removing the ranges means a format we don't understand.
    if (BARE_TIME_RE.test(part.replace(TIME_RANGE_RE, ' '))) return { k: 'vary' };

    const daysFirst = DAY_START_RE.test(part);
    ranges.forEach((m, i) => {
      const prevEnd = i === 0 ? 0 : ranges[i - 1].index + ranges[i - 1][0].length;
      const nextStart = i === ranges.length - 1 ? part.length : ranges[i + 1].index;
      const window = daysFirst ? part.slice(prevEnd, m.index) : part.slice(m.index + m[0].length, nextStart);
      const days = parseDays(cutRemark(window)) || ALL_DAYS;

      const [, a, z1, p1, b, z2, p2] = m;
      let s = toMin(a);
      let e = toMin(b);
      if (s > 1440 || e > 1440) return;
      if (e === 0) e = 1440; // "0600-0000"
      if (s === 1440) s = 0;
      seg.push({ d: days, s, e, z: Boolean(z1 || z2), dst: Boolean(p1 || p2) });
    });
  }

  if (!seg.length) return { k: 'vary' };
  if (seg.length === 1 && seg[0].d === ALL_DAYS && seg[0].s === 0 && seg[0].e === 1440) return { k: 'h24' };
  return { k: 'sched', seg };
}

// ---------------------------------------------------------------------------
// Assemble airports
// ---------------------------------------------------------------------------

const round = (n, dp = 5) => Math.round(Number(n) * 10 ** dp) / 10 ** dp;

/**
 * @param {object} p
 * @param {object[]} p.atcBase  ATC_BASE.csv rows
 * @param {object[]} p.atcAtis  ATC_ATIS.csv rows
 * @param {object[]} p.frq      FRQ.csv rows
 * @param {object[]} p.aptBase  APT_BASE.csv rows
 * @param {(lat:number, lon:number) => string} p.tzLookup  IANA zone for a coordinate
 */
export function buildAirports({ atcBase, atcAtis, frq, aptBase, tzLookup }) {
  const towers = new Map();
  for (const r of atcBase) {
    if (!r.FACILITY_TYPE?.startsWith('ATCT') || r.COUNTRY_CODE !== 'US') continue;
    towers.set(r.FACILITY_ID, r);
  }

  const apt = new Map();
  for (const r of aptBase) if (towers.has(r.ARPT_ID)) apt.set(r.ARPT_ID, r);

  const pos = new Map([...towers.keys()].map((id) => [id, new Set()]));
  for (const r of frq) {
    // Only the tower's own frequencies (approach/TRACON rows for the airport don't count).
    if (r.FACILITY !== r.SERVICED_FACILITY) continue;
    const set = pos.get(r.SERVICED_FACILITY);
    if (!set) continue;
    for (const p of positionsFromFreqUse(r.FREQ_USE)) set.add(p);
  }
  for (const r of atcAtis) pos.get(r.FACILITY_ID)?.add('A');

  const out = [];
  for (const [id, t] of towers) {
    const a = apt.get(id);
    if (!a || !a.LAT_DECIMAL || !a.LONG_DECIMAL) continue;
    const positions = POSITION_ORDER.filter((p) => pos.get(id).has(p)).join('');
    if (!positions.includes('T')) continue; // no published local-control frequency — not a usable tower
    const lat = round(a.LAT_DECIMAL);
    const lon = round(a.LONG_DECIMAL);
    out.push({
      id: t.ICAO_ID || a.ICAO_ID || id,
      faa: id,
      name: a.ARPT_NAME,
      city: a.CITY,
      state: a.STATE_CODE,
      lat,
      lon,
      tz: tzLookup(lat, lon),
      pos: positions,
      hrs: parseTowerHours(t.TWR_HRS),
      hrsRaw: (t.TWR_HRS || '').trim(),
    });
  }
  out.sort((x, y) => x.id.localeCompare(y.id));
  return out;
}
