# PARALLEL-WORK RULES (Device B)

Two agents build this app on separate branches (fe-a, fe-b) and merge later. I am Device B, owner of: src/pages/map, assist, sos, me, authority; src/lib/assistant, src/lib/sos.ts, map helpers (src/lib/map/*), docs/ASSISTANT_DECISION.md.
1. Touch ONLY my folders. If I need something outside them, do not edit it. Write the need to docs/HANDOFF_B.md and use a minimal local stub.
2. i18n: only my own files src/i18n/<lang>/{map,assist,sos,me,authority}.json. Never edit Device A's files (core, home, alert, check).
3. Routes: export my routes from src/routes/b.routes.ts. Add at most one import line to the shared router.
4. Log progress in PLAN-B.md, not PLAN.md.
5. package.json: add only needed deps, list them in each report. No reformatting, no upgrades.
6. Commit small and often on fe-b. Never force-push, never touch main. When told to sync, run `git merge fe-a` and resolve conflicts in favour of fe-a for shared files.
7. Everything else in each task prompt stays as written: tests, verification, no invented data, honest fallbacks.
