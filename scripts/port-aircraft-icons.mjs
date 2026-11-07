#!/usr/bin/env node
// One-off/re-runnable port of VATSIM Radar's aircraft icon set (CC BY-NC 4.0, see CREDITS.md).
//   node scripts/port-aircraft-icons.mjs <path-to-vatsim-radar-checkout>
// Copies app/assets/icons/aircraft/*.svg -> public/icons/aircraft/ and extracts the size table and
// ICAO-type alias switch from app/utils/icons.ts into src/map/aircraftIcons.json.
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.argv[2];
if (!upstream) throw new Error('usage: port-aircraft-icons.mjs <vatsim-radar checkout>');

const src = await readFile(join(upstream, 'app/utils/icons.ts'), 'utf8');

// 1. Size table: `key: { icon: 'key', width: getAircraftSizeByCoef(0.19) }` (standardCoef 30, clamp 12–35 unless strict)
const STANDARD = 30;
const sizes = {};
for (const m of src.matchAll(
  /(\w+):\s*\{\s*icon:\s*'(\w+)',\s*width:\s*getAircraftSizeByCoef\(([\d.]+)(,\s*true)?\)/g,
)) {
  const raw = STANDARD * Number(m[3]);
  sizes[m[2]] = m[4] ? Math.round(raw) : Math.round(Math.min(35, Math.max(12, raw)));
}

// 2. Alias switch inside getAircraftIcon()
const fn = src.slice(src.indexOf('export function getAircraftIcon'));
const alias = {};
const prefix = {};
for (const m of fn.matchAll(/startsWith\('(\w+)'\)\)\s*return aircraftIcons\.(\w+)/g)) prefix[m[1]] = m[2];
let pending = [];
for (const line of fn.split('\n')) {
  const c = /case '([^']+)':/.exec(line);
  if (c) pending.push(c[1]);
  const r = /return aircraftIcons\.(\w+);/.exec(line);
  if (r && pending.length) {
    for (const t of pending) alias[t] = r[1];
    pending = [];
  }
  if (/return aircraftIcons\[faa\.toLowerCase\(\)/.test(line)) {
    for (const t of pending) alias[t] = t.toLowerCase();
    pending = [];
  }
  if (/default:/.test(line)) break;
}

const iconDir = join(upstream, 'app/assets/icons/aircraft');
const files = (await readdir(iconDir)).filter((f) => f.endsWith('.svg'));
await mkdir(join(ROOT, 'public/icons/aircraft'), { recursive: true });
for (const f of files) await copyFile(join(iconDir, f), join(ROOT, 'public/icons/aircraft', f));

const icons = files.map((f) => f.replace(/\.svg$/, '')).sort();
const missingSize = icons.filter((i) => !(i in sizes));
await writeFile(
  join(ROOT, 'src/map/aircraftIcons.json'),
  JSON.stringify(
    {
      source: 'VATSIM-Radar/vatsim-radar app/utils/icons.ts (CC BY-NC 4.0)',
      defaultIcon: 'a320',
      sizes,
      alias,
      prefix,
      icons,
    },
    null,
    0,
  ) + '\n',
);
console.log(
  `${icons.length} icons, ${Object.keys(sizes).length} sizes, ${Object.keys(alias).length} aliases, prefixes`,
  prefix,
  'missing size:',
  missingSize,
);
