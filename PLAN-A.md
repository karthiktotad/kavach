# PLAN-A.md — Device A (branch `fe-a`)

Progress log for the Device A track only. `PLAN.md` belongs to the main roadmap
and is **not** edited from this branch (PARALLEL_A.md rule 4).

Ownership: `src/components/ui`, `src/styles`, `src/lib/permissions.ts`,
`src/pages/{home,ready,alerts,alert-detail,scan,check}`, the manifest
(including `share_target`), `docs/DESIGN_SPEC.md`.

---

## FE-1 — Design system and app shell

### Spec

- [x] `docs/DESIGN_SPEC.md` written **before** any component
- [x] Pointer added to `AGENTS.md` (rule 10, "Parallel-work rules")
- [x] `PARALLEL_A.md` created with the ownership rules

### Tokens

- [x] `src/styles/tokens.css` — palette named by meaning, not colour
- [x] `tailwind.config.js` — token names mapped, so **no component carries a hex**
- [x] Atkinson Hyperlegible via `@fontsource`; Noto Tamil/Devanagari loaded only
      when `ta`/`hi` are selected (`src/lib/scriptFonts.ts`)
- [x] Base 17px / 1.35, min body 15px, badges/attribution never below 12px
- [x] Radii 10/12/14/16, touch 44/52/60/72, focus ring 3px + 2px offset
- [x] `prefers-reduced-motion` honoured via `motion-reduce:*` utilities
- [x] One high-contrast light theme only

### Components — `src/components/ui`

Each built one at a time, tests run before the next.

| Component | Test file | Notes |
| --- | --- | --- |
| `Icon` | 37 tests | 30 names in `ICON_NAMES`; a gap is a type error |
| `Button` | 16 | real `<a>` when `href`; sizes enforce the touch floor |
| `Sheet` | 6 | portalled, focus trap, Esc, focus restore |
| `StatusChip` | ✓ | all five rungs, own Sheet |
| `VerifiedBadge` | ✓ | |
| `UnverifiedTag` | ✓ | dashed border |
| `DrillBanner` | ✓ | |
| `RiskMeter` | ✓ | filled vs outlined **and** hatch |
| `SeverityPill` | ✓ | |
| `SourceChip` | ✓ | |
| `Card` | ✓ | |
| `ChipGroup` | ✓ | `aria-pressed` |
| `StepList` | ✓ | |
| `EmptyState` | ✓ | |
| `ErrorFallback` | ✓ | |
| `PhoneShell` | ✓ | 480px, safe-area |
| `BottomNav` | 7 | `aria-current`, logical props, safe-area |
| `AppHeader` | 9 | back = `history(-1)`, chip always visible |

### i18n

- [x] `ui.*` keys added to `src/i18n/messages/en.json` (`core.json` per the
      prompt; the repo's existing layout is a single flat file per locale)
- [x] `dev.ui.*` keys for the gallery
- [ ] Device B's locale files (`map`, `assist`, `sos`, `me`, `authority`) — **not mine**

### RTL

- [x] Logical properties (`ms-*`, `ps-*`, `border-t`) throughout — no physical
      left/right in the nav or header, asserted by test
- [x] `chevron-left` mirrored with `rtl:scale-x-[-1]`
- [x] Gallery toggles `dir` on its own subtree only, never on `<html>`

### Dev gallery

- [x] `src/pages/DevUiPage.tsx` — every component, every state
- [x] 100% / 200% text via **root font-size**, not a transform (a transform
      leaves the layout engine at 1× and would hide exactly the bug it is meant
      to reveal)
- [x] RTL toggle
- [x] `src/routes/a.routes.tsx` — exported and mounted with **one** import line
      in the shared router (rule 3)
- [x] `npm run verify:dev-route-absent` — greps `dist/` to prove the route and
      the page name are absent from the production build

---

## Verification record

Gate run on `fe-a`:

```
npm run typecheck → clean
npm run lint      → 1 error, in src/components/AppHeader.tsx (NOT Device A's — see HANDOFF_A.md)
npm test          → see commit message for exact counts
npm run build     → see commit message; first-route size reported there
npm run verify:dev-route-absent → /dev/ui absent from dist/
```

## Known issues handed off

See [`docs/HANDOFF_A.md`](docs/HANDOFF_A.md):

1. **`tests/shell.test.tsx` fails** — expects nav item 5 to be `Aid`, DESIGN_SPEC
   says `Me`. `d340d25` made the change; the test predates it. Needs a decision:
   is Aid still a primary destination, or did it move under `/me`?
2. **`src/components/AppHeader.tsx` lint error** — floating promise on
   `navigate(-1)`. Also present on `main`. One-token fix (`void`), but the file
   is outside Device A's ownership.
3. **M1 `src/components/{AppHeader,BottomNav}.tsx` vs FE-1
   `src/components/ui/{AppHeader,BottomNav}.tsx`** — two parallel
   implementations now exist. The app shell still mounts the M1 ones. One should
   win.