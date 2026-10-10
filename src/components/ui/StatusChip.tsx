/**
 * StatusChip — always-visible connectivity indicator (core idea 3).
 *
 * Icon + text + (optional) age. Tapping opens a Sheet that says what still
 * works at this rung, so a tourist does not uninstall a "broken" app.
 */
import { useState } from 'react'
import { useLanguage } from '../../store/language'
import { useConnectivity, type Level } from '../../lib/connectivity'
import { formatAge } from '../../lib/freshness'
import { Icon, type IconName } from './Icon'
import { Sheet } from './Sheet'

export type StatusLevel = Level

interface ChipSpec {
  readonly labelKey: string
  readonly icon: IconName
  readonly className: string
}

const SPECS: Record<StatusLevel, ChipSpec> = {
  live: {
    labelKey: 'status.live',
    icon: 'wifi',
    className: 'bg-live-tint text-live-text ring-live',
  },
  degraded: {
    labelKey: 'status.degraded',
    icon: 'warning',
    className: 'bg-drill-tint text-drill ring-drill',
  },
  cellular: {
    labelKey: 'status.cellular',
    icon: 'phone',
    className: 'bg-verified-tint text-verified ring-verified',
  },
  offline: {
    labelKey: 'status.offline',
    icon: 'wifi-off',
    className: 'bg-offline text-white ring-offline',
  },
  relay: {
    labelKey: 'status.relay',
    icon: 'share',
    className: 'bg-surface text-offline ring-2 ring-offline',
  },
}

const WORKS_AT: Record<StatusLevel, readonly string[]> = {
  live: ['works.all', 'works.maps', 'works.assistant'],
  degraded: ['works.all', 'works.cached'],
  cellular: ['works.sms', 'works.cached'],
  offline: ['works.cached', 'works.offlineMap', 'works.localOnly'],
  relay: ['works.sms', 'works.localOnly'],
}

export interface StatusChipProps {
  /** Override the live detector — used by the gallery and tests. */
  level?: StatusLevel
  age?: string | null
}

export function StatusChip({ level: levelOverride, age: ageOverride }: StatusChipProps = {}) {
  const { t, locale } = useLanguage()
  const [open, setOpen] = useState(false)
  const snapshot = useConnectivity()
  const level = levelOverride ?? snapshot.level
  const spec = SPECS[level]

  const age =
    ageOverride !== undefined
      ? ageOverride
      : level === 'degraded' && snapshot.lastLiveAt !== null
        ? t('status.degradedAge', { age: formatAge(snapshot.lastLiveAt, locale) })
        : level === 'offline' && snapshot.lastLiveAt !== null
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
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-semibold ring-1 ${spec.className}`}
      >
        <Icon name={spec.icon} className="h-4 w-4 shrink-0" />
        <span>{t(spec.labelKey)}</span>
        {age ? <span className="font-normal opacity-90">· {age}</span> : null}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('status.sheetTitle')}
        closeLabel={t('ui.close')}
      >
        <p className="text-text-2 text-[15px] leading-relaxed">{t(`status.${level}.desc`)}</p>
        <h3 className="text-ink mt-2 text-[15px] font-semibold">{t('status.whatWorks')}</h3>
        <ul className="flex flex-col gap-2">
          {WORKS_AT[level].map((key) => (
            <li key={key} className="text-text-2 flex items-start gap-2 text-[15px]">
              <Icon name="check-circle" className="text-live mt-0.5 h-4 w-4 shrink-0" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
