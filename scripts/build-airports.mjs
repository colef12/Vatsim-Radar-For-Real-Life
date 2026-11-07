#!/usr/bin/env node
// Builds public/data/airports-us.json: every US towered airport with its D/G/T/A positions and tower hours.
//
// Remote (default, used in CI): downloads the current FAA NASR 28-day cycle (falls back to the previous one)
//   node scripts/build-airports.mjs
// Local CSVs (offline / testing): a directory holding ATC_BASE.csv, ATC_ATIS.csv, FRQ.csv, APT_BASE.csv
//   node scripts/build-airports.mjs --nasr-dir <dir>
//
// Non-zero exit on failure so CI can keep the committed copy.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import tzlookup from '@photostructure/tz-lookup';
import { buildAirports, cycleToken, nasrCycles, parseCsv } from './nasr-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'airports-us.json');
const NEEDED = { ATC: ['ATC_BASE.csv', 'ATC_ATIS.csv'], FRQ: ['FRQ.csv'], APT: ['APT_BASE.csv'] };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** NASR CSVs are Latin-1. */
const decode = (u8) => strFromU8(u8, true);

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'vatsim-radar-for-real-life-build' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadRemote() {
  let lastErr;
  for (const cycle of nasrCycles()) {
    const token = cycleToken(cycle);
    try {
      const files = {};
      for (const [group, names] of Object.entries(NEEDED)) {
        const zip = unzipSync(
          await download(`https://nfdc.faa.gov/webContent/28DaySub/extra/${token}_${group}_CSV.zip`),
          {
            filter: (f) => names.includes(f.name.split('/').pop()),
          },
        );
        for (const [path, data] of Object.entries(zip)) files[path.split('/').pop()] = decode(data);
      }
      return { cycle: cycle.toISOString().slice(0, 10), files };
    } catch (err) {
      lastErr = err;
      console.warn(`NASR cycle ${token} unavailable: ${err.message}`);
    }
  }
  throw lastErr;
}

async function loadLocal(dir) {
  const files = {};
  for (const name of Object.values(NEEDED).flat()) files[name] = await readFile(join(dir, name), 'latin1');
  const eff = /"(\d{4})\/(\d{2})\/(\d{2})"/.exec(files['ATC_BASE.csv']);
  return { cycle: eff ? `${eff[1]}-${eff[2]}-${eff[3]}` : 'local', files };
}

const dir = arg('--nasr-dir');
const { cycle, files } = dir ? await loadLocal(dir) : await loadRemote();
for (const name of Object.values(NEEDED).flat()) if (!files[name]) throw new Error(`missing ${name}`);

const airports = buildAirports({
  atcBase: parseCsv(files['ATC_BASE.csv']),
  atcAtis: parseCsv(files['ATC_ATIS.csv']),
  frq: parseCsv(files['FRQ.csv']),
  aptBase: parseCsv(files['APT_BASE.csv']),
  tzLookup: tzlookup,
});
if (airports.length < 500)
  throw new Error(`only ${airports.length} towered airports parsed — refusing to overwrite`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({
    source: 'FAA NASR 28-day subscription',
    cycle,
    builtAt: new Date().toISOString(),
    airports,
  }),
);
const byKind = airports.reduce((m, a) => ((m[a.hrs.k] = (m[a.hrs.k] ?? 0) + 1), m), {});
console.log(`NASR ${cycle}: ${airports.length} US towered airports`, byKind);
