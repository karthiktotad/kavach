# `src/workers/` — Web Workers

Long-running, CPU-bound work is moved off the main thread so the UI stays
responsive **when there is no network and everything must run on-device**.

| Worker | Milestone | Job |
| --- | --- | --- |
| `search.worker.ts` | M10 | Builds and queries the MiniSearch index over the first-aid KB + phrasebook |
| `routing.worker.ts` | M8 | Runs A* over the bundled road graph, penalising edges inside hazard polygons |
| `pack.worker.ts` | M2 | Parses and indexes the content pack off the main thread on first load |

Rules:
- Workers import from `shared/` and `src/lib/`, never from `src/components` or `src/pages`.
- Every worker must degrade gracefully when `Worker` is unavailable (older
  WebViews) — the caller falls back to running the same pure function inline.
- Because these are pure CPU tasks, they are directly unit-testable as plain
  functions; the worker file is only a thin transport wrapper.

Status: the directory is empty until M2/M8/M10.