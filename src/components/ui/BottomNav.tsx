/**
 * BottomNav — the five primary destinations, and the only persistent chrome.
 *
 * From docs/DESIGN_SPEC.md. The rules that are not visual:
 *
 *   - `aria-current` comes from NavLink, so the active destination is announced
 *     rather than merely coloured. Colour is never the only signal (rule 6).
 *   - Logical properties throughout (`ms-*`, `ps-*`, `border-t`), so the bar
 *     mirrors under `dir="rtl"` with no second stylesheet.
 *   - Safe-area padding via `env()`. A fixed bar with no inset sits under the
 *     iOS home indicator and the last item becomes untappable on exactly the
 *     phones most likely to be held one-handed during a flood.
 *   - Icon AND visible label on every item. 44px minimum, larger in practice.
 *
 * Ownership note: this is the FE-1 component under src/components/ui. The M1
 * version at src/components/BottomNav.tsx is not owned by Device A; see
 * docs/HANDOFF_A.md.
 */
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export interface NavItem {
  readonly to: string
  readonly labelKey: string
  readonly icon: IconName
  /** Exact match — "home" must not stay active while on /home/anything. */
  readonly end?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/alerts', labelKey: 'nav.alerts', icon: 'bell' },
  { to: '/map', labelKey: 'nav.map', icon: 'map' },
  { to: '/assist', labelKey: 'nav.assist', icon: 'bubbles' },
  { to: '/me', labelKey: 'nav.me', icon: 'user' },
]

export interface BottomNavProps {
  /** Defaults to the standard five. Overridable for the design-system gallery. */
  items?: readonly NavItem[]
  /** i18n lookup. */
  t: (key: string) => string
  /** Accessible name for the <nav> landmark. */
  label?: string
}

export function BottomNav({ items = NAV_ITEMS, t, label }: BottomNavProps) {
  return (
    <nav
      aria-label={label ?? t('a11y.navigation')}
      className="
        fixed inset-x-0 bottom-0 z-30
        border-t border-line bg-surface
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <ul className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                [
                  // 44px min height is the a11y floor; this is 56px so the
                  // label never wraps on a narrow phone.
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2',
                  'text-center text-[13px] font-bold no-underline',
                  'focus-visible:outline focus-visible:outline-[3px]',
                  'focus-visible:outline-verified focus-visible:outline-offset-[-3px]',
                  'motion-reduce:transition-none',
                  // Two signals for "active": weight AND colour. Never colour
                  // alone — a colour-blind tourist must still see where they are.
                  isActive ? 'text-verified' : 'text-muted',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    className={['h-6 w-6', isActive ? 'stroke-[3]' : ''].join(' ')}
                  />
                  <span>{t(item.labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}