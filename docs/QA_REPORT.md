# QA Report — Kavach integrate branch

Date: 2026-10-10
Scope: local repo validation for the integration branch. This is a technical QA check, not a full production launch sign-off.

## Executive summary

The branch is green on the core local evidence that can be proven in this environment:

- Unit tests are passing.
- Production build succeeds.
- Offline browser verification passes.
- Route screenshots were captured and saved under [docs/qa/screens](../qa/screens).

The remaining gaps are not code failures; they are device/backend checks that require a real mobile device, live Supabase deployment, and a live authority flow. Those checks are listed explicitly in the final section of this report.

## Verified status by part

| Part | Status | Evidence |
| --- | --- | --- |
| 1. Route + integration sanity | Pass | Browser and route checks succeeded; the route shell booted and the app rendered without crashing. |
| 2. Visual / screen QA | Pass (captured) | Screenshots saved under [docs/qa/screens](../qa/screens). |
| 3. Accessibility | Partial | Local UI smoke checks were run indirectly via tests; a full keyboard/contrast/device pass was not completed in this environment. |
| 4. Security / production hygiene | Pass (static checks) | No hardcoded secrets or dev-only routes were found in the built output, and the app remained on the public-key verification model. |
| 5. Resilience matrix / failure mode audit | Partial | Core offline path was tested; the full device-matrix and live backend failure cases remain for a real device deployment. |
| 6. Offline verification | Pass | Playwright offline spec passed. |
| 7. Performance / deployment readiness | Partial | Production build and size metrics succeeded; Lighthouse and live deployment checks were not executed here. |

## Fixes made before sign-off

- Restored honest empty-state behavior on the phrasebook route instead of fake or placeholder content.
- Kept the offline alert deep-link flow working and verified the packet route still renders in production build / browser validation.
- Re-checked the app shell and core route matrix without introducing new features.

## Real command evidence

### Test suite

```
$ npm test -- --run

Test Files  42 passed (42)
     Tests  371 passed (371)
```

### Production build

```
$ npm run build

> kavach@0.0.0 build
> tsc -b && vite build

✓ built in 307ms
PWA v2.0.0
precache  61 entries
```

### Browser-level offline verification

```
$ npx playwright test e2e/offline.spec.ts --reporter=line

Running 2 tests using 1 worker
  2 passed (4.7s)
```

### Screenshot capture

Routes were captured at mobile and tablet viewports and saved under [docs/qa/screens](../qa/screens), including the home, alerts, map, assist, aid, phrases, reports, ready, scan, check, authority, and packet deep-link views.

## Remaining checks that require a real device or live backend

These were not fully proven in this environment and should be treated as the remaining QA gate before a final “production-ready” sign-off:

- Full keyboard-only navigation and screen-reader pass.
- A real iOS/Android install flow and PWA prompt behavior on device.
- Live authority-console issuing flow against Supabase and signed packet publishing.
- Real SMS/QR relay and packet ingest from a phone outside the browser environment.
- Full device matrix: low storage, low battery, GPS denied, poor coverage, and network relay scenarios.
- Lighthouse / Core Web Vitals pass on a production deployment.
- Live backend smoke tests for Edge Functions and DB migrations against a real project.

## Final verdict

The repository is in a verified green state for local build, testing, and offline browser behavior. The remaining gaps are explicit and not hidden. The app is not yet a full production sign-off for live authority operations, but it is verified for the offline-first, packet-driven, and route-integrity work that was fixed and checked in this pass.
