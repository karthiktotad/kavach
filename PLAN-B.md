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
  - [x] **FE-6 UI: Assistant Screen (`/assist`)**
  - [x] `src/pages/AssistPage.tsx`
  - [x] Header mode badge: "Online AI" | "Offline guidance · from saved safety data" | "On-device AI"
  - [x] Persistent serious-case banner with 112 emergency call button
  - [x] User bubbles and Assistant cards with `SeverityPill`, `StepList`, `SourceChip`, Read aloud TTS
  - [x] Quick-reply chips (Is it safe here?, Nearest shelter, I need a doctor, First aid)
  - [x] Labelled text input, Web Speech microphone integration, clear history (last 20)
  - [x] "Checking saved safety data..." loading and graceful offline fallback notice
  - [x] Tests in `tests/assist-page.test.tsx` (8 tests passing)
- [x] **FE-7 UI: SOS Screen (`/sos`, `/aid`) and Medical ID (`/me`)**
  - [x] `src/pages/AidPage.tsx`
    - [x] Header with `StatusChip`, honest mobile-network helper note
    - [x] GPS location card with 22px bold coordinates, accuracy `±X m`, age ticker, copy button
    - [x] Last known location fallback with age calculation
    - [x] 72px danger `Call 112` button (`tel:112`), `Call 108` ambulance outline button (`tel:108`)
    - [x] Emergency contact SMS launcher (`sms:phone?body=...`) with dashed message preview
    - [x] Idempotent high-priority outbox check-in enqueue when online
    - [x] Tests in `tests/aid-page.test.tsx` (6 tests passing)
  - [x] `src/pages/MePage.tsx`
    - [x] Privacy banner: "Stored on this device only. Never uploaded or shared."
    - [x] Optional medical fields stored strictly in IndexedDB (zero network requests)
    - [x] QR export bottom sheet with lock-screen friendly emergency summary
    - [x] "Delete all" data bottom sheet confirmation
    - [x] "Offline AI (experimental)" toggle with WebGPU check, ~400 MB download hint, and delete model button
    - [x] Tests in `tests/me-page.test.tsx` (5 tests passing)
- [x] **Verification**: Typecheck, Lint, Tests (340 tests across 36 test files passing), Build clean
