/**
 * Bottom navigation — the primary wayfinding for a possibly panicking tourist.
 *
 * Rule 6: large touch targets (48px+), icon + visible label, safe-area aware so
 * it clears the iOS home bar, and logical (start/end) positioning so it mirrors
 * correctly under RTL.
 *
 * Five primary destinations fit a thumb comfortably; the rest live on /me.
 */
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../store/language'
import { IconAid, IconAlerts, IconAssist, IconHome, IconMap, type IconProps } from './icons'

interface NavItem {
  readonly to: string
  readonly labelKey: string
  readonly Icon: (p: IconProps) => React.ReactElement
  /** Extra semantics for screen readers, e.g. "3 active alerts". */
  readonly end?: boolean
}

const ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.home', Icon: IconHome, end: true },
  { to: '/alerts', labelKey: 'nav.alerts', Icon: IconAlerts },
  { to: '/map', labelKey: 'nav.map', Icon: IconMap },
  { to: '/assist', labelKey: 'nav.assist', Icon: IconAssist },
  { to: '/aid', labelKey: 'nav.aid', Icon: IconAid },
]

export function BottomNav() {
  const { t } = useLanguage()

  return (
    <nav
      aria-label={t('a11y.navigation')}
      className="border-ink-subtle/20 bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-1">
        {ITEMS.map(({ to, labelKey, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-(--nav-height) w-full flex-col items-center justify-center gap-1',
                  'text-[0.7rem] font-semibold transition-colors',
                  isActive ? 'text-brand-strong' : 'text-ink-muted',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-6" />
                  <span>{t(labelKey)}</span>
                  {/* Active state also carries a shape cue, not colour alone. */}
                  <span
                    aria-hidden="true"
                    className={`h-0.5 w-6 rounded-full ${isActive ? 'bg-brand-strong' : 'bg-transparent'}`}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
