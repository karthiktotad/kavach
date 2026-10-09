<div align="center">

# Kavach · कवच

**When the internet dies, the information must still arrive, be verifiable, and be understandable in the tourist's language.**

Real-Time Crisis Communication for Tourists During Extreme Weather Events.

`Hackathon track: TravelTech` · Pilot region: **Mamallapuram (Mahabalipuram) & the Chennai coast, Tamil Nadu, India**

</div>

---

## The problem

During flash floods or cyclones, foreign tourists are at their most vulnerable:
no local geographic knowledge, and a language barrier in front of every warning.
Local alerts, emergency broadcasts and safe-zone declarations are fragmented and
rarely translated. Tourists cannot verify which areas are flooded, so they fall
back on unverified social media rumours.

Result: **panic, stranded travellers walking into danger, and strain on rescue
services.**

## The solution

A **no-install PWA** (opened by QR code at hotels, airports and taxis) that keeps
working at every level of connectivity, and keeps its trust guarantee at every
level too.

| # | Core idea |
| --- | --- |
| 1 | **Signed alert packets** — every alert is signed ECDSA P-256 and encoded to fit **one SMS and one QR code**. Verified **offline** with a bundled public key. Any channel (SMS, QR, AirDrop, share sheet) stays trustworthy. |
| 2 | **Language-independent alert codes** — packets carry hazard/level/zone/expiry *codes*; the device renders them from pre-translated templates. No internet, no AI, no translation service at the moment of crisis. |
| 3 | **Connectivity ladder** — `Live → Degraded → Cellular-only → Offline → Relay`, always visible as a status chip, with app behaviour changing per rung. |
| 4 | **Grounded AI assistant** — online: an LLM via a server proxy over a curated KB plus live data. Offline: on-device MiniSearch and decision trees. It never invents shelters, numbers or medical facts. |
| 5 | **Hazard-aware guidance without data** — GPS works offline, so the app routes over a bundled road graph that avoids flagged hazard zones, falling back to a compass arrow and distance. |

Plus: community reports with a trust score (never shown as official), an offline
outbox, "I'm safe" check-ins, an authority console, on-device-only Medical ID,
one-tap SOS via `sms:`/`tel:`, and show-a-local cards with read-aloud.

## Trust rules (non-negotiable)

- A community report is **never** rendered with official styling and always shows
  its confidence score and source.
- Real disasters cannot be summoned for judges, so the authority console has a
  clearly labelled **DRILL mode**. Drills are watermarked in the UI *and* inside
  the signed packet. **Nothing fake is ever presented as real.**
- Phone numbers, shelter locations and medical facts come from the content pack
  or the signed packet — never from the model, never from memory. Anything not
  yet confirmed carries `verified: false` and is listed in
  [`TODO_VERIFY.md`](./TODO_VERIFY.md).
- All third-party libraries, APIs, datasets and AI models are disclosed in
  [`DISCLOSURES.md`](./DISCLOSURES.md).

---

## Status: **M1 — scaffold complete**

| Milestone | Status |
| --- | --- |
| M1 Scaffold, docs, app shell | ✅ complete |
| M2 Content pack | ⬜ next |
| M3 Offline core (Dexie, connectivity ladder, i18n) | ⬜ |
| M4 Signed alert packets | ⬜ |
| M5 Backend (Supabase) | ⬜ |
| M6 Authority console | ⬜ |
| M7 Tourist alerts + relay | ⬜ |
| M8 Map + hazard-aware routing | ⬜ |
| M9 Reports, trust, outbox, check-ins | ⬜ |
| M10 Assistant, first aid, phrases, Medical ID, SOS | ⬜ |
| M11 Hardening, deploy, README, demo video | ⬜ |

The full checklist is in [`PLAN.md`](./PLAN.md). Project rules for every future
contributor are in [`AGENTS.md`](./AGENTS.md).

**What works right now:** the app shell (bottom navigation, header with the
connectivity status chip, language selector across 8 locales with RTL support),
all ten routes including the offline deep link `/#/a/<packet>`, the PWA manifest
and service worker, and the test/lint/typecheck/build gates.

---

## Tech stack

Vite 8 · React 19 · TypeScript (strict) · Tailwind CSS 4 · React Router
(**HashRouter**, so deep links work offline) · vite-plugin-pwa (Workbox) · Dexie
· MapLibre GL · MiniSearch · Vitest · ESLint · Prettier.
Backend: Supabase. AI: Gemini free tier, **Edge Function only**. Hosting: Cloudflare
Pages or Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local     # optional: the app runs fully without a backend
npm run dev                    # http://localhost:5173
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b` across app, node and test projects |
| `npm run lint` | ESLint (type-aware) |
| `npm run test` | Vitest unit tests |
| `npm run test:coverage` | Tests with V8 coverage |
| `npm run verify` | typecheck → lint → test → build, in one command |

## Repository layout

```
src/{app,components,pages,lib,i18n,store,workers,config}   # the app
shared/          # pure TS shared by the client AND Supabase Edge Functions
supabase/{migrations,functions}
scripts/         # content-pack build + validation
public/pack/     # preloaded offline content pack
tests/           # Vitest unit tests
```

## Accessibility

Dark, high-contrast UI with severity expressed by **icon + text + lightness**, not
colour alone; 48px minimum touch targets; safe-area insets; RTL support via CSS
logical properties and `<html dir>`; skip-to-content; `aria-live` on the status
chip; reduced-motion support.

## Licence

Built during a hackathon. See [`DISCLOSURES.md`](./DISCLOSURES.md) for all
third-party attributions and licences.