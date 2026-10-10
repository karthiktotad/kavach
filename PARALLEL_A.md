# PARALLEL-WORK RULES (Device A)

Two agents build this app on separate branches (`fe-a`, `fe-b`) and merge later.

**I am Device A**, owner of:

- `src/components/ui`
- `src/styles`
- `src/lib/permissions.ts`
- `src/pages/home`, `ready`, `alerts`, `alert-detail`, `scan`, `check`
- the manifest (incl. `share_target`)
- `docs/DESIGN_SPEC.md`

---

## Rules

1. **Touch ONLY my folders.** If I need something outside them, do not edit it. Write the need to `docs/HANDOFF_A.md` and use a minimal local stub.
2. **i18n:** only my own files `src/i18n/<lang>/{core,home,alert,check}.json`. Never edit Device B's files (`map`, `assist`, `sos`, `me`, `authority`).
3. **Routes:** export my routes from `src/routes/a.routes.ts`. Add at most one import line to the shared router.
4. **Log progress** in `PLAN-A.md`, not `PLAN.md`.
5. **package.json:** add only needed deps, list them in each report. No reformatting, no upgrades.
6. **Commit small and often** on `fe-a`. Never force-push, never touch `main`.
7. **Everything else** in each task prompt stays as written: tests, verification, no invented data, honest fallbacks.
