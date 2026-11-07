import { describe, expect, it } from 'vitest';
import { parseAdsbdbRoute } from './traffic';

describe('parseAdsbdbRoute', () => {
  it('reads origin / destination / airline', () => {
    expect(
      parseAdsbdbRoute({
        response: {
          flightroute: {
            airline: { name: 'British Airways' },
            origin: { icao_code: 'KATL' },
            midpoint: null,
            destination: { icao_code: 'EGLL' },
          },
        },
      }),
    ).toEqual({ airports: ['KATL', 'EGLL'], airline: 'British Airways' });
  });

  it('includes a midpoint when present', () => {
    expect(
      parseAdsbdbRoute({
        response: {
          flightroute: {
            origin: { icao_code: 'KSLC' },
            midpoint: { icao_code: 'KDEN' },
            destination: { icao_code: 'KATL' },
          },
        },
      }).airports,
    ).toEqual(['KSLC', 'KDEN', 'KATL']);
  });

  it('unknown callsign', () => {
    expect(parseAdsbdbRoute({ response: 'unknown callsign' })).toEqual({ airports: null, airline: null });
  });
});
