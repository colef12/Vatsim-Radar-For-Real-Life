# Credits & Attribution

This project is non-commercial. It must stay that way: see the licenses below.

## Design & code adapted from VATSIM Radar

- Source: https://github.com/VATSIM-Radar/vatsim-radar (reference commit `41130e1`, 2026-11-04)
- © VATSIM Radar contributors
- License: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
- **Changes made:** adapted to plain Vite + Vue (no Nuxt/Nitro backend), data source replaced with real-world ADS-B feeds, VATSIM-specific features removed.

| Adapted item                     | Upstream file                                                                               | Our file                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Colour palette                   | `app/utils/colors.ts`                                                                       | `src/styles/_colors.scss`                                         |
| Theme variables & breakpoints    | `app/scss/variables.scss`                                                                   | `src/styles/_variables.scss`                                      |
| D/G/T/A badge colours and layout | `public/icons/atc/{D,G,T,A}.png`, `app/composables/render/airports/layers/airport-style.ts` | `src/map/layers/airports.ts` (redrawn on canvas, colours sampled) |
| TRACON label on top-left vertex  | airport/approach rendering                                                                  | `src/map/layers/boundaries.ts` `labelPoint()`                     |

_Add a row every time something else is ported (icons, components, logic)._

## Map

- Basemap: [OpenFreeMap](https://openfreemap.org/) — © [OpenMapTiles](https://www.openmaptiles.org/), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Vector style rendering: [ol-mapbox-style](https://github.com/openlayers/ol-mapbox-style) (BSD-2-Clause)
- Map library: [OpenLayers](https://openlayers.org/) (BSD-2-Clause)

## Airspace boundaries

Built by `scripts/build-boundaries.mjs` into `public/data/` (coordinates rounded to 4 dp, TWR/CTR and duplicate variant polygons removed). Modified data stays under CC BY-SA 4.0.

- TRACON / approach areas: [SimAware TRACON Project](https://github.com/vatsimnetwork/simaware-tracon-project) — VATSIM community, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- ARTCC / FIR areas: [VATSpy Data Project](https://github.com/vatsimnetwork/vatspy-data-project) — VATSIM community, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

These are community depictions drawn for VATSIM, not FAA/ICAO source data. Vertical limits are not included.

## US towered airports

- Airport positions, tower frequencies (D/G/T/A) and tower hours: [FAA NASR 28-Day Subscription](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/) (`ATC_BASE`, `ATC_ATIS`, `FRQ`, `APT_BASE` CSVs). US Government work, public domain. Built by `scripts/build-airports.mjs`.
- Time zones: [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup) (CC0), build time only.

## Fonts

- Libre Franklin — SIL Open Font License 1.1 (via Google Fonts)
- Roboto Mono — Apache License 2.0 (via Google Fonts)
- Jura — SIL Open Font License 1.1 (via Google Fonts), badge letters

## Live traffic

Fetched through our Cloudflare Worker relay (`proxy/`); the active provider is credited on the map ("Traffic: …").

- [adsb.lol](https://adsb.lol): primary. Open data, ODbL.
- [airplanes.live](https://airplanes.live): fallback. Non-commercial use.
- [adsb.fi](https://adsb.fi): fallback. Personal, non-commercial use; attribution + link required.
- Routes (dep/arr) and airline names: [adsbdb.com](https://www.adsbdb.com), community-sourced, may be wrong.
- METAR (relay route ready, UI pending): [aviationweather.gov](https://aviationweather.gov) (NOAA, public domain).
