/**
 * Desktop-first navigation sidebar for Authority Console (220px).
 * Stacks into a horizontal wrap on mobile/tablet viewports (usable at 768px).
 */
import { Icon } from '../../components/ui'
import type { AuthorityNavTab } from './types'

export interface AuthoritySidebarProps {
  readonly activeTab: AuthorityNavTab
  readonly onSelectTab: (tab: AuthorityNavTab) => void
  readonly activeAlertsCount: number
  readonly reportsCount: number
}

interface NavItem {
  readonly id: AuthorityNavTab
  readonly label: string
  readonly iconName: 'flag' | 'bell' | 'clock' | 'waves' | 'check-circle'
  readonly badge?: number
  readonly badgeColor?: string
}

export function AuthoritySidebar({
  activeTab,
  onSelectTab,
  activeAlertsCount,
  reportsCount,
}: AuthoritySidebarProps) {
  const items: readonly NavItem[] = [
    { id: 'create', label: 'Create alert', iconName: 'flag' },
    {
      id: 'active',
      label: 'Active alerts',
      iconName: 'bell',
      badge: activeAlertsCount > 0 ? activeAlertsCount : undefined,
      badgeColor: 'bg-danger text-white',
    },
    { id: 'history', label: 'History', iconName: 'clock' },
    {
      id: 'reports',
      label: 'Community reports',
      iconName: 'waves',
      badge: reportsCount > 0 ? reportsCount : undefined,
      badgeColor: 'bg-drill text-white',
    },
    { id: 'checkins', label: 'Check-ins', iconName: 'check-circle' },
  ]

  return (
    <nav
      aria-label="Authority Console Navigation"
      className="w-full md:w-[220px] shrink-0 space-y-1 bg-surface rounded-16 border border-line p-2 md:p-3 shadow-sm"
    >
      <div className="flex md:flex-col flex-wrap gap-1">
        {items.map((item) => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center justify-between gap-2 w-full rounded-10 px-3 py-2.5 text-xs font-bold transition-all text-left ${
                isActive
                  ? 'bg-verified text-white shadow-sm'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
              }`}
              data-testid={`authority-nav-${item.id}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 truncate">
                <Icon
                  name={item.iconName}
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-ink-muted'}`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-extrabold ${
                    isActive ? 'bg-white text-verified' : item.badgeColor ?? 'bg-surface-sunken text-ink'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
