/**
 * Top bar header for Authority Console.
 * Visual rules: Dark ink background, prominent mode chip tracking the wizard state,
 * authority badge, and sign-out controls.
 */
import { Icon } from '../../components/ui'
import type { PacketMode } from '../../../shared/packet'

export interface AuthorityHeaderProps {
  readonly mode: PacketMode
  readonly isDemo: boolean
  readonly onSignOut: () => void
}

export function AuthorityHeader({ mode, isDemo, onSignOut }: AuthorityHeaderProps) {
  const isDrill = mode === 'D'

  return (
    <header className="sticky top-0 z-40 bg-ink text-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 max-w-7xl mx-auto">
        {/* Left: Brand & Console Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-10 bg-verified/20 border border-verified/40 text-verified">
            <Icon name="shield-check" className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight">Kavach</span>
              <span className="text-xs font-semibold text-slate-300">Authority Console</span>
            </div>
            <span className="text-[11px] font-medium text-slate-400 block leading-none">
              Tamil Nadu Disaster Management Authority (TNDMA)
            </span>
          </div>
        </div>

        {/* Center/Right: Dynamic Mode Chip & Status */}
        <div className="flex items-center gap-3">
          {/* Dynamic Mode Chip */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
              isDrill
                ? 'bg-drill text-white shadow-sm ring-2 ring-drill/40'
                : 'bg-danger text-white shadow-sm ring-2 ring-danger/40 animate-pulse'
            }`}
            data-testid="authority-mode-chip"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-white" />
            <span>{isDrill ? 'DRILL MODE · 演習' : 'LIVE BROADCAST'}</span>
          </div>

          {/* User Role Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-8 bg-slate-800/80 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200">
            <Icon name="user" className="h-3.5 w-3.5 text-verified" />
            <span>{isDemo ? 'Judge Demo Access (Drill-Only)' : 'Signed in · Authority role'}</span>
          </div>

          {/* Sign out */}
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-8 border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            data-testid="authority-signout-btn"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
