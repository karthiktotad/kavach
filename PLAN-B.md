# PLAN-B.md — Device B Execution Plan

This plan tracks non-UI and UI tasks owned by Device B on branch `fe-b`.

## Progress Checklist

- [x] Initial setup: `PARALLEL_B.md`, `PLAN-B.md`, `docs/HANDOFF_B.md`, `src/routes/b.routes.ts`
- [ ] **FE-6 Logic: Assistant Contract and Providers**
  - [ ] `docs/ASSISTANT_DECISION.md`
  - [ ] `src/lib/assistant/types.ts`
  - [ ] `src/lib/assistant/router.ts` (deterministic intents)
  - [ ] `src/lib/assistant/offline.ts` (MiniSearch BM25 over KB + decision trees)
  - [ ] `src/lib/assistant/api.ts` (Edge Function proxy client with timeout and zod validation)
  - [ ] `src/lib/assistant/webllm.ts` (stub provider)
  - [ ] `src/lib/assistant/assistant.ts` (orchestrator & context builder)
  - [ ] Tests in `tests/assistant.test.ts`
- [ ] **FE-7 Logic: SOS and Medical ID**
  - [ ] `src/lib/sos.ts` (pure SOS message formatter with SMS URI handling & character limits)
  - [ ] `src/lib/medicalId.ts` (IndexedDB store, QR export, local-only)
  - [ ] Tests in `tests/sos.test.ts` and `tests/medical-id.test.ts`
- [ ] **FE-8 Logic: Authority Wizard State Machine**
  - [ ] `src/pages/authority/wizard.ts` (state machine, drill/live confirmation, cancel/all-clear logic, preview)
  - [ ] Tests in `tests/authority-wizard.test.ts`
- [ ] **FE-5 Logic: Map and Routing Helpers**
  - [ ] `src/lib/map/types.ts` & layer-building helpers
  - [ ] `src/lib/map/math.ts` (distance, bearing, compass text)
  - [ ] `src/lib/map/nearest.ts` (nearest place search & list fallback)
  - [ ] `src/lib/map/polling.ts` (low-power geolocation settings)
  - [ ] `src/lib/map/route.ts` & `src/workers/router.worker.ts` (offline graph routing avoiding hazard zones)
  - [ ] Tests in `tests/map.test.ts` (including offline sub-1s routing test)
- [ ] Verification: Typecheck, Lint, Tests, Build
