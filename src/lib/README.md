# `src/lib/` — pure app logic

Client-side logic that is **not** shared with the Edge Functions (those live in
the top-level [`shared/`](../../shared/)) and **not** a React component.

| Module | Milestone | Purpose |
| --- | --- | --- |
| `db.ts` | M3 | Dexie schema: alerts, packets, reports, outbox, checkins, prefs, content cache |
| `contentPack.ts` | M2 | Fetch + validate + cache the preloaded pack |
| `geo.ts` | M2 | Haversine distance, bearing, point-in-polygon, zone lookup |
| `supabase.ts` | M5 | Client + RLS-safe queries, anonymous auth, outbox sync |
| `telemetry.ts` | M11 | Privacy-preserving local diagnostics (never leaves the device) |

Rules (engineering rules 3 and 4):
- **Pure functions only.** Anything deterministic belongs here and gets a unit test.
- No React imports. No direct `fetch` in a pure module — pass data in, get data out.
- Network-touching helpers are thin wrappers that call into a pure core, so the
  core stays testable without mocking `fetch`.

Status: the directory is empty until M2.