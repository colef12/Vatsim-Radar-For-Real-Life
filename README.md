# Vatsim-Radar-For-Real-Life

A live map of **real-world** air traffic, built to look and work like [VATSIM Radar](https://vatsim-radar.com/), hosted on GitHub Pages.

**Live:** https://colef12.github.io/Vatsim-Radar-For-Real-Life/

> Not for navigation or ATC use. Data is crowd-sourced ADS-B and may be incomplete or delayed.

## Develop

```bash
nvm use        # Node 22
npm ci
npm run dev    # http://localhost:5173/Vatsim-Radar-For-Real-Life/
```

| Command             | Purpose                     |
| ------------------- | --------------------------- |
| `npm run lint`      | ESLint + Prettier check     |
| `npm run typecheck` | `vue-tsc` strict            |
| `npm test`          | Vitest unit tests           |
| `npm run build`     | Production build to `dist/` |

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## License

[CC BY-NC 4.0](LICENSE). Adapted from VATSIM Radar — see [CREDITS.md](CREDITS.md).
