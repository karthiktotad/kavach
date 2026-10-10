# PLAN-B.md — Device B Execution Plan

This plan tracks non-UI and UI tasks owned by Device B on branch `fe-b`.

## Progress Checklist

- [x] Initial setup: `PARALLEL_B.md`, `PLAN-B.md`, `docs/HANDOFF_B.md`, `src/routes/b.routes.ts`
- [x] **FE-6 Logic: Assistant Contract and Providers**
  - [x] `docs/ASSISTANT_DECISION.md`
  - [x] `src/lib/assistant/types.ts`
  - [x] `src/lib/assistant/router.ts` (deterministic intents)
  - [x] `src/lib/assistant/offline.ts` (MiniSearch BM25 over KB + decision trees)
  - [x] `src/lib/assistant/api.ts` (Edge Function proxy client with timeout and zod validation)
  - [x] `src/lib/assistant/webllm.ts` (stub provider)
  - [x] `src/lib/assistant/assistant.ts` (orchestrator & context builder)
  - [x] Tests in `tests/assistant.test.ts` (32 tests passing)
- [x] **FE-7 Logic: SOS and Medical ID**
  - [x] `src/lib/sos.ts` (pure SOS message formatter with SMS URI handling & character limits)
  - [x] `src/lib/medicalId.ts` (IndexedDB store, QR export, local-only)
  - [x] Tests in `tests/sos.test.ts` and `tests/medical-id.test.ts` (13 tests passing)
- [x] **FE-8 Logic: Authority Wizard State Machine**
  - [x] `src/pages/authority/wizard.ts` (state machine, drill/live confirmation, cancel/all-clear logic, preview)
  - [x] Tests in `tests/authority-wizard.test.ts` (8 tests passing)
- [x] **FE-5 Logic: Map and Routing Helpers**
  - [x] `src/lib/map/math.ts` (distance, bearing, compass text)
  - [x] `src/lib/map/polling.ts` (low-power geolocation settings)
  - [x] `src/lib/map/nearest.ts` (nearest place search & list fallback)
  - [x] `src/lib/map/layers.ts` (GeoJSON layer builders)
  - [x] `src/lib/map/route.ts` & `src/workers/router.worker.ts` (offline graph routing avoiding hazard zones)
  - [x] Tests in `tests/map.test.ts` (15 tests passing, including offline sub-1s routing test)
- [x] Verification: Typecheck, Lint, Tests, Build
