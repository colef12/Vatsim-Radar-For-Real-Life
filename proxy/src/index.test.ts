import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, normaliseV2, snapPoint, type Env } from './index';

const env: Env = { ALLOWED_ORIGINS: 'https://colef12.github.io,http://localhost:5173' };
const ctx = { waitUntil: () => {} };
const ORIGIN = 'https://colef12.github.io';
const req = (path: string, init: RequestInit & { origin?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  return new Request(`https://rwr-proxy.example.workers.dev${path}`, { ...init, headers });
};
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('snapPoint', () => {
  it('snaps to 0.1° and 25 nm buckets with slack, capped at 250', () => {
    expect(snapPoint(35.8123, -83.9941, 42)).toEqual({ lat: 35.8, lon: -84, nm: 50 });
    expect(snapPoint(35.8, -84, 20)).toEqual({ lat: 35.8, lon: -84, nm: 25 });
    expect(snapPoint(35.8, -84, 600)).toEqual({ lat: 35.8, lon: -84, nm: 250 });
  });
});

describe('normaliseV2', () => {
  it('maps adsb.fi `aircraft` to `ac` and tags the source', () => {
    const out = normaliseV2({ aircraft: [{ hex: 'a1b2c3' }], now: 1 }, 'adsbfi');
    expect(out).toMatchObject({ ac: [{ hex: 'a1b2c3' }], total: 1, now: 1, src: 'adsbfi' });
    expect(out).not.toHaveProperty('aircraft');
  });
});

describe('origin lock', () => {
  it('rejects unknown and missing origins', async () => {
    expect((await handle(req('/health', { origin: 'https://evil.example' }), env, ctx)).status).toBe(403);
    expect((await handle(req('/health', { origin: null }), env, ctx)).status).toBe(403);
  });
  it('answers preflight and health for allowed origins with CORS headers', async () => {
    const pre = await handle(req('/v2/point/35/-84/50', { method: 'OPTIONS' }), env, ctx);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const h = await handle(req('/health', { origin: 'http://localhost:5173' }), env, ctx);
    expect(await h.json()).toEqual({ ok: true });
  });
});

describe('/v2/point', () => {
  it('uses the snapped URL on the primary provider', async () => {
    const fetchMock = vi.fn(async () => ok({ ac: [{ hex: 'abc123' }], now: 5 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handle(req('/v2/point/35.8123/-83.9941/42'), env, ctx);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.adsb.lol/v2/point/35.8/-84/50');
    expect(res.headers.get('X-Source')).toBe('adsblol');
    expect(await res.json()).toMatchObject({ ac: [{ hex: 'abc123' }], src: 'adsblol' });
  });

  it('fails over on 429 and on network errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(ok({ aircraft: [{ hex: 'fff000' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handle(req('/v2/point/35/-84/50'), env, ctx);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('opendata.adsb.fi/api/v2/lat/35/lon/-84/dist/75');
    expect(await res.json()).toMatchObject({ ac: [{ hex: 'fff000' }], src: 'adsbfi' });
  });

  it('502 when all providers fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 503 })),
    );
    const res = await handle(req('/v2/point/35/-84/50'), env, ctx);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ detail: 'adsblol:503 airplaneslive:503 adsbfi:503' });
  });

  it('400 on nonsense coordinates', async () => {
    expect((await handle(req('/v2/point/95/-84/50'), env, ctx)).status).toBe(400);
    expect((await handle(req('/v2/point/abc/-84/50'), env, ctx)).status).toBe(400);
  });
});

describe('lookups, routeset, metar', () => {
  it('validates and normalises hex / callsign / reg', async () => {
    const fetchMock = vi.fn(async () => ok({ ac: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await handle(req('/v2/hex/A1B2C3'), env, ctx)).status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.adsb.lol/v2/hex/a1b2c3');
    expect((await handle(req('/v2/callsign/dal1128'), env, ctx)).status).toBe(200);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.adsb.lol/v2/callsign/DAL1128');
    expect((await handle(req('/v2/hex/zzz'), env, ctx)).status).toBe(400);
    expect((await handle(req('/v2/reg/N1;DROP'), env, ctx)).status).toBe(400);
  });

  it('forwards only valid planes to routeset', async () => {
    const fetchMock = vi.fn(async () => ok([{ callsign: 'DAL1128', _airport_codes_iata: 'SLC-ATL' }]));
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({
      planes: [
        { callsign: 'DAL1128', lat: 40.7, lng: -111.9 },
        { callsign: 'bad callsign!', lat: 1, lng: 1 },
      ],
    });
    const res = await handle(
      req('/routeset', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toEqual({ planes: [{ callsign: 'DAL1128', lat: 40.7, lng: -111.9 }] });
  });

  it('metar validates ids', async () => {
    const fetchMock = vi.fn(async () => ok([{ icaoId: 'KTYS', rawOb: 'KTYS 070253Z 00000KT 10SM CLR' }]));
    vi.stubGlobal('fetch', fetchMock);
    expect((await handle(req('/metar?ids=KTYS,KCLT'), env, ctx)).status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://aviationweather.gov/api/data/metar?ids=KTYS,KCLT&format=json',
    );
    expect((await handle(req('/metar?ids=KTYS;rm'), env, ctx)).status).toBe(400);
  });

  it('404 for anything else', async () => {
    expect((await handle(req('/v2/mil'), env, ctx)).status).toBe(404);
    expect((await handle(req('/https://example.com'), env, ctx)).status).toBe(404);
  });
});
