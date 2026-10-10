# DESIGN SYSTEM SPECIFICATION — Kavach

## TOKENS (Tailwind theme + src/styles/tokens.css; no hardcoded hex in components)

### Font
- **Atkinson Hyperlegible** 400/700 via @fontsource (works offline; disclose in DISCLOSURES.md)
- **Noto Sans Tamil** and **Noto Sans Devanagari** loaded only when ta/hi are selected; system fallbacks for other scripts
- Base: 17px / 1.35 line-height
- Min body text: 15px (only badges and map attribution may be smaller, never below 12px)

### Colours (CSS variables in `src/styles/tokens.css`)
| Variable | Value | Meaning |
|---|---|---|
| `--ink` | `#0B1F33` | Primary text |
| `--ground` | `#F4F6F8` | Page background |
| `--surface` | `#FFFFFF` | Card/surface bg |
| `--line` | `#D5DCE3` | Dividers |
| `--muted` | `#4A5B6C` | Secondary text |
| `--text-2` | `#2A3B4C` | High-contrast paragraph text |
| `--verified` | `#0B57A4` | Verified badge / primary action |
| `--verified-tint` | `#E6F0FA` | Verified zone tint |
| `--drill` | `#B45309` | Drill banner |
| `--drill-tint` | `#FFF1E0` | Drill zone tint |
| `--danger` | `#9B1C1C` | SOS / critical |
| `--danger-dark` | `#7A1212` | SOS / critical dark |
| `--live` | `#0F6B4F` | Live connection |
| `--live-text` | `#0A4D38` | Live connection text |
| `--live-tint` | `#DDF3EA` | Live zone tint |
| `--offline` | `#2B3A4C` | Offline chip bg |

### Semantics (never colour-alone)
- **blue** = verified and primary action (also distinguished by icon + text)
- **orange** = drill (also distinguished by icon + text)
- **dark red** = danger/SOS (also distinguished by icon + text)
- **green** = live connection (also distinguished by icon + text)
- **slate** = offline (also distinguished by icon + text)

All verified / risk / flagged / unverified must differ by **icon, text **and** shape** (filled vs outlined bars, hatched zones, dashed borders).

### Radii
- `10px`, `12px`, `14px`, `16px`

### Touch targets
- Min 44px (general)
- Main actions: 52–60px
- **SOS**: 72px

### Focus ring
- 3px `#0B57A4`, offset 2px
- Never removed via `:focus-visible { outline: none }`
- Honour `prefers-reduced-motion`

### One high-contrast light theme only

## COMPONENTS (src/components/ui; typed props, aria, one test each)

### Icon (inline SVG, stroke 2, round caps, aria-hidden unless labelled)
- **Set**: shield-check, globe, wifi, wifi-off, warning, waves, check-circle, pin, phone, chat, aid, bubbles, search-check, home, bell, map, user, speaker, share, qr, compass, layers, mic, send, copy, lock, info, chevron-left, download, camera, flag, clock
- **Pattern**: `<svg ... aria-hidden="true">...</svg>`; if labelled, omit `aria-hidden`

### Button (primary blue, secondary outline, danger, drill)
- **Sizes**: md (52px), lg (60px), xl (72px)
- **Loading/disabled** states
- **Renders `<a>`** when `href` prop provided
- ** aria-label** always present

### StatusChip (live|degraded|offline|relay + age)
- **Icon + text** combination
- **Opens a Sheet** explaining what works at that level
- Visible at all connectivity levels (AGENTS.md rule)

### VerifiedBadge
- Filled bar + "verified" text + check icon
- Differ from risk meter by shape + icon

### DrillBanner
- Orange background with drill text
- Distinct from verified banner by colour + icon

### RiskMeter (4 bars, filled vs outlined, plus words)
- 4 levels: NONE / LOW / MODERATE / HIGH / EXTREME
- **Filled** vs **outlined** variants for verified/unverified distinction
- Text label always present

### SeverityPill
- Coloured pill with level text

### UnverifiedTag (dashed)
- Distinguish from verified badge by border style

### SourceChip ("Based on: ...")
- Shows data source provenance

### Card
- Standard card component with radii

### Sheet (bottom sheet, focus trap, Esc)
- Modal bottom sheet
- Focus trap managed
- Esc key to close

### ChipGroup (aria-pressed)
- Toggle group with accessible state

### StepList (large numbered steps)
- Numbered navigation steps

### BottomNav (Home, Alerts, Map, Assist, Me)
- `aria-current` for active page
- Responsive with PhoneShell

### AppHeader (back, title, StatusChip, language button)
- Back button, page title, status chip, locale selector

### EmptyState
- Illustrated empty state with message

### ErrorFallback
- Graceful error recovery UI

### Layout
- **PhoneShell**: max-width 480px, centred on desktop, full-bleed on phones
- Safe-area padding via `env()` (notch compensation)
- Skip links for keyboard navigation

## i18n AND RTL
- **All strings via `t()`** — add the `ui.*` keys these screens need
- **dir=rtl** for Arabic using logical CSS properties (`margin-inline-start`, etc.)
- **Mirror chevrons** and directional icons in RTL mirror
- Language selector cycles through: en → ta → hi → ar → en (or configured locales)

## VERIFY
- **Unit + axe tests per component** (zero violations)
- **Dev-only route `/dev/ui`** (only when `import.meta.env.DEV`; prove it is absent from the production build with a `grep`)
- Show every component in every state at 100% and 200% text size
- **In RTL** — verify mirroring and logical property usage
- Run `typecheck`, `lint`, `tests`, `build`; report first-route bundle size
- Commit, update `PLAN.md`, stop (continue later)

## SEED FILES
- `scripts/seed-from-pack.ts` regenerates `supabase/seed.sql` from content pack
- All rows written with `verified = false` (Rule 7)
- Authority user instructions at bottom of seed.sql