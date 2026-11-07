# rwr-proxy — traffic relay

GitHub Pages can't call the ADS-B APIs directly: they don't send CORS headers (tested 2026-11-06, see `CLAUDE.md` §4).
This Cloudflare Worker forwards a fixed set of routes and adds CORS for this site only.

| Route                                                       | Upstream                                                          | Edge cache                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| `GET /v2/point/{lat}/{lon}/{nm}`                            | adsb.lol → airplanes.live → adsb.fi (failover on 4xx/5xx/timeout) | 4 s, snapped to 0.1° / 25 nm |
| `GET /v2/hex/{hex}` · `/v2/callsign/{cs}` · `/v2/reg/{reg}` | same failover                                                     | 5 s                          |
| `POST /routeset`                                            | adsb.lol `/api/0/routeset`                                        | —                            |
| `GET /metar?ids=KTYS,KCLT`                                  | aviationweather.gov                                               | 120 s                        |
| `GET /health`                                               | —                                                                 | —                            |

Only `Origin`s in `ALLOWED_ORIGINS` (`wrangler.toml`) get an answer; everything else is 403/404.

## Cost

Cloudflare Workers free plan: 100,000 requests/day. One open tab polls every 5 s ≈ 17,280/day.

## Deploy

Automatic on push to `main` when `proxy/**` changes, via `.github/workflows/proxy.yml`, once these repo secrets exist:

| Secret                  | Where                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | dash.cloudflare.com → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers & Pages → Account ID (right sidebar)                                  |

Manual alternative: `cd proxy && npx wrangler@4 login && npx wrangler@4 deploy`.

The deployed URL (`https://rwr-proxy.<subdomain>.workers.dev`) goes in `src/config.ts` → `PROXY_URL`.
