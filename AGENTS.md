# AGENTS.md — Kavach

> **Kavach** (कवच — "armour, protection")
> *When the internet dies, the information must still arrive, be verifiable, and be understandable in the tourist's language.*

This file is the **source of truth for every engineer and AI agent on this project**. Read it fully before writing code. Do not deviate without updating this file in the same commit.

---

## 1. Problem (Hackathon track: TravelTech)

**Real-Time Crisis Communication for Tourists During Extreme Weather Events.**

During flash floods or cyclones, foreign tourists are highly vulnerable: they have no local geographic knowledge and hit language barriers. Local warnings, emergency broadcasts and safe-zone declarations are **fragmented and rarely translated**. Tourists cannot verify which areas are flooded or unsafe, and fall back on **unverified social media rumours**.

Result: **panic, stranded travellers walking into danger, and strain on rescue services.**

---

## 2. Our Solution — Kavach

A **no-install PWA** (opened via QR code at hotels, airports and taxis) that keeps working across **every level of connectivity** and keeps its **TRUST guarantee at every level**.

### The five core ideas

1. **SIGNED ALERT PACKETS**
   Every official alert is signed (**ECDSA P-256, WebCrypto**) by the issuing authority and encoded as a compact string that fits **one SMS and one QR code**. The app verifies it **OFFLINE** using a public key bundled in the app. The packet can travel over any channel (SMS link, QR, share sheet / AirDrop / Nearby Share) and stay trustworthy.

2. **LANGUAGE-INDEPENDENT ALERT CODES**
   Packets carry **codes** (hazard, level, zone ids, expiry). The app renders them instantly in the tourist's language from **pre-translated templates stored on the device**. No internet and no AI needed at the moment of crisis.

3. **CONNECTIVITY LADDER with a visible status chip**
   `Live` → `Degraded` → `Cellular-only` → `Offline` → `Relay`
   The app **changes behaviour per level**, and always tells the user where it is on the ladder.

4. **GROUNDED AI ASSISTANT**
   *Online*: an LLM (via a server proxy) over a curated knowledge base plus live data.
   *Offline*: falls back to on-device search (**MiniSearch**) and decision trees.
   It must **never invent shelters, numbers or medical facts**. Safety-critical facts come from **deterministic data, not the LLM**.

5. **HAZARD-AWARE GUIDANCE WITHOUT DATA**
   GPS works offline, so the app routes to shelters on a **bundled road graph avoiding flagged hazard zones**, and falls back to a **compass arrow plus distance**.

### Other must-haves

- Preloaded **content pack** (offline map data, shelters, hospitals, first aid, phrasebook, alert templates in **8 languages**)
- **Design system** — `docs/DESIGN_SPEC.md` defines tokens, components, i18n, RTL, and verification. Every screen must use only the specified components.
- **Community reports** with a trust/confidence score — **never presented as official alerts**
- **Offline outbox** that syncs on reconnect
- **"I'm safe" check-ins**
- **Authority console**
- **Medical ID kept on-device only** (never uploaded)
- **One-tap SOS** via `sms:` / `tel:` links
- **Show-a-local cards** with read-aloud

---

## 3. Data strategy

| Tier | Contents |
| --- | --- |
| **Preloaded (bundled content pack)** | Pilot-region map data, shelters/hospitals/police, road graph, hazard polygons, first-aid KB, phrasebook, alert templates |
| **Live (free APIs, server-side ingestion)** | Open-Meteo forecast + flood APIs, GDACS, NDMA SACHET / IMD CAP where reachable → produces a **per-zone risk level 0–4 with a plain-language reason**. Clients fetch the **computed snapshot**, not raw feeds. |
| **Official alerts** | Issued from **our authority console** (primary source of verified alerts) |
| **Drills** | Real disasters cannot be summoned for judges, so the authority console has a clearly labelled **DRILL mode**. Drills are **always labelled in the UI**. **Nothing fake is ever presented as real.** |

**Pilot region:** Mamallapuram (Mahabalipuram) and the Chennai coast, Tamil Nadu, India — kept configurable in **one config file** (`src/config/region.ts`).

---

## 4. Tech stack (all free tier)

- **App:** Vite + React + TypeScript, Tailwind CSS, `react-router` with **HashRouter** (deep links like `/#/a/<packet>` must work offline), `vite-plugin-pwa` (Workbox), **Dexie** (IndexedDB), **MapLibre GL**, **MiniSearch**, **Vitest**
- **Backend:** Supabase (Postgres/PostGIS, Realtime, Auth with anonymous sign-ins, Edge Functions)
- **AI:** Gemini free tier (or similar), called **only from an Edge Function**
- **Hosting:** Cloudflare Pages or Vercel for the PWA

---

## 5. Engineering rules (apply to every future prompt)

1. **Offline-first.** Every feature must **declare how it behaves at each connectivity level**. Never assume the network.
2. **No secrets in the repo or client bundle.** Use `.env` (gitignored) plus `.env.example`. The **packet-signing private key lives only in Supabase secrets**.
3. **TypeScript strict mode.** Small modules, clear folder structure, **no dead code**.
4. **Write unit tests for pure logic** (packet codec, trust scoring, routing, intent routing).
5. **Every user-facing string goes through an i18n layer.** Never hardcode UI text in components.
6. **Accessibility.** Large touch targets, high contrast, icon-first, **RTL support**, aria labels.
7. **Never fabricate safety data** (phone numbers, shelter locations, medical advice). Mark anything unverified as such in the data (`verified: false`) and list it in `TODO_VERIFY.md`.
8. **Maintain `DISCLOSURES.md`** listing every third-party library, API, dataset and AI model used, with licence/attribution notes.
9. **Commit after each completed step** with a clear message. After each task, update `PLAN.md` checkboxes.
10. **Before declaring a step done, run build, lint and tests, and report real output.** Do not claim success without running the commands.

---

## 6. Judging criteria (optimise for these)

| Weight | Criterion | What it means for us |
| --- | --- | --- |
| 20% | **Innovation** | Signed packets, language-independent codes, connectivity ladder, no-install PWA |
| 35% | **Technical Implementation** | Depth, code quality, robustness, edge cases — *the biggest score* |
| 20% | **Feasibility** | Runs today, free tier, no setup for the judge |
| 15% | **Video** | 2–5 min demo video **in the repo** |
| 10% | **Deployment/Hosting** | Public link, no setup, stable |

**Rules:** project must be built during the hackathon; open-source libraries and APIs must be **DISCLOSED**; README must explain problem, solution and setup; demo video goes in the repo; the app must be publicly hosted.

> ⚠️ Incomplete or non-functional projects are penalised. **Fake demos are disqualified.**

---

## 7. Repository layout

```
src/
  app/        – app shell, router, providers
  components/ – reusable UI (StatusChip, cards, sheets)
  pages/      – route-level screens
  lib/        – pure logic (packet codec, trust, routing, intents)
  i18n/       – translations + formatter
  store/      – state (connectivity, alerts, prefs)
  workers/    – web workers (search, routing)
  config/     – region config, env
shared/       – pure TS used by BOTH client and Supabase Edge Functions
supabase/
  migrations/ – SQL
  functions/  – Edge Functions (signing, ingestion, AI proxy)
scripts/      – content-pack build & validation scripts
public/pack/  – preloaded content pack (JSON/PMTiles)
tests/        – Vitest unit tests
```

**`shared/` is dependency-light on purpose** — it is imported by both the browser bundle and Deno Edge Functions, so it must never import from `src/` or use browser APIs.

---

## 8. Connectivity ladder reference

| Level | Meaning | Kavach behaviour |
| --- | --- | --- |
| **Live** | Fast network | Everything: live snapshot, realtime alerts, AI assistant, outbox sync |
| **Degraded** | Slow / flaky | Timeouts + retries, cached snapshot, assistant degraded to cached KB |
| **Cellular-only** | Metered, expensive | Text + QR only, **no map tiles**, no video; packets over SMS |
| **Offline** | No network | Bundled content pack only, on-device MiniSearch + decision trees, offline routing |
| **Relay** | No data, SMS/voice only | Read alerts from packets received by SMS/QR/share, manual zone entry, show-a-local + read-aloud |

**Rule:** the status chip is always visible. Never hide degraded state behind a spinner.

---

## 9. Trust rules (non-negotiable)

- A **community report is never rendered with official styling**. It always carries its confidence score and a source label.
- **Drills always say DRILL / 演習** in every language, in the header *and* in the packet detail.
- Safety-critical values (phone numbers, shelter coords, medical facts) come from the **content pack or the signed packet**, never from the LLM.
- Any content with `verified: false` must show an unverified badge and be listed in `TODO_VERIFY.md`.