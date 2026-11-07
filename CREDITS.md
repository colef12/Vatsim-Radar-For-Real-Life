# Credits & Attribution

This project is non-commercial. It must stay that way: see the licenses below.

## Design & code adapted from VATSIM Radar

- Source: https://github.com/VATSIM-Radar/vatsim-radar (reference commit `41130e1`, 2026-11-04)
- © VATSIM Radar contributors
- License: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
- **Changes made:** adapted to plain Vite + Vue (no Nuxt/Nitro backend), data source replaced with real-world ADS-B feeds, VATSIM-specific features removed.

| Adapted item                  | Upstream file             | Our file                     |
| ----------------------------- | ------------------------- | ---------------------------- |
| Colour palette                | `app/utils/colors.ts`     | `src/styles/_colors.scss`    |
| Theme variables & breakpoints | `app/scss/variables.scss` | `src/styles/_variables.scss` |

_Add a row every time something else is ported (icons, components, logic)._

## Map

- Basemap: [OpenFreeMap](https://openfreemap.org/) — © [OpenMapTiles](https://www.openmaptiles.org/), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Vector style rendering: [ol-mapbox-style](https://github.com/openlayers/ol-mapbox-style) (BSD-2-Clause)
- Map library: [OpenLayers](https://openlayers.org/) (BSD-2-Clause)

## Fonts

- Libre Franklin — SIL Open Font License 1.1 (via Google Fonts)
- Roboto Mono — Apache License 2.0 (via Google Fonts)

## Live data (added in Phase 1+)

_List each provider with its required attribution text and link when it goes live._
