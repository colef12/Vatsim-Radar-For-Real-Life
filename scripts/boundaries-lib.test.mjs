import { describe, expect, it } from 'vitest';
import {
  approxArea,
  processFirs,
  processTracons,
  roundRing,
  toRoundedMultiPolygon,
} from './boundaries-lib.mjs';

const square = (x, y, size) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
const poly = (ring) => ({ type: 'Polygon', coordinates: [ring] });
const feature = (properties, geometry) => ({ type: 'Feature', properties, geometry });

describe('roundRing', () => {
  it('rounds to 4 dp, drops rounding duplicates, keeps the ring closed', () => {
    const ring = [
      [-80.123456, 35.123456],
      [-80.12346, 35.12346],
      [-80.2, 35.2],
      [-80.3, 35.1],
      [-80.123456, 35.123456],
    ];
    expect(roundRing(ring)).toEqual([
      [-80.1235, 35.1235],
      [-80.2, 35.2],
      [-80.3, 35.1],
      [-80.1235, 35.1235],
    ]);
  });

  it('closes an open ring', () => {
    const out = roundRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(out[0]).toEqual(out[out.length - 1]);
  });
});

describe('toRoundedMultiPolygon', () => {
  it('wraps Polygon as MultiPolygon and drops degenerate rings', () => {
    const g = toRoundedMultiPolygon({
      type: 'Polygon',
      coordinates: [
        square(0, 0, 1),
        [
          [0.5, 0.5],
          [0.50001, 0.50001],
        ],
      ],
    });
    expect(g.type).toBe('MultiPolygon');
    expect(g.coordinates).toHaveLength(1);
    expect(g.coordinates[0]).toHaveLength(1);
  });

  it('measures area for ranking', () => {
    expect(approxArea(toRoundedMultiPolygon(poly(square(0, 0, 2))))).toBe(4);
  });
});

describe('processTracons', () => {
  const input = {
    type: 'FeatureCollection',
    features: [
      feature({ id: 'CLT', prefix: ['CLT'], name: 'Charlotte Approach' }, poly(square(-81, 35, 1))),
      feature(
        { id: 'CLT', prefix: ['CLT'], suffix: 'DEP', name: 'Charlotte Departure' },
        poly(square(-81, 35, 1)),
      ),
      feature(
        { id: 'EFKE_R', prefix: ['EFKE_R'], suffix: 'TWR', name: 'Kemi Tower' },
        poly(square(24, 65, 0.2)),
      ),
      feature(
        { id: 'ENBR', prefix: ['ENBR'], suffix: 'APP', name: 'Flesland Approach' },
        poly(square(5, 60, 1)),
      ),
      // A80-style multi-piece facility
      feature({ id: 'A80', prefix: ['ATL'], name: 'Atlanta Approach' }, poly(square(-85, 33, 2))),
      feature({ id: 'A80', prefix: ['AHN'], name: 'Atlanta Approach' }, poly(square(-83, 33, 0.5))),
      // nested FeatureCollection, as handled upstream
      {
        type: 'FeatureCollection',
        features: [
          feature({ id: 'SDF', prefix: ['SDF'], name: 'Louisville Approach' }, poly(square(-86, 38, 1))),
        ],
      },
    ],
  };
  const out = processTracons(input);
  const ids = out.features.map((f) => `${f.properties.id}:${f.properties.name}`);

  it('drops TWR/CTR variants and suffix variants of facilities that have a base polygon', () => {
    expect(ids).not.toContain('EFKE_R:Kemi Tower');
    expect(ids).not.toContain('CLT:Charlotte Departure');
    expect(ids).toContain('CLT:Charlotte Approach');
  });

  it('keeps APP-suffixed facilities that have no base polygon', () => {
    expect(ids).toContain('ENBR:Flesland Approach');
  });

  it('flattens nested FeatureCollections', () => {
    expect(ids).toContain('SDF:Louisville Approach');
  });

  it('marks exactly one primary (largest) piece per facility', () => {
    const a80 = out.features.filter((f) => f.properties.id === 'A80');
    expect(a80).toHaveLength(2);
    expect(a80.filter((f) => f.properties.primary)).toHaveLength(1);
    expect(a80.find((f) => f.properties.primary)?.properties.prefix).toEqual(['ATL']);
  });
});

describe('processFirs', () => {
  it('maps VATSpy string props to typed props', () => {
    const out = processFirs({
      type: 'FeatureCollection',
      features: [
        feature(
          {
            id: 'KZTL',
            oceanic: '0',
            label_lon: '-84.045833',
            label_lat: '34.30625',
            region: 'AMAS',
            division: 'VATUSA',
          },
          poly(square(-86, 32, 4)),
        ),
        feature(
          { id: 'KZNY-O', oceanic: '1', label_lon: '-65', label_lat: '38', region: 'AMAS' },
          poly(square(-70, 35, 5)),
        ),
      ],
    });
    expect(out.features[0]?.properties).toEqual({
      id: 'KZNY-O',
      oceanic: true,
      labelLat: 38,
      labelLon: -65,
      region: 'AMAS',
      primary: true,
    });
    expect(out.features[1]?.properties.labelLon).toBe(-84.0458);
  });
});
