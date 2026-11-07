/**
 * rwr-proxy — CORS relay for Vatsim-Radar-For-Real-Life (Cloudflare Worker, free tier).
 *
 * Only these routes are forwarded; everything else is 404. Only allow-listed browser origins get a response.
 *
 *   GET  /v2/point/{lat}/{lon}/{nm}       live traffic around a point (≤ 250 nm), provider failover
 *   GET  /v2/hex/{hex[,hex…]}             by ICAO 24-bit address
 *   GET  /v2/callsign/{callsign}          by callsign
 *   GET  /v2/reg/{registration}           by registration
 *   POST /routeset                        adsb.lol plausible routes  { planes: [{ callsign, lat, lng }] }
 *   GET  /metar?ids=KTYS,KCLT             aviationweather.gov METAR JSON
 *   GET  /health                          { ok: true }
 *
 * Traffic responses are normalised to ADSBExchange v2 (`ac` array) and carry `src` = provider id.
 * Point queries are snapped (0.1°, 25 nm buckets) and edge-cached for a few seconds so many viewers
 * looking at the same area cost one upstream call.
 */

export interface Env {
  /** Comma-separated list of allowed Origin values. */
  ALLOWED_ORIGINS: string;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

type ProviderId = 'adsblol' | 'airplaneslive' | 'adsbfi';

interface Provider {
  id: ProviderId;
  point: (lat: number, lon: number, nm: number) => string;
  hex: (hex: string) => string;
  callsign: (cs: string) => string;
  reg: (reg: string) => string;
}

/** Order = failover order. All speak ADSBExchange v2. */
export const PROVIDERS: Provider[] = [
  {
    id: 'adsblol',
    point: (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
    hex: (h) => `https://api.adsb.lol/v2/hex/${h}`,
    callsign: (c) => `https://api.adsb.lol/v2/callsign/${c}`,
    reg: (r) => `https://api.adsb.lol/v2/reg/${r}`,
  },
  {
    id: 'airplaneslive',
    point: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
    hex: (h) => `https://api.airplanes.live/v2/hex/${h}`,
    callsign: (c) => `https://api.airplanes.live/v2/callsign/${c}`,
    reg: (r) => `https://api.airplanes.live/v2/reg/${r}`,
  },
  {
    id: 'adsbfi',
    point: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
    hex: (h) => `https://opendata.adsb.fi/api/v2/hex/${h}`,
    callsign: (c) => `https://opendata.adsb.fi/api/v2/callsign/${c}`,
    reg: (r) => `https://opendata.adsb.fi/api/v2/registration/${r}`,
  },
];

const UPSTREAM_TIMEOUT_MS = 6_000;
const POINT_TTL_S = 4;
const LOOKUP_TTL_S = 5;
const METAR_TTL_S = 120;
const USER_AGENT =
  'vatsim-radar-for-real-life-proxy (+https://github.com/colef12/Vatsim-Radar-For-Real-Life)';

// ---------- helpers ----------

/** Snap a point query so nearby viewers share a cache entry; widen the radius to cover the snap. */
export function snapPoint(lat: number, lon: number, nm: number): { lat: number; lon: number; nm: number } {
  const sLat = Math.round(lat * 10) / 10;
  const sLon = Math.round(lon * 10) / 10;
  // 0.05° max snap offset ≈ 3 nm in latitude; bucket radius to 25 nm, +5 nm slack, cap at 250.
  const bucket = Math.min(250, Math.ceil((Math.max(1, nm) + 5) / 25) * 25);
  return { lat: sLat, lon: sLon, nm: bucket };
}

function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin), ...extra },
  });
}

async function fetchUpstream(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

/** adsb.fi answers with `aircraft`, the others with `ac`. */
export function normaliseV2(body: Record<string, unknown>, src: ProviderId): Record<string, unknown> {
  const ac = Array.isArray(body.ac) ? body.ac : Array.isArray(body.aircraft) ? body.aircraft : [];
  const { aircraft: _drop, ...rest } = body;
  void _drop;
  return { ...rest, ac, total: ac.length, now: typeof body.now === 'number' ? body.now : Date.now(), src };
}

/** Try providers in order until one answers 2xx with JSON. */
async function failover(
  build: (p: Provider) => string,
): Promise<{ body: Record<string, unknown>; src: ProviderId } | { error: string }> {
  const errors: string[] = [];
  for (const p of PROVIDERS) {
    try {
      const res = await fetchUpstream(build(p));
      if (!res.ok) {
        errors.push(`${p.id}:${res.status}`);
        continue;
      }
      const body = (await res.json()) as Record<string, unknown>;
      return { body: normaliseV2(body, p.id), src: p.id };
    } catch (err) {
      errors.push(`${p.id}:${err instanceof Error ? err.name : 'error'}`);
    }
  }
  return { error: errors.join(' ') };
}

function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

/** Serve from the edge cache, or compute, store and serve. Cache entries are origin-independent. */
async function cached(
  key: string,
  ttl: number,
  origin: string,
  ctx: Ctx,
  produce: () => Promise<{ body: unknown; status: number; headers?: Record<string, string> }>,
): Promise<Response> {
  const cache = edgeCache();
  const cacheKey = new Request(`https://rwr-proxy.cache/${key}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      return new Response(hit.body, {
        status: hit.status,
        headers: { ...Object.fromEntries(hit.headers), ...cors(origin), 'X-Cache': 'HIT' },
      });
    }
  }
  const { body, status, headers = {} } = await produce();
  const text = JSON.stringify(body);
  if (cache && status === 200) {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(text, {
          status,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}`, ...headers },
        }),
      ),
    );
  }
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin), ...headers, 'X-Cache': 'MISS' },
  });
}

// ---------- validation ----------

const HEX_RE = /^~?[0-9a-f]{6}(,~?[0-9a-f]{6}){0,49}$/i;
const CALLSIGN_RE = /^[A-Z0-9]{2,8}$/i;
const REG_RE = /^[A-Z0-9-]{2,10}$/i;
const ICAO_LIST_RE = /^[A-Z0-9]{3,4}(,[A-Z0-9]{3,4}){0,49}$/i;

// ---------- handler ----------

export async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const origin = allowedOrigin(req, env);
  if (!origin) return new Response('Forbidden', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, origin);

  // /v2/point/{lat}/{lon}/{nm}
  if (req.method === 'GET' && parts[0] === 'v2' && parts[1] === 'point' && parts.length === 5) {
    const [lat, lon, nm] = parts.slice(2).map(Number) as [number, number, number];
    if (![lat, lon, nm].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || nm <= 0) {
      return json({ error: 'bad point' }, 400, origin);
    }
    const s = snapPoint(lat, lon, nm);
    return cached(`point/${s.lat}/${s.lon}/${s.nm}`, POINT_TTL_S, origin, ctx, async () => {
      const r = await failover((p) => p.point(s.lat, s.lon, s.nm));
      return 'error' in r
        ? { body: { error: 'all providers failed', detail: r.error }, status: 502 }
        : { body: r.body, status: 200, headers: { 'X-Source': r.src } };
    });
  }

  // /v2/hex|callsign|reg/{q}
  if (
    req.method === 'GET' &&
    parts[0] === 'v2' &&
    parts.length === 3 &&
    ['hex', 'callsign', 'reg'].includes(parts[1]!)
  ) {
    const kind = parts[1] as 'hex' | 'callsign' | 'reg';
    const q = decodeURIComponent(parts[2]!);
    const ok = kind === 'hex' ? HEX_RE.test(q) : kind === 'callsign' ? CALLSIGN_RE.test(q) : REG_RE.test(q);
    if (!ok) return json({ error: `bad ${kind}` }, 400, origin);
    const norm = kind === 'hex' ? q.toLowerCase() : q.toUpperCase();
    return cached(`${kind}/${norm}`, LOOKUP_TTL_S, origin, ctx, async () => {
      const r = await failover((p) => p[kind](encodeURIComponent(norm)));
      return 'error' in r
        ? { body: { error: 'all providers failed', detail: r.error }, status: 502 }
        : { body: r.body, status: 200, headers: { 'X-Source': r.src } };
    });
  }

  // POST /routeset
  if (req.method === 'POST' && url.pathname === '/routeset') {
    let payload: { planes?: { callsign?: unknown; lat?: unknown; lng?: unknown }[] };
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'bad json' }, 400, origin);
    }
    const planes = (payload.planes ?? [])
      .filter(
        (p) =>
          typeof p.callsign === 'string' &&
          CALLSIGN_RE.test(p.callsign) &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng),
      )
      .slice(0, 100)
      .map((p) => ({ callsign: (p.callsign as string).toUpperCase(), lat: p.lat, lng: p.lng }));
    if (!planes.length) return json([], 200, origin);
    try {
      const res = await fetchUpstream('https://api.adsb.lol/api/0/routeset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planes }),
      });
      return json(res.ok ? await res.json() : { error: `adsblol:${res.status}` }, res.ok ? 200 : 502, origin);
    } catch (err) {
      return json({ error: err instanceof Error ? err.name : 'error' }, 502, origin);
    }
  }

  // GET /metar?ids=…
  if (req.method === 'GET' && url.pathname === '/metar') {
    const ids = (url.searchParams.get('ids') ?? '').toUpperCase();
    if (!ICAO_LIST_RE.test(ids)) return json({ error: 'bad ids' }, 400, origin);
    return cached(`metar/${ids}`, METAR_TTL_S, origin, ctx, async () => {
      try {
        const res = await fetchUpstream(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`);
        if (res.status === 204) return { body: [], status: 200 };
        return res.ok
          ? { body: await res.json(), status: 200 }
          : { body: { error: `awc:${res.status}` }, status: 502 };
      } catch (err) {
        return { body: { error: err instanceof Error ? err.name : 'error' }, status: 502 };
      }
    });
  }

  return json({ error: 'not found' }, 404, origin);
}

export default {
  fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx),
};
