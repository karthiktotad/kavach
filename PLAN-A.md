# PLAN-A.md — Device A (fe-a branch) Progress Log

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

Device A owns:
- `src/components/ui`
- `src/styles`
- `src/lib/permissions.ts`
- `src/pages/home`
- `src/pages/ready`
- `src/pages/alerts`
- `src/pages/alert-detail`
- `src/pages/scan`
- `src/pages/check`
- the manifest (incl. share_target)
- `docs/DESIGN_SPEC.md`

---

## FE-1 — Design System and App Shell

- [x] Create PARALLEL_A.md
- [x] Create PLAN-A.md
- [x] Write DESIGN_SPEC.md (already exists, matches spec)
- [x] Add pointer to PARALLEL_A.md in AGENTS.md (already exists at line 161)
- [x] Build tokens (Tailwind theme + src/styles/tokens.css)
- [x] Build Icon component (inline SVG, stroke 2, round caps, aria-hidden)
- [x] Build Button component (primary, secondary, danger, drill; sizes md/lg/xl)
- [x] Build StatusChip component (live|degraded|offline|relay + age)
- [x] Build VerifiedBadge component
- [x] Build DrillBanner component
- [x] Build RiskMeter component (4 bars, filled vs outlined)
- [x] Build SeverityPill component
- [x] Build UnverifiedTag component (dashed)
- [x] Build SourceChip component
- [x] Build Card component
- [x] Build Sheet component (bottom sheet, focus trap, Esc)
- [x] Build ChipGroup component (aria-pressed)
- [x] Build StepList component (large numbered steps)
- [x] Build BottomNav component (Home, Alerts, Map, Assist, Me; aria-current)
- [x] Build AppHeader component (back, title, StatusChip, language button)
- [x] Build EmptyState component
- [x] Build ErrorFallback component
- [x] Build PhoneShell layout (max-width 480, safe-area padding)
- [x] Add i18n keys for UI components (src/i18n/<lang>/core.json)
- [x] Write unit + axe tests for each component (zero violations)
- [x] Create dev-only route /dev/ui (import.meta.env.DEV only)
- [x] Show every component in every state at 100% and 200% text
- [x] Show every component in RTL
- [x] Verify /dev/ui is absent from production build (grep)
- [x] Run typecheck, lint, tests, build
- [x] Report first-route bundle size: 458.03 kB (index-Cb5mwMd_.js)
- [x] Commit, update PLAN-A.md, push fe-a

---

## FE-2 — Home Page

- [x] Build Home page using design system components
- [x] Add i18n keys (home risk/alert promise strings and supporting locale content)
- [x] Write tests
- [x] Verify

---

## FE-3 — Ready Page

- [x] Build Ready page using design system components
- [x] Add i18n keys (ready strings in the shared locale bundle per rules)
- [x] Write tests
- [x] Verify

---

## FE-4 — Alerts Page

- [x] Build Alerts page using design system components
- [x] Add i18n keys (src/i18n/<lang>/alert.json)
- [x] Write tests
- [x] Verify

---

## FE-5 — Alert Detail Page

- [x] Build Alert Detail page using design system components
- [x] Add i18n keys (src/i18n/<lang>/alert.json)
- [x] Write tests
- [x] Verify

---

## FE-6 — Scan Page

- [x] Build Scan page using design system components
- [x] Add i18n keys (src/i18n/<lang>/check.json)
- [x] Write tests
- [x] Verify

---

## FE-7 — Check Page

- [ ] Build Check page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/check.json)
- [ ] Write tests
- [ ] Verify

---

## FE-8 — Permissions Module

- [x] Build src/lib/permissions.ts
- [x] Write tests
- [x] Verify

---

## FE-9 — Manifest Updates

- [ ] Update manifest with share_target
- [ ] Verify
