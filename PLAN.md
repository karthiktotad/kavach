# PLAN.md — Kavach hackathon roadmap

Legend: `[ ]` todo · `[~]` in progress · `[x]` done
Every milestone ends with a **commit** and an updated set of checkboxes here (engineering rule 9).

---

## M1 — Scaffold, docs, app shell
- [x] Write the brief into `AGENTS.md`
- [x] Create `PLAN.md` (this file) with M1–M11
- [x] `git init`, `.gitignore`, `.env.example`, `DISCLOSURES.md`, `TODO_VERIFY.md`
- [x] Vite + React + TS scaffold, TS **strict** (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`)
- [x] Tailwind CSS wired to theme tokens + high-contrast safety palette
- [x] `HashRouter` + route table with lazy-loaded routes
- [x] `vite-plugin-pwa`: manifest (name, icons placeholder, theme colour, `standalone`), offline precache, Workbox runtime cache
- [x] ESLint (typescript-eslint type-aware + react-hooks) + Prettier
- [x] Vitest configured (`jsdom`, `globals`), first tests
- [x] Folder structure: `src/{app,components,pages,lib,i18n,store,workers,config}`, `shared/`, `supabase/{migrations,functions}`, `scripts/`, `public/pack/`, `tests/`
- [x] App shell: bottom navigation, header with `StatusChip` stub + language selector stub
- [x] Placeholder pages: `/`, `/alerts`, `/map`, `/assist`, `/aid`, `/phrases`, `/me`, `/report`, `/authority`, `/a/:packet`
- [x] `npm run` scripts: `dev`, `build`, `preview`, `lint`, `test`, `typecheck` (+ `verify`, `format`, coverage)
- [x] **Gate: `typecheck`, `lint`, `test`, `build` all green; dev server + production preview verified**

### M1 verification record (real command output)

```
npm run typecheck   → tsc -b, no errors (app / node / test projects)
npm run lint        → eslint ., 0 problems
npm test            → 4 test files, 22 tests passed
npm run build       → 27 precache entries (~310 KiB), dist/manifest.webmanifest emitted
npm run dev         → HTTP 200 on / and /src/main.tsx
npm run preview     → HTTP 200 on /, /manifest.webmanifest, /sw.js and every PWA icon
manifest fields     → name, short_name, standalone, theme_color #0b1120, icons + maskable, shortcuts
```

**Toolchain deviations from the brief** (current scaffold defaults are newer than the brief assumed):
Vite 8 + React 19 + TypeScript 6; ESLint 10 instead of the oxlint scaffold default;
`react-router-dom` 7. All recorded in the README "Status" section.

### M1 — next
- [x] ~~Start M2 with the content-pack schema~~ — **done, see M2**

---

## M2 — Content pack (preloaded data)
- [x] `src/config/region.ts` — pilot region (Mamallapuram + Chennai coast) as a single configurable module, with the 8 supported locales (en, ta, hi, fr, de, ar, zh, ja) and RTL flags
- [x] Content-pack schema (`src/lib/packTypes.ts`) + pack scripts writing versioned static JSON into `public/pack/`
- [x] Bundled **road graph** (nodes/edges, drivable/walkable/water flags) for the pilot region — 15 599 nodes / 18 292 edges, 785 KiB, 94% connectivity
- [x] **Hazard polygons** as GeoJSON — 9 hand-drawn zones `Z1`–`Z9` (seafront, old town, Theewari, backwater lowlands, hills, Kovalam, ECR, Thiruvanmiyur, OMR corridor)
- [x] **Shelters**, **hospitals**, **police**, **pharmacies**, **fire stations** from OSM (63 places, all `verified: false`)
- [x] **First-aid KB** — 17 deterministic chunks + 5 decision trees (bleeding, CPR, drowning, heat stroke, anaphylaxis)
- [x] **Phrasebook** — 40 emergency phrases in 6 categories (medical, shelter, transport, food/water, safety, documents)
- [x] **Alert templates** — FL/CY/HT/WN/LS × levels 1–4 + AC all-clear, up to 3 steps, `{zone}/{shelter}/{distance}/{until}` placeholders, drill text
- [x] **Emergency contacts** — 112, 108, 100, 101, 1070, 1363 (all `verified: false`) + placeholder consulates with `phone: null`
- [x] `scripts/translate-pack.ts` — Gemini build-time translation, idempotent, placeholder-validated, `_meta.machineTranslated/reviewed` (user runs this with their key)
- [x] `scripts/build-pack-manifest.ts` + `npm run pack:build` orchestrator (with `--offline` sample fallback)
- [x] `src/i18n` JSON message catalogue + `t(key, vars)` + localStorage persistence + `dir="rtl"` for `ar`
- [x] Content-pack validation test (`tests/pack.test.ts`) — schema, unique ids, valid placeholders, resolvable decision-tree `next`, closed GeoJSON polygons, nothing falsely `verified`

### M2 verification record (real command output)

```
npm run pack:build     → places 63 · roads 785.3 KiB · manifest 7 files, 847.7 KiB total
npm run typecheck      → clean
npm run lint           → 0 problems
npm test               → 5 files, 48 tests passed (22 of them pack validation)
npm run build          → precache 27 entries (310 KiB); pack copied to dist/pack, NOT precached (runtime SWR cache)
npm run pack:build -- --offline → sample fallback works, flagged sample:true
```

### M2 — next
- [ ] Start **M3**: Dexie schema + real connectivity detector, then wire the app to load the pack

---

## M3 — Offline core (connectivity ladder, storage, i18n)
- [x] **Dexie** schema: `packFiles`, `packets`, `alerts`, `riskSnapshot`, `outbox`, `reports`, `checkins`, `settings`, `medicalId` — append-only schema versioning + documented migration pattern
- [x] Connectivity detector: `navigator.onLine` **plus** an active health ping (3 s timeout), paused while the tab is hidden; `live | degraded | offline` measured, `cellular | relay` declared by other features
- [x] `useConnectivity()` hook, `lastLiveAt`, event emission on change
- [x] Real `StatusChip`: colour **and** icon **and** text; "Delayed — last updated X ago" / "Offline — using data from X ago"; bottom sheet explaining what works at that level
- [x] **PackManager** (`src/lib/pack.ts`): manifest compare, resume, per-file SHA-256 via WebCrypto, `navigator.storage.persist()`, typed getters, on-demand locale download (English always)
- [x] `src/lib/outbox.ts`: generic queue, client UUIDs, per-type handler registry, ordered drain, exponential backoff, Background Sync where supported, `queued | sending | sent | failed`, "Queued items" indicator
- [x] `src/lib/freshness.ts` — `formatAge`, `formatClock`, `formatBytes`, freshness bands
- [x] Global `ErrorBoundary` that keeps alerts and SOS reachable and never auto-reloads
- [x] **Get Ready** at `/ready`: what is stored, size, download with real progress, success state, install-to-home-screen (`beforeinstallprompt` captured; iOS instructions otherwise)
- [x] SW: app-shell precache, `NetworkOnly` health probe, stale-while-revalidate pack, network-first snapshot, **assistant + write endpoints deliberately never cached**
- [x] Non-blocking "Update available" banner — user-triggered only, never auto-reload
- [~] i18n: JSON catalogue, `t(key, vars)`, localStorage, `dir="rtl"` for Arabic — *done in M2*; Dexie-backed persistence and pluralisation still open
- [x] Unit tests: outbox ordering/idempotency/backoff, connectivity transitions, pack hash-mismatch + resume
- [x] **Playwright e2e** (`e2e/offline.spec.ts`): install Get Ready, switch the browser context offline, reload, assert the shell boots, the chip reports offline, navigation works, and `zones.geojson` is still readable from IndexedDB

### M3 verification record (real output)

```
npm run typecheck   → clean
npm run lint        → 0 problems
npm test            → 8 files, 87 tests passed
npm run build       → 28 precache entries (486 KiB)
npx playwright test → 2 passed (app shell + pack data work with the network off;
                      offline deep link /#/a/<packet> renders)
```

E2E runs against the **production preview** via Playwright `channel: 'chrome'`
(system Chrome), because a service worker does not exist in the dev server —
testing offline there would prove nothing.

---

## M4 — Signed alert packets (the trust core)
- [ ] `shared/packet/codec.ts` — compact encode/decode (**fits one SMS and one QR**), versioned, checksummed
- [ ] `shared/packet/types.ts` — hazard codes, levels 0–4, zone ids, expiry, issuer, signature
- [ ] `shared/packet/verify.ts` — ECDSA P-256 verify via **WebCrypto**
- [ ] `shared/keys/` — bundled authority public key(s) + key id registry
- [ ] Ed25519→P-256 decision recorded; canonical serialisation + base64url helpers
- [ ] UI: scan QR (`BarcodeDetector` where available, manual paste fallback), paste SMS link
- [ ] Deep link `/#/a/:packet` renders + verifies a packet fully offline
- [ ] Packet detail: who signed, when, expiry, hazard, zone, plain-language render, **DRILL badge**
- [ ] Tamper tests: flipped byte, wrong key, expired, unknown key id, truncated, malformed base64
- [ ] Unit tests: codec round-trip, size budget, verification matrix

---

## M5 — Backend (Supabase)
- [ ] `supabase/migrations/` — zones (PostGIS), alerts, packets, reports, checkins, drills, authority_keys
- [ ] RLS policies: reports/checksins public-read; writes authenticated; alerts read-only for anon
- [ ] Anonymous auth sign-in (device-scoped) + anonymous UID persisted offline
- [ ] Edge Function `issue-alert` — **signs** packets; private key from **Supabase secrets only**
- [ ] Edge Function `ingest-live` — Open-Meteo forecast + flood, GDACS, NDMA SACHET / IMD CAP → per-zone risk **0–4 + plain-language reason**
- [ ] Edge Function `snapshot` — clients fetch the **computed** snapshot, never raw feeds
- [ ] Edge Function `ai-proxy` — **only** place Gemini is called; grounded prompt + citation enforcement
- [ ] Outbox sync endpoint + idempotency keys
- [ ] Realtime channel for new alerts
- [ ] Local dev fallback so the app is fully demoable **without** Supabase configured

---

## M6 — Authority console
- [ ] Auth-gated console (`/authority`), emergency-access break-glass flow
- [ ] Compose alert: hazard, level, zones (map multi-select), expiry, language targets
- [ ] Live preview of the encoded packet: **length + SMS/QR budget meter**
- [ ] Issue → signs → publishes → shows the shareable link + QR payload
- [ ] **DRILL mode**: hard toggle, triple-confirm, watermark in every emitted packet
- [ ] Issued-alert history, revoke, audit log
- [ ] Zone risk dashboard showing the ingested snapshot with reasons

---

## M7 — Tourist alerts + relay
- [ ] Alerts list: official alerts, sorted, grouped by severity, **filtered by zone**
- [ ] Alert detail with per-language render, countdown to expiry, share sheet (Web Share API + copy)
- [ ] **Relay mode**: add a packet by SMS link, QR, paste, or Bluetooth/USB file
- [ ] Packet inbox: verified vs unverified with plain reasons
- [ ] Subscription: follow zones / follow hazard types
- [ ] "Only show alerts affecting me" via last-known GPS (works offline)
- [ ] Tests: sorting/filtering/expiry logic

---

## M8 — Map + hazard-aware routing (no-data)
- [ ] MapLibre GL with bundled style; **no online tiles required** (offline vector/GeoJSON source)
- [ ] Zone polygons with risk shading (accessible patterns, not colour-only)
- [ ] Shelter/hospital/first-aid markers with `verified` badge
- [ ] Offline **router**: A* on the bundled road graph, edge cost penalised inside hazard polygons
- [ ] Edge cases: unreachable, start inside hazard, graph crossing flooded edge, no GPS permission
- [ ] **Compass + distance fallback** when routing/graph is unavailable
- [ ] Turn list, step-by-step, big touch targets, haptics
- [ ] Tests: A* correctness, hazard avoidance, degenerate graphs

---

## M9 — Reports, trust, outbox, check-ins
- [ ] Community report form (hazard, zone, photo optional, severity) with offline draft
- [ ] **Trust scoring**: deterministic `shared/trust/score.ts` — proximity, corroboration, recency, reporter history
- [ ] Community card rendering: **visually distinct from official alerts**, confidence bar, source label
- [ ] Map/report aggregation by zone
- [ ] **Outbox**: queue in Dexie, drain on reconnect, exponential backoff, idempotency, visible queue
- [ ] **"I'm safe" check-ins** + family/contact share link (no server copy of identity)
- [ ] Moderation basics: report flagging, auto-expiry of stale reports
- [ ] Tests: trust score monotonicity and bounds, outbox retry/idempotency

---

## M10 — Assistant, first aid, phrases, medical ID, SOS
- [ ] **MiniSearch** over the bundled KB; index built on device, cached
- [ ] Intent routing (`shared/intent/`): emergency / shelter / medical / phrase / unknown — deterministic
- [ ] Decision trees for offline triage; red-flag escalation to SOS
- [ ] Grounded assistant: online (Edge Function + Gemini) / offline (MiniSearch + trees), with **source chips**
- [ ] Hard guardrails: LLM output cannot supply numbers, coords, or medical facts; blocked-claim tests
- [ ] First-aid module: conditions, step lists, red flags, do-nots, read-aloud
- [ ] Phrasebook: category browse, show-a-local, TTS via `speechSynthesis`, offline voice choice
- [ ] **Medical ID on-device only** — stored in Dexie, never synced, export/print via QR
- [ ] **One-tap SOS**: `sms:` / `tel:` with prefilled coordinates + multilingual body
- [ ] Tests: intent routing table, guardrail rejections, safety-fact provenance

---

## M11 — Hardening, deploy, README, video
- [ ] PWA polish: install prompt, icons (real generated), splash, offline fallback page
- [ ] `vite-plugin-pwa` update flow, SW versioning, cache eviction for content pack
- [ ] Accessibility pass: keyboard nav, focus traps, aria-live for alerts, contrast ≥ WCAG AA, RTL re-check
- [ ] Performance: bundle budget, route-level code splitting, map lazy-load
- [ ] **Device-matrix test**: flight mode, 2G, high latency, low storage, GPS denied
- [ ] **Connectivity matrix test**: every feature documented at all 5 ladder levels (AGENTS.md rule 1)
- [ ] Deploy to Cloudflare Pages/Vercel — public link in README
- [ ] **README.md**: problem, solution, architecture, setup, demo script, screenshots
- [ ] **Demo video** 2–5 min in the repo (`docs/`), covering offline + signed packet + relay + routing
- [ ] Final `DISCLOSURES.md` + `TODO_VERIFY.md` audit
- [ ] Final gate: `typecheck`, `lint`, `test`, `build` green; production URL smoke-tested

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Judges have no network | Everything demoable offline; relay path is a first-class feature, not a fallback |
| "Is the signing real?" | Show the public key, the WebCrypto verification and a tamper test in the video |
| Live feeds unavailable in pilot region | Snapshot endpoint degrades to `verified: false` + explicit reason; never silently fakes data |
| Packet too big for SMS | Budget test at 160 chars / single QR; fall back to short-URL + code if exceeded |
| App too large to install | No-install PWA by design; content pack loaded once and cached |
| Fake demo risk | DRILL mode is loudly labelled everywhere; nothing fabricated, ever |