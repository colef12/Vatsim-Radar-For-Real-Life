import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { distanceNm, queryForViewport, TrafficPoller, type PollerStatus } from './poller';

describe('geo', () => {
  it('distanceNm: 1° of latitude ≈ 60 nm; KCLT→KATL ≈ 196 nm', () => {
    expect(distanceNm(35, -84, 36, -84)).toBeCloseTo(60, 0);
    expect(distanceNm(35.214, -80.943, 33.637, -84.428)).toBeCloseTo(196, -1);
  });

  it('queryForViewport covers the farthest corner and clamps 10–250', () => {
    const q = queryForViewport(
      [-84, 35.8],
      [
        [-85, 36.3],
        [-83, 36.3],
        [-85, 35.3],
        [-83, 35.3],
      ],
    );
    expect(q.lat).toBe(35.8);
    expect(q.nm).toBeGreaterThan(50);
    expect(q.nm).toBeLessThan(60);
    expect(queryForViewport([-84, 35.8], [[-60, 50]]).nm).toBe(250);
    expect(queryForViewport([-84, 35.8], [[-84.001, 35.8]]).nm).toBe(10);
  });
});

describe('TrafficPoller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ok = (ac: unknown[]) => new Response(JSON.stringify({ ac, src: 'adsblol', now: 1 }), { status: 200 });

  it('is disabled without a relay URL', () => {
    const statuses: PollerStatus[] = [];
    new TrafficPoller(
      '',
      5000,
      () => {},
      (s) => statuses.push(s),
    ).start();
    expect(statuses).toEqual([{ state: 'disabled' }]);
  });

  it('polls the relay for the viewport, then on the interval', async () => {
    const fetchImpl = vi.fn(async () => ok([{ hex: 'abc123', lat: 35, lon: -84 }]));
    const onData = vi.fn();
    const p = new TrafficPoller(
      'https://relay.example/',
      5000,
      onData,
      () => {},
      fetchImpl as unknown as typeof fetch,
    );
    p.start();
    p.setViewport({ lat: 35.8, lon: -84, nm: 60 });
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://relay.example/v2/point/35.8/-84/60',
    );
    expect(onData.mock.calls[0]?.[0].aircraft).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it('backs off 5 → 10 → 20 s on errors and reports it', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 502 }));
    const statuses: PollerStatus[] = [];
    const p = new TrafficPoller(
      'https://relay.example',
      5000,
      () => {},
      (s) => statuses.push(s),
      fetchImpl as unknown as typeof fetch,
    );
    p.start();
    p.setViewport({ lat: 35, lon: -84, nm: 60 });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(10000);
    const errs = statuses.filter((s) => s.state === 'error') as { retryInMs: number }[];
    expect(errs.map((e) => e.retryInMs)).toEqual([5000, 10000, 20000]);
    p.stop();
  });

  it('refetches quickly after a big pan, not after a tiny one', async () => {
    const fetchImpl = vi.fn(async () => ok([]));
    const p = new TrafficPoller(
      'https://relay.example',
      5000,
      () => {},
      () => {},
      fetchImpl as unknown as typeof fetch,
    );
    p.start();
    p.setViewport({ lat: 35, lon: -84, nm: 60 });
    await vi.advanceTimersByTimeAsync(10);
    p.setViewport({ lat: 35.05, lon: -84, nm: 60 }); // 3 nm
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    p.setViewport({ lat: 36, lon: -84, nm: 60 }); // 60 nm
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    p.stop();
  });
});
