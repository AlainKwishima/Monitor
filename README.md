# Aurora Monitor

Real-time global intelligence dashboard with map-based situational awareness, AI insights, flight intelligence, and operations alerts.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Last commit](https://img.shields.io/github/last-commit/AlainKwishima/Monitor)](https://github.com/AlainKwishima/Monitor/commits/main)

## Quick Start

```bash
git clone https://github.com/AlainKwishima/Monitor.git
cd Monitor
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Variant Commands

```bash
npm run dev:tech
npm run dev:finance
npm run dev:commodity
npm run dev:happy
```

## Main Features

- Global intelligence map (2D + 3D)
- Live and country-focused news panels
- AI Forecast and AI Insights panels
- Rwanda flights monitoring
- Real-time global flights map
- Ops Alerts panel (flight delays + weather alerts + climate anomalies)
- Panel focus modal for clear reading
- Header AI chat modal

## Tech Stack

- Frontend: TypeScript, Vite, Preact
- Maps: deck.gl, MapLibre GL, globe.gl
- API: Vercel Edge Functions + generated protobuf clients
- Desktop: Tauri (Rust + Node sidecar)
- Caching/Data: Redis, service worker, scheduled seed jobs

## Useful Scripts

```bash
npm run typecheck
npm run test:data
npm run test:sidecar
npm run test:e2e
```

## Repository

- GitHub: [AlainKwishima/Monitor](https://github.com/AlainKwishima/Monitor)

## License

AGPL-3.0 for non-commercial use. Commercial use requires a commercial license.

See [LICENSE](LICENSE) for details.
