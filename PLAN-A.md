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
- [ ] Write DESIGN_SPEC.md (if not exists)
- [ ] Add pointer to PARALLEL_A.md in AGENTS.md (already exists at line 161)
- [ ] Build tokens (Tailwind theme + src/styles/tokens.css)
- [ ] Build Icon component (inline SVG, stroke 2, round caps, aria-hidden)
- [ ] Build Button component (primary, secondary, danger, drill; sizes md/lg/xl)
- [ ] Build StatusChip component (live|degraded|offline|relay + age)
- [ ] Build VerifiedBadge component
- [ ] Build DrillBanner component
- [ ] Build RiskMeter component (4 bars, filled vs outlined)
- [ ] Build SeverityPill component
- [ ] Build UnverifiedTag component (dashed)
- [ ] Build SourceChip component
- [ ] Build Card component
- [ ] Build Sheet component (bottom sheet, focus trap, Esc)
- [ ] Build ChipGroup component (aria-pressed)
- [ ] Build StepList component (large numbered steps)
- [ ] Build BottomNav component (Home, Alerts, Map, Assist, Me; aria-current)
- [ ] Build AppHeader component (back, title, StatusChip, language button)
- [ ] Build EmptyState component
- [ ] Build ErrorFallback component
- [ ] Build PhoneShell layout (max-width 480, safe-area padding)
- [ ] Add i18n keys for UI components (src/i18n/<lang>/core.json)
- [ ] Write unit + axe tests for each component (zero violations)
- [ ] Create dev-only route /dev/ui (import.meta.env.DEV only)
- [ ] Show every component in every state at 100% and 200% text
- [ ] Show every component in RTL
- [ ] Verify /dev/ui is absent from production build (grep)
- [ ] Run typecheck, lint, tests, build
- [ ] Report first-route bundle size
- [ ] Commit, update PLAN-A.md, push fe-a

---

## FE-2 — Home Page

- [ ] Build Home page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/home.json)
- [ ] Write tests
- [ ] Verify

---

## FE-3 — Ready Page

- [ ] Build Ready page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/ready.json - merged into core.json per rules)
- [ ] Write tests
- [ ] Verify

---

## FE-4 — Alerts Page

- [ ] Build Alerts page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/alert.json)
- [ ] Write tests
- [ ] Verify

---

## FE-5 — Alert Detail Page

- [ ] Build Alert Detail page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/alert.json)
- [ ] Write tests
- [ ] Verify

---

## FE-6 — Scan Page

- [ ] Build Scan page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/check.json)
- [ ] Write tests
- [ ] Verify

---

## FE-7 — Check Page

- [ ] Build Check page using design system components
- [ ] Add i18n keys (src/i18n/<lang>/check.json)
- [ ] Write tests
- [ ] Verify

---

## FE-8 — Permissions Module

- [ ] Build src/lib/permissions.ts
- [ ] Write tests
- [ ] Verify

---

## FE-9 — Manifest Updates

- [ ] Update manifest with share_target
- [ ] Verify
