# HANDOFF_A — needs from outside Device A's folders

PARALLEL_A.md rule 1: Device A must not edit files outside its own. Everything
below is **blocked on a decision or an owner's edit**, not on analysis. Each item
states the exact change so it is a two-minute job for whoever owns the file.

---

## 1. `tests/shell.test.tsx` — failing, needs a product decision

**Symptom**

```
FAIL tests/shell.test.tsx > app shell > renders all five bottom-nav destinations
Expected element to have text content: /aid/i
Received: HomeAlertsMapAssistMe
```

**Cause** — not a bug in either file; the two disagree about the product.

- `tests/shell.test.tsx` (written at M1, last touched at M3) asserts the nav
  contains `Home / Alerts / Map / Assist / **Aid**`.
- `docs/DESIGN_SPEC.md` (FE-1) specifies `BottomNav (Home, Alerts, Map, Assist,
  **Me**; aria-current)`.
- Commit `d340d25` followed DESIGN_SPEC and changed nav item 5 from `/aid` to
  `/me`, which broke the M1 test.

**This is a real product question, not a stale assertion.** Both `/aid` and `/me`
routes exist and both are reachable. Only one can be the fifth primary
destination.

**Options**

| Option | Change | Consequence |
| --- | --- | --- |
| A. Keep `Me` (DESIGN_SPEC wins) | update the M1 assertion to `/me/i` | Aid stays reachable but only under Me |
| B. Keep `Aid` (M1 wins) | revert nav item 5, amend DESIGN_SPEC | Me becomes secondary |
| C. Six items | change both files | crowded on a narrow phone; DESIGN_SPEC says five |

**Device A's recommendation: A.** The FE-1 spec is the more recent statement of
intent, `Me` is the better home for the growing settings/medical-ID surface, and
Aid remains reachable. But this is a call for whoever owns the product, so
Device A has not touched either file.

**Owner:** whoever owns `tests/` + `docs/DESIGN_SPEC.md` jointly.
**Blocked:** the test suite stays red until this is decided.

---

## 2. `src/components/AppHeader.tsx` — lint error, one-token fix

**Symptom**

```
src/components/AppHeader.tsx
  42:46  error  Promises must be awaited, end with a call to .catch … or be
                explicitly marked as ignored with the `void` operator
  @typescript-eslint/no-floating-promises
```

**Cause** — `void` was applied to one branch of a ternary and not the other:

```tsx
onClick={() => {
  if (window.history.length > 1) navigate(-1)   // ← missing void
  else void navigate('/')                        // ← has it
}}
```

**Fix**

```diff
-  if (window.history.length > 1) navigate(-1)
+  if (window.history.length > 1) void navigate(-1)
```

**This is Device A's own regression**, introduced in `d340d25`, and it is
**also on `main`** — so it is not caused by anything on this branch. The file is
outside Device A's ownership, so it has been left alone rather than fixed
unilaterally.

**Effect:** `npm run lint` is red on `fe-a` for this one line. Everything else
is clean.

**Owner:** owner of `src/components/` (non-`ui`).

---

## 3. Two parallel `AppHeader` / `BottomNav` implementations

**Symptom**

| Path | Origin | Used by |
| --- | --- | --- |
| `src/components/{AppHeader,BottomNav}.tsx` | M1/M3 | **the live app shell** (`src/app/routes.tsx`) |
| `src/components/ui/{AppHeader,BottomNav}.tsx` | FE-1 | only the design-system gallery |

Both work. The app has drifted into having two of each, which is exactly the
failure the design system exists to prevent.

**Needed:** a decision to retire one. If the `ui/` versions win,
`src/app/routes.tsx` must switch its two imports (it already imports `ARoutes`
from Device A, so this is the natural moment).

**Not done here** because `src/app/routes.tsx` also hosts Device B's routes and
`src/components/` root files are not Device A's. Changing which AppHeader the
whole app renders is a product-level call, not a refactor to slip into a
component PR.

**Owner:** integrator, at merge time.

---

## 4. `Check a message` translation is intentionally stubbed

**Status** — intentional for this Device A branch.

The FE-4 rumor checker is offline-first and must work with no internet. During a relay/offline state it shows a deterministic keyword-only summary and the UI text is `Offline: key words only` rather than claiming a machine translation was generated.

This is the correct safe fallback until the assistant translation path is merged into the product flow. The user prompt is still translated locally only in the keyword-extraction sense; no safety-critical information is fabricated, and the result is never presented as an authoritative claim.

**Owner:** Device A, for this branch; the online LLM translation path remains a future integration without a product promise yet.