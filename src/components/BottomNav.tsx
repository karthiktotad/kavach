/**
 * Bottom navigation — Home, Alerts, Map, Assist, Me (DESIGN_SPEC).
 *
 * Large touch targets, icon + visible label, safe-area aware, logical
 * positioning so it mirrors under RTL. `aria-current` comes from NavLink.
 */
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../store/language'
import { Icon, type IconName } from './ui/Icon'

interface NavItem {
  readonly to: string
  readonly labelKey: string
  readonly icon: IconName
  readonly end?: boolean
}

const ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/alerts', labelKey: 'nav.alerts', icon: 'bell' },
  { to: '/map', labelKey: 'nav.map', icon: 'map' },
  { to: '/assist', labelKey: 'nav.assist', icon: 'bubbles' },
  { to: '/me', labelKey: 'nav.me', icon: 'user' },
]

export function BottomNav() {
  const { t } = useLanguage()

  return (
    <nav
      aria-label={t('a11y.navigation')}
      className="border-line bg-surface/95 sticky bottom-0 z-30 border-t backdrop-blur-md"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="flex items-stretch justify-between px-1">
        {ITEMS.map(({ to, labelKey, icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-(--nav-height) w-full flex-col items-center justify-center gap-1',
                  'text-[12px] font-semibold',
                  isActive ? 'text-verified' : 'text-muted',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} className="h-6 w-6" />
                  <span>{t(labelKey)}</span>
                  <span
                    aria-hidden="true"
                    className={`h-0.5 w-6 rounded-full ${isActive ? 'bg-verified' : 'bg-transparent'}`}
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
