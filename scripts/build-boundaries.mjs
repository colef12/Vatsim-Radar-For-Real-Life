#!/usr/bin/env node
// Builds public/data/tracons.geojson and public/data/firs.geojson.
//
// Remote (default, used in CI):
//   node scripts/build-boundaries.mjs
// Local checkouts (offline / testing):
//   node scripts/build-boundaries.mjs --tracon-dir <simaware-tracon-project> --vatspy-dir <vatspy-data-project>
//
// Exit code is non-zero on any failure, so CI can fall back to the committed copy.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { processFirs, processTracons } from './boundaries-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');

const TRACON_RELEASE_API =
  'https://api.github.com/repos/vatsimnetwork/simaware-tracon-project/releases/latest';
const VATSPY_COMMITS_API = 'https://api.github.com/repos/vatsimnetwork/vatspy-data-project/commits/master';
const VATSPY_RAW = (ref) =>
  `https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/${ref}/Boundaries.geojson`;

/** Short commit hash of a local checkout, so meta never records a filesystem path. */
function localVersion(dir) {
  try {
    return `git:${execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}`;
  } catch {
    return 'local';
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function getJson(url) {
  const headers = { 'User-Agent': 'vatsim-radar-for-real-life-build', Accept: 'application/json' };
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com')) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function walkJson(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJson(p)));
    else if (entry.name.toLowerCase().endsWith('.json')) out.push(p);
  }
  return out;
}

async function loadTracons() {
  const dir = arg('--tracon-dir');
  if (dir) {
    // Same as upstream scripts/bin/compile.ts: concatenate every Boundaries/**/*.json feature.
    const files = (await walkJson(join(dir, 'Boundaries'))).sort();
    const features = await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, 'utf8'))));
    return { version: localVersion(dir), data: { type: 'FeatureCollection', features } };
  }
  const release = await getJson(TRACON_RELEASE_API);
  const asset = release.assets?.find((a) => a.name === 'TRACONBoundaries.geojson');
  if (!asset) throw new Error('TRACONBoundaries.geojson asset not found on latest SimAware release');
  return { version: release.tag_name ?? release.name, data: await getJson(asset.browser_download_url) };
}

async function loadFirs() {
  const dir = arg('--vatspy-dir');
  if (dir) {
    return {
      version: localVersion(dir),
      data: JSON.parse(await readFile(join(dir, 'Boundaries.geojson'), 'utf8')),
    };
  }
  const commit = await getJson(VATSPY_COMMITS_API);
  return { version: commit.sha.slice(0, 7), data: await getJson(VATSPY_RAW(commit.sha)) };
}

const [tracon, fir] = await Promise.all([loadTracons(), loadFirs()]);
const tracons = processTracons(tracon.data);
const firs = processFirs(fir.data);

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'tracons.geojson'), JSON.stringify(tracons));
await writeFile(join(OUT_DIR, 'firs.geojson'), JSON.stringify(firs));
await writeFile(
  join(OUT_DIR, 'boundaries-meta.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      tracon: {
        source: 'vatsimnetwork/simaware-tracon-project',
        version: tracon.version,
        features: tracons.features.length,
      },
      fir: {
        source: 'vatsimnetwork/vatspy-data-project',
        version: fir.version,
        features: firs.features.length,
      },
      license: 'CC BY-SA 4.0',
    },
    null,
    2,
  ) + '\n',
);

console.log(`TRACON ${tracon.version}: ${tracons.features.length} features`);
console.log(`FIR    ${fir.version}: ${firs.features.length} features`);
