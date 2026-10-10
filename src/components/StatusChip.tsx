/**
 * StatusChip — the always-visible connectivity indicator (core idea 3).
 *
 * Rule 6: never colour alone. Every state carries an icon AND text, and
 * severity also varies in lightness so it survives greyscale and glare.
 *
 * Tapping opens a bottom sheet explaining what actually works at this level.
 * That matters more than it looks: a user who does not know why the app has
 * stopped updating will assume it is broken and uninstall it.
 */
import { useState } from 'react'
import {
  IconAlerts,
  IconCellular,
  IconClose,
  IconMap,
  IconMe,
  IconOffline,
  IconRelay,
  IconSignalMedium,
  IconSignalStrong,
  type IconProps,
} from './icons'
import { useLanguage } from '../store/language'
import { useConnectivity, type ConnectivitySnapshot, type Level } from '../lib/connectivity'
import { formatAge } from '../lib/freshness'

interface ChipSpec {
  readonly labelKey: string
  readonly Icon: (p: IconProps) => React.ReactElement
  readonly className: string
}

const SPECS: Record<Level, ChipSpec> = {
  live: {
    labelKey: 'status.live',
    Icon: IconSignalStrong,
    className: 'bg-risk-0/15 text-risk-0 ring-risk-0/40',
  },
  degraded: {
    labelKey: 'status.degraded',
    Icon: IconSignalMedium,
    className: 'bg-risk-1/15 text-risk-1 ring-risk-1/40',
  },
  cellular: {
    labelKey: 'status.cellular',
    Icon: IconCellular,
    className: 'bg-info/15 text-info ring-info/40',
  },
  offline: {
    labelKey: 'status.offline',
    Icon: IconOffline,
    className: 'bg-surface-raised text-ink-muted ring-ink-subtle/40',
  },
  relay: {
    labelKey: 'status.relay',
    Icon: IconRelay,
    className: 'bg-risk-4/20 text-risk-3 ring-risk-4/50',
  },
}

/** What the user can still do at each rung. Shown in the sheet. */
const WORKS_AT: Record<Level, readonly string[]> = {
  live: ['works.all', 'works.maps', 'works.assistant'],
  degraded: ['works.all', 'works.cached'],
  cellular: ['works.sms', 'works.cached'],
  offline: ['works.cached', 'works.offlineMap', 'works.localOnly'],
  relay: ['works.sms', 'works.localOnly'],
}

/**
 * Plain-language summary of the current level, for surfaces that should not
 * repeat the chip itself (the header already owns the interactive button).
 */
export function ConnectionSummary() {
  const { t, locale } = useLanguage()
  const snapshot = useConnectivity()

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-ink text-sm font-semibold" aria-live="polite">
        {t(`status.${snapshot.level}.desc`)}
      </p>
      <p className="text-ink-muted text-xs">
        {snapshot.lastLiveAt
          ? t('status.lastLiveValue', { age: formatAge(snapshot.lastLiveAt, locale) })
          : t('status.neverReached')}
      </p>
    </div>
  )
}

export function StatusChip() {
  const { t, locale } = useLanguage()
  const [open, setOpen] = useState(false)
  const snapshot = useConnectivity()
  const spec = SPECS[snapshot.level]
  const Icon = spec.Icon

  // "Delayed — last updated 12 min ago" is more honest than a bare "Degraded".
  const ageLabel =
    snapshot.level === 'degraded' && snapshot.lastLiveAt !== null
      ? t('status.degradedAge', { age: formatAge(snapshot.lastLiveAt, locale) })
      : snapshot.level === 'offline' && snapshot.lastLiveAt !== null
        ? t('status.offlineAge', { age: formatAge(snapshot.lastLiveAt, locale) })
        : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('a11y.connectionStatus', { status: t(spec.labelKey) })}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${spec.className}`}
      >
        <Icon className="size-4 shrink-0" />
        <span>{t(spec.labelKey)}</span>
        {ageLabel ? <span className="font-normal opacity-90">· {ageLabel}</span> : null}
      </button>

      {open ? (
        <ConnectivitySheet
          snapshot={snapshot}
          onClose={() => setOpen(false)}
          worksKeys={WORKS_AT[snapshot.level]}
        />
      ) : null}
    </>
  )
}

function ConnectivitySheet({
  snapshot,
  onClose,
  worksKeys,
}: {
  snapshot: ConnectivitySnapshot
  onClose: () => void
  worksKeys: readonly string[]
}) {
  const { t, locale } = useLanguage()
  const Icon = SPECS[snapshot.level].Icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      // Clicking the backdrop closes; the sheet itself stops propagation.
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('status.sheetTitle')}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface mx-auto w-full max-w-2xl rounded-t-3xl p-5"
        style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
      >
        <div className="mb-4 flex items-center gap-3">
          <Icon className={`size-6 ${SPECS[snapshot.level].className.split(' ')[0]}`} />
          <h2 className="text-ink flex-1 text-lg font-bold">{t('status.sheetTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.close')}
            className="touch-target bg-surface-raised text-ink-muted rounded-full"
          >
            <IconClose className="size-5" />
          </button>
        </div>

        <p className="text-ink-muted text-sm leading-relaxed">
          {t(`status.${snapshot.level}.desc`)}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Stat
            label={t('status.lastLive')}
            value={snapshot.lastLiveAt ? formatAge(snapshot.lastLiveAt, locale) : t('status.never')}
          />
          <Stat
            label={t('status.latency')}
            value={snapshot.latencyMs === null ? '—' : `${snapshot.latencyMs} ms`}
          />
        </dl>

        <h3 className="text-ink mt-5 text-sm font-semibold">{t('status.whatWorks')}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {worksKeys.map((key) => (
            <li key={key} className="text-ink-muted flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className="bg-risk-0 mt-1.5 size-1.5 shrink-0 rounded-full"
              />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="touch-target bg-brand text-surface-sunken mt-5 w-full rounded-xl font-semibold"
        >
          {t('ui.close')}
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-raised ring-ink-subtle/20 rounded-xl px-3 py-2 ring-1">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-ink mt-0.5 font-semibold">{value}</dd>
    </div>
  )
}

/**
 * Small queue indicator.
 *
 * The user must be able to see that something is waiting to be sent, otherwise
 * a queued report is indistinguishable from a lost one.
 */
export function OutboxIndicator({ pending }: { pending: number }) {
  const { t } = useLanguage()
  if (pending <= 0) return null
  return (
    <span
      className="bg-warn/15 text-warn ring-warn/40 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
      title={t('outbox.pending')}
    >
      <IconAlerts className="size-3.5" />
      {pending}
      <span className="sr-only">{t('outbox.pending')}</span>
    </span>
  )
}

export { IconMap, IconMe }
