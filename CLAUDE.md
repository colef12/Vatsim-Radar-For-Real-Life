# CLAUDE.md — Vatsim-Radar-For-Real-Life

Working instructions for Claude on this repo. Read fully before every task.

## 1. Mission

Recreate the look and core functionality of vatsim-radar.com, fed by **real-world ADS-B traffic** instead of VATSIM, hosted free on **GitHub Pages**.

- Owner: Cole (`colef12`). Airline pilot, so aviation terms need no explaining. Be numerical and direct.
- Repo: `colef12/Vatsim-Radar-For-Real-Life`
- Live URL (once Pages is on): `https://colef12.github.io/Vatsim-Radar-For-Real-Life/`

## 2. Hard constraints (non-negotiable)

| # | Constraint | Consequence |
|---|---|---|
| C1 | GitHub Pages is **static hosting only** | No server, no DB, no secrets at runtime. All live data is fetched **from the browser**. |
| C2 | No secrets in the client bundle | Anything shipped to Pages is public. Never put an API key, OAuth secret or token in source, `.env`, or Actions output that reaches `dist/`. |
| C3 | Upstream vatsim-radar is **CC BY-NC 4.0** | Design/code may be adapted **only** with attribution, link to the license, a note of changes, and **non-commercial** use. Keep `CREDITS.md` current. No donations/ads/paywall on this site. |
| C4 | ADS-B data providers are **non-commercial, rate-limited** | Respect each provider's limit (Section 4). Attribute every active source in the UI footer. |
| C5 | `vite.config.ts` `base` must equal `/Vatsim-Radar-For-Real-Life/` | Wrong base = blank page on Pages. Case-sensitive. |
| C6 | Not for operational use | Footer + About: "Not for navigation or ATC. Data is crowd-sourced and may be incomplete or delayed." |

## 3. Stack (decided — change only with Cole's OK)

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict) | Static output, fast, trivial Pages deploy |
| UI | Vue 3 (Composition API, `<script setup>`) + Pinia | Same framework family as vatsim-radar (Vue/Nuxt) so its patterns translate directly |
| Map | OpenLayers (`ol`) | Same map lib as vatsim-radar; WebGL point layer scales to 10k+ aircraft |
| Styles | SCSS with CSS variables | vatsim-radar's dark theme is variable-driven |
| Tests | Vitest (unit) | Data normalisers and geo math must be tested |
| Lint | ESLint + Prettier | CI gate |
| Deploy | GitHub Actions → `actions/deploy-pages` | Pages source = "GitHub Actions", not a `gh-pages` branch |
| Node | 22 LTS, pinned in `.nvmrc` and `engines` | |

No Nuxt: SSR/Nitro features are useless on Pages and add config surface.

## 4. Data sources

Browser CORS tested from the live origin `https://colef12.github.io` on 2026-11-06 (built-in browser, `fetch()` from the page).

| Purpose | Source | Endpoint pattern | Limit | Browser CORS |
|---|---|---|---|---|
| Live traffic (primary) | adsb.lol | `https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}` | Dynamic; no key today, key announced for future | **FAIL** (no ACAO header) |
| Live traffic (fallback) | airplanes.live | `https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}` (≤250 nm) | 1 req/s, non-commercial | **FAIL** |
| Live traffic (fallback 2) | adsb.fi | `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}` | 1 req/s, non-commercial, attribution + link required | **FAIL** |
| Live traffic | ADSB One | `https://api.adsb.one/v2/point/...` | 1 req/s; repo archived Apr 2026 | **FAIL** |
| Live traffic (avoid) | OpenSky | `/api/states/all` | 400 credits/day anon; auth = OAuth2 secret → violates C2 | **FAIL** |
| Routes (dep/arr) | adsb.lol routeset | `POST /api/0/routeset` | Same as adsb.lol | **FAIL** (preflight) |
| US towered airports (D/G/T/A + tower hours) | FAA NASR 28-day CSV (`nfdc.faa.gov/webContent/28DaySub/extra/{DD_Mon_YYYY}_{ATC,FRQ,APT}_CSV.zip`) | Build-time → `public/data/airports-us.json` (35 kB gz, 718 airports). **Not reachable from Claude's sandbox**, reachable from GitHub Actions | Public domain (US Gov) | N/A (build time) — **LIVE** |
| TRACON boundaries | SimAware TRACON Project (`vatsimnetwork/simaware-tracon-project`, latest release asset `TRACONBoundaries.geojson`) | Build-time → `public/data/tracons.geojson` (302 kB gz) | CC BY-SA 4.0 (attribute; derived data stays BY-SA) | N/A (build time) — **LIVE** |
| FIR/ARTCC boundaries | VATSpy Data Project (`vatsimnetwork/vatspy-data-project`, `Boundaries.geojson` @ master) | Build-time → `public/data/firs.geojson` (239 kB gz) | CC BY-SA 4.0 (attribute; derived data stays BY-SA) | N/A (build time) — **LIVE** |
| Weather (METAR/TAF) | aviationweather.gov Data API | `/api/data/metar?ids=...&format=json` | — | **FAIL** |
| Aircraft photos | planespotters.net public API | `https://api.planespotters.net/pub/photos/hex/{hex}` | Photographer credit + link mandatory | **PASS** |
| Basemap | OpenFreeMap `dark` vector style | `https://tiles.openfreemap.org/styles/dark` via `ol-mapbox-style` | No key, no limit; © OpenMapTiles © OSM | **PASS** |
| Basemap (dropped) | CARTO Dark Matter | raster XYZ | **Now requires API key** — tiles show watermark | FAIL |

**Consequence:** every live-traffic and weather source goes through our Cloudflare Worker relay in `/proxy` (Cole approved 2026-11-06). Routes: `/v2/point|hex|callsign|reg`, `POST /routeset`, `/metar`, `/health`. Failover adsb.lol → airplanes.live → adsb.fi, point queries snapped 0.1°/25 nm and edge-cached 4 s, origin-locked to the Pages site + localhost. Deployed by `.github/workflows/proxy.yml` (needs repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Worker URL `https://rwr-proxy.coleferraro.workers.dev` lives in `src/config.ts` `PROXY_URL`; empty = traffic off.

Rules:
- All v2 providers share the ADSBExchange v2 schema → **one normaliser** (`src/data/aircraft.ts`) mapping to the internal `Aircraft` type. Provider-specific URLs live only in `proxy/src/index.ts` `PROVIDERS`.
- Poll **viewport-driven**: centre + radius from current map extent, capped at 250 nm. Default interval 5 s, never < 2 s. Pause when tab hidden (`document.visibilityState`).
- Provider failover happens in the relay. The client backs off on relay errors (5→10→20→60 s) and shows a source/status pill in the header.
- If CORS blocks a provider: **stop and report to Cole**. Fix is a Cloudflare Worker proxy (free tier) in `/proxy`, deployed separately. Do not use public CORS proxies.
- Never fetch from a GitHub Actions cron to "fake live" data — Actions cron minimum ~5 min and it burns Action minutes.

## 5. Feature map (VATSIM → real world)

| vatsim-radar feature | Real-world equivalent | Phase |
|---|---|---|
| Aircraft icons by type, rotated by heading | `t` (ICAO type) → VATSIM Radar icon (alias table + emitter-category fallback); `track` → rotation; ground traffic hidden below ≈ zoom 9; callsigns from ≈ zoom 7.4 | **Built** (live once relay deployed) |
| Hover label / click card (callsign, type, alt, GS, route) | Hover card + click card (`src/components/AircraftCard.vue`), route via relay `POST /routeset` | **Built** (live once relay deployed) |
| Flight track trail | Client-side ring buffer of last N positions per hex (no history API) | 2 |
| Airport D/G/T/A badges | **US only** (Cole, 2026-11-06). Badges = positions the tower *has* per FAA FRQ (D `CD`, G `GND`, T `LCL`, A `ATIS`/`D-ATIS`; tower's own freqs only). Dimmed when the published `TWR_HRS` say closed; seasonal/NOTAM/SR-SS hours = "Hours vary", shown normal. Evaluated client-side every 60 s with the airport's IANA zone. A = **ATIS**, as in VATSIM Radar (approach is the TRACON polygon) | **Done** |
| Airports with traffic counts | Count of aircraft within X nm below Y ft (needs live traffic) | 2 |
| ATC controllers / sector fills | **No public real-world equivalent.** All TRACON + ARTCC/FIR outlines drawn **always**, one neutral style each, never imply staffing (Cole, 2026-11-06). Built weekly by `scripts/build-boundaries.mjs`; TWR/CTR variants and duplicate DEP/APP variants dropped; one label per facility (largest piece) | **Done** (pulled forward from 3) |
| METAR on airport click | aviationweather.gov | 3 |
| Search (callsign/reg/hex/airport) | Local filter over current set + `/v2/callsign/`, `/v2/reg/`, `/v2/hex/` | 2 |
| Filters (altitude, type, airline, ground/air) | Client-side | 2 |
| Settings persisted | `localStorage`, wrapped in try/catch | 2 |
| Emergency squawks highlight | 7500/7600/7700 → colour + list | 2 |

## 6. Repo layout (target)

```
.github/workflows/deploy.yml   # build + test + deploy to Pages
.github/workflows/ci.yml       # PR checks: lint, typecheck, test, build
public/data/                   # build-time static datasets (airports, boundaries)
scripts/                       # dataset build scripts (node, run in CI)
src/
  data/                        # types, normaliser, providers, poller
  map/                         # OL map, layers, styles, icons
  components/                  # Vue UI (panels, cards, search)
  stores/                      # Pinia
  styles/                      # SCSS vars mirrored from vatsim-radar theme
CLAUDE.md  CREDITS.md  LICENSE  README.md
```

## 7. How I (Claude) work on this repo

1. **Branch + PR, then always publish live.** Never commit to `main` directly. Branch `feat/<thing>` / `fix/<thing>`, open a PR, and **as soon as CI passes, Claude squash-merges it**. That deploys it to Pages. Don't wait for Cole (his instruction, 2026-11-06). Then open the live site in the built-in browser and confirm the change. Small focused commits.
   - **Rollback:** `git revert <squash-sha>` on a `fix/revert-…` branch → PR → merge, which redeploys the previous state. For an instant rollback without a commit: Actions → "Deploy to GitHub Pages" → re-run the last good run.
   - Still stop and ask before merging anything irreversible or outside this repo (Cloudflare deploys, secrets, repo settings).
2. **When Cole will apply a change himself,** give exact minimal edits (file, line context, old → new). No full-file rewrites unless asked.
3. **Every PR description** ends with a verdict table:

   | Check | Result |
   |---|---|
   | `npm run lint` | PASS/FAIL |
   | `npm run typecheck` | PASS/FAIL |
   | `npm test` | PASS/FAIL (n tests) |
   | `npm run build` | PASS/FAIL (bundle size kB gz) |
   | Pages base path correct | PASS/FAIL |
   | No secrets in diff | PASS/FAIL |
   | Attribution updated (if new source/asset) | PASS/FAIL/N/A |

4. **Verify, don't assume.** Provider limits, CORS, and endpoint shapes change; check before building on them and update Section 4.
5. **Performance budget:** 5,000 aircraft rendered at ≥ 50 fps on a mid laptop; initial JS ≤ 300 kB gz; first map paint ≤ 2 s on cable.
6. **Units:** altitude ft, speed kt, distance nm, vertical rate fpm, times Zulu. Display FL above 18,000 ft (US transition) as `FL350`.
7. **Upstream assets:** see Section 9. Never hotlink vatsim-radar infrastructure (`r2.vatsim-radar.com`, their `/tiles.json`, their API) — copy what the license allows into this repo, host it ourselves.
8. Keep this file current: when a decision changes, edit the relevant table in the same PR.

## 8. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| 0 Setup | Vite/Vue/TS/OL scaffold, CI, Pages deploy, blank dark map live; CORS check on all Section 4 sources | Live URL loads map; Section 4 statuses filled |
| 1 Live traffic | Poller + normaliser + WebGL aircraft layer + click card | Aircraft move live over KATL/KTYS area |
| 2 Parity core | Trails, search, filters, airports, emergency squawks, settings | Feature table rows marked phase 2 all PASS |
| 3 Context layers | Boundaries, METAR, photos, routes | |
| 4 Polish | Mobile layout, keyboard shortcuts, perf tuning, About/credits | |

## 9. Upstream reference — `VATSIM-Radar/vatsim-radar`

- URL: https://github.com/VATSIM-Radar/vatsim-radar (default branch `next`)
- Reference snapshot: commit `41130e1` (2026-11-04). Local read-only copy for lookups: `git clone --depth 1 --filter=blob:none --no-checkout` into a scratch dir **outside** this repo, then `git checkout HEAD -- <path>` for only the files needed.
- License: **CC BY-NC 4.0** (whole repo, no per-asset exceptions found in README). Their own stack: Nuxt 4, Vue 3.5, OpenLayers 10.11, TS, Yarn 4, Nitro/Prisma/MariaDB backend.
- Their agent notes worth honouring: `AGENTS.md`, `docs/ai/structure.md` (architecture map), `docs/ai/decisions.md` (invariants). Read the relevant section before porting a subsystem.

### Where to look upstream → where it lands here

| Concern | Upstream path | Our path | Port rule |
|---|---|---|---|
| Theme colours | `app/utils/colors.ts`, `app/scss/variables.scss`, `app/scss/colors` (generated) | `src/styles/_colors.scss`, `_variables.scss` | Copy values, attribute. Keys: bg `#131316`/`#18181B`/`#202024`, primary `#5987FF`, font LibreFranklin / RobotoMono / Jura |
| Breakpoints | `variables.scss` mixins `mobile` ≤1365, `mobileOnly` ≤699, `pc` ≥1466 | same mixins | Copy |
| Fonts | `app/assets/fonts/{libre-franklin,roboto-mono,jura}` | `src/assets/fonts` | Libre Franklin + Jura = OFL, Roboto Mono = Apache-2.0 (verify on Google Fonts when adding); load from Google Fonts or self-host the woff2 subset only |
| Aircraft icons | `app/assets/icons/aircraft/*.svg` (293 files, keyed by lowercase ICAO type) | `src/assets/icons/aircraft/` | **Direct fit:** ADS-B `t` field is the ICAO type, same key. Copy with attribution |
| Type → icon + size map | `app/utils/icons.ts` (`aircraftIcons`, `getAircraftIcon()` alias switch) | `src/map/aircraftIcons.ts` | Port; swap input from VATSIM `flight_plan.aircraft_short` to ADS-B `t`; add fallback by ADS-B `category` (A1–A7, B*) when `t` missing |
| Map bootstrap | `app/components/views/ViewMap.vue` | `src/map/MapView.vue` | Port structure, drop Navigraph/auth/SSR bits |
| Feature rendering | `app/composables/render/*` | `src/map/layers/*` | Port pattern; use WebGL points for aircraft |
| Basemap | `app/components/map/layers/MapLayer.vue` — self-hosted **Protomaps** vector tiles + `r2.vatsim-radar.com` raster | `src/map/basemap.ts` | Use Protomaps public PMTiles/API (domain-locked key is acceptable client-side) or OpenFreeMap (current). **Not** their R2 bucket; CARTO now needs a key |
| Map controls / overlays | `app/components/map/*` (`MapControls`, `MapScale`, `MapDistance`, `MapHtmlOverlay`) | `src/components/map/*` | Port UI, attribute |
| UI kit | `app/components/ui/*` | `src/components/ui/*` | Port only components we use |
| Stores | `app/store/{index,map,settings}.ts` | `src/stores/*` | Port shape; remove server/user state |

Not portable (server-dependent or VATSIM-only): Navigraph layers, bookings, events, stats, achievements, user auth, sector/ATC staffing logic, Nitro API routes.
