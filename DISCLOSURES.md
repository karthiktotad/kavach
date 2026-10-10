# DISCLOSURES.md

**Kavach** — Real-Time Crisis Communication for Tourists During Extreme Weather Events.

Hackathon rule: **all open-source libraries, APIs, datasets and AI models must be disclosed.**
This file is maintained as part of the build (engineering rule 8). If it is not listed here, it is
not allowed in the repo — add the entry in the same commit that introduces the dependency.

> Status legend — ✅ in use · 🟡 planned · ⛔ evaluated and rejected

---

## 1. Frontend libraries

| Library | Licence | Use | Status |
| --- | --- | --- | --- |
| [Vite](https://vitejs.dev/) | MIT | Build tool / dev server | ✅ |
| [React](https://react.dev/) | MIT | UI runtime | ✅ |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 | Type system, strict mode | ✅ |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | Utility-first styling | ✅ |
| [React Router](https://reactrouter.com/) | MIT | Routing (HashRouter for offline deep links) | ✅ |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | MIT | Service worker / Workbox precache + runtime caching | ✅ |
| [Workbox](https://developer.chrome.com/docs/workbox) (via vite-plugin-pwa) | MIT | Offline caching strategy | ✅ |
| [Dexie](https://dexie.org/) | Apache-2.0 | IndexedDB wrapper for offline storage | 🟡 |
| [MapLibre GL JS](https://maplibre.org/) | BSD-3-Clause | Map rendering (no proprietary tiles) | 🟡 |
| [MiniSearch](https://lucaong.github.io/minisearch/) | MIT | On-device full-text search over the first-aid / phrasebook KB | 🟡 |
| [Vitest](https://vitest.dev/) | MIT | Unit test runner | ✅ |
| [Testing Library](https://testing-library.com/) | MIT | Component tests | ✅ |
| [ESLint](https://eslint.org/) | MIT | Linting | ✅ |
| [typescript-eslint](https://typescript-eslint.io/) | MIT | Type-aware lint rules | ✅ |
| [Prettier](https://prettier.io/) | MIT | Formatting | ✅ |

### Browser APIs used (no library, no licence)
WebCrypto (`crypto.subtle`, ECDSA P‑256), IndexedDB, Geolocation API, Device Orientation API,
Web Share API, `speechSynthesis` (SpeechSynthesis API), `BarcodeDetector` (progressive enhancement),
`navigator.connection` (Network Information API), Service Worker, Cache Storage.

---

## 2. Backend

| Component | Licence / plan | Use | Status |
| --- | --- | --- | --- |
| [Supabase](https://supabase.com/) | Apache-2.0 core / free tier | Postgres + PostGIS, Realtime, Auth (anonymous sign-ins), Edge Functions (Deno) | 🟡 |
| PostgreSQL | PostgreSQL Licence | Primary datastore | 🟡 |
| PostGIS | GPL-2.0 (as bundled by Supabase) | Geometry columns for zones, hazards, shelters | 🟡 |

---

## 3. Data sources / APIs

| Source | Provider | Terms / attribution | Use | Status |
| --- | --- | --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/) Forecast API | open-meteo.com | Free for non-commercial use, attribution required | Weather forecast per zone | 🟡 |
| [Open-Meteo](https://open-meteo.com/) Flood / discharge API | open-meteo.com | Free for non-commercial use, attribution required | River discharge + flood probability | 🟡 |
| [GDACS](https://www.gdacs.org/) RSS | European Commission / JRC | Public feed, attribution required | Global disaster alerts | 🟡 |
| [NDMA SACHET](https://sachet.ndma.gov.in/) | National Disaster Management Authority, India | Government open data | India-wide alerts (reachability varies) | 🟡 |
| [IMD CAP](https://mausam.imd.gov.in/) | India Meteorological Department | Government open data | India weather warnings | 🟡 |
| [OpenStreetMap](https://www.openstreetmap.org/) data | OpenStreetMap contributors | **ODbL 1.0** — attribution + share-alike required | Road graph (`roads.json`) and safety-relevant places (`places.json`) for the pilot region | ✅ |
| [Overpass API](https://overpass-api.de/) | OpenStreetMap Foundation | Free community service; needs a descriptive User-Agent, fair use, no heavy automated querying | Build-time queries from `scripts/fetch-osm.ts` and `scripts/build-road-graph.ts` | ✅ |

**Attribution requirement:** OpenStreetMap data is ODbL. The final app and the demo video must carry
"© OpenStreetMap contributors" wherever OSM-derived data is shown. `roads.json` and `places.json`
are derived works and must keep that attribution.

**Overpass usage:** one query per script run, bounded timeout, descriptive User-Agent, and a local
cache in `.cache/osm/` so reruns during the hackathon never re-query. If Overpass is unreachable,
`npm run pack:build -- --offline` writes clearly-marked `sample: true` files rather than silently
degrading to fake data.

---

## 4. AI models

| Model | Provider | Plan | Where called | Status |
| --- | --- | --- | --- | --- |
| [Gemini](https://ai.google.dev/) (`gemini-2.0-flash`) | Google AI Studio | Free tier, subject to Google AI Studio Terms | **Build-time only**, from `scripts/translate-pack.ts`. Machine-translates the content pack and UI strings. Not shipped in the app and never called at runtime. | ✅ |

**Guardrail:** the model is only ever used for *translation at build time*. It never supplies
runtime facts. Safety-critical values — phone numbers, shelter coordinates, medical instructions —
come from the content pack and signed packets, never from model output. Translated medical text is
marked `machineTranslated: true, reviewed: false` and must be human-reviewed before use in a real
crisis (see `TODO_VERIFY.md`).

**Privacy:** the API key is read from `GEMINI_API_KEY` in the environment only. It is never written
to a file, never committed, and never logged.

---

## 5. Data we generate ourselves

- Signed alert packets (ECDSA P‑256). The **private key is generated for the hackathon, stored only in
  Supabase secrets, and is a demo key** — not a production credential.
- Drill alerts, explicitly labelled, produced only by the authority console in DRILL mode.
- Alert templates, phrasebook and first-aid KB: original translations authored for this project.
  **Any entry not yet confirmed by a qualified source carries `verified: false` and is listed in
  [TODO_VERIFY.md](./TODO_VERIFY.md).**

---

## 6. Considered and rejected

| Option | Why rejected |
| --- | --- |
| Google Maps JS SDK | Requires an API key, billing, and is not offline-first. MapLibre GL is open and keyless. |
| Mapbox | Proprietary licence + token required for the hackathon. |
| OpenAI / Anthropic direct from client | Would expose a secret key in the bundle (engineering rule 2). All LLM calls go through an Edge Function. |
| Firebase | Requires credentials that cannot ship in a public no-install PWA. Supabase anon key + RLS fits the model better. |
| Geocoding APIs | Rate limits and keys; the bundled content pack + reverse zone lookup is enough. |