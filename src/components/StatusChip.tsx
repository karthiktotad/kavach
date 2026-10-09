/**
 * StatusChip — the always-visible connectivity-ladder indicator (core idea 3).
 *
 * M1 STUB: renders a hardcoded "Live". The chip is already wired to the real
 * `ConnectivityState` type, so M3 only replaces `useConnectivity()` — no
 * markup churn.
 *
 * Design constraints (rule 6):
 * - Never colour-only: icon + text label always.
 * - Announced politely to screen readers, since it changes without user action.
 * - Large enough to tap (it also opens the connection details sheet in M3).
 */
import type { ConnectivityLevel, ConnectivityState } from '../store/connectivity'
import { STUB_CONNECTIVITY } from '../store/connectivity'
import { useLanguage } from '../store/language'
import {
  IconCellular,
  IconOffline,
  IconRelay,
  IconSignalMedium,
  IconSignalStrong,
  type IconProps,
} from './icons'

/** i18n key for each rung's short label. */
const LEVEL_LABEL_KEY: Record<ConnectivityLevel, string> = {
  live: 'status.live',
  degraded: 'status.degraded',
  cellular: 'status.cellular',
  offline: 'status.offline',
  relay: 'status.relay',
}

/** i18n key for each rung's explanation (long description / sheet body). */
export const LEVEL_DESC_KEY: Record<ConnectivityLevel, string> = {
  live: 'status.live.desc',
  degraded: 'status.degraded.desc',
  cellular: 'status.cellular.desc',
  offline: 'status.offline.desc',
  relay: 'status.relay.desc',
}

const ICONS: Record<ConnectivityLevel, (p: IconProps) => React.ReactElement> = {
  live: IconSignalStrong,
  degraded: IconSignalMedium,
  cellular: IconCellular,
  offline: IconOffline,
  relay: IconRelay,
}

/** Tailwind classes per rung. Severity is also conveyed by the icon + label. */
const LEVEL_STYLES: Record<ConnectivityLevel, string> = {
  live: 'bg-risk-0/15 text-risk-0 ring-risk-0/40',
  degraded: 'bg-risk-1/15 text-risk-1 ring-risk-1/40',
  cellular: 'bg-info/15 text-info ring-info/40',
  offline: 'bg-surface-raised text-ink-muted ring-ink-subtle/40',
  relay: 'bg-risk-4/20 text-risk-3 ring-risk-4/50',
}

export interface StatusChipProps {
  /** Defaults to the M1 stub state. */
  state?: ConnectivityState
  /** Renders the longer description under the label. */
  showDetail?: boolean
  className?: string
}

export function StatusChip({
  state = STUB_CONNECTIVITY,
  showDetail = false,
  className,
}: StatusChipProps) {
  const { t } = useLanguage()
  const { level } = state
  const Icon = ICONS[level]
  const label = t(LEVEL_LABEL_KEY[level])
  const description = t(LEVEL_DESC_KEY[level])

  return (
    <div
      className={className}
      // aria-live: the ladder can change on its own (tunnel, tower handover).
      role="status"
      aria-live="polite"
      aria-label={t('a11y.connectionStatus', { status: label })}
    >
      <div
        data-level={level}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${LEVEL_STYLES[level]}`}
      >
        <Icon className="size-4 shrink-0" />
        <span>{label}</span>
      </div>
      {showDetail ? (
        <p className="text-ink-muted mt-1.5 max-w-[16rem] text-xs leading-relaxed">{description}</p>
      ) : (
        <span className="sr-only">{description}</span>
      )}
    </div>
  )
}
