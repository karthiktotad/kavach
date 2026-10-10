/**
 * App-level connectivity summary and outbox indicator.
 * The chip itself lives in the design system (`ui/StatusChip`).
 */
import { Icon } from './ui/Icon'
import { useLanguage } from '../store/language'
import { useConnectivity } from '../lib/connectivity'
import { formatAge } from '../lib/freshness'

export { StatusChip } from './ui/StatusChip'

export function ConnectionSummary() {
  const { t, locale } = useLanguage()
  const snapshot = useConnectivity()

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-ink text-[15px] font-semibold" aria-live="polite">
        {t(`status.${snapshot.level}.desc`)}
      </p>
      <p className="text-muted text-[15px]">
        {snapshot.lastLiveAt
          ? t('status.lastLiveValue', { age: formatAge(snapshot.lastLiveAt, locale) })
          : t('status.neverReached')}
      </p>
    </div>
  )
}

export function OutboxIndicator({ pending }: { pending: number }) {
  const { t } = useLanguage()
  if (pending <= 0) return null
  return (
    <span
      className="bg-drill-tint text-drill ring-drill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[15px] font-semibold ring-1"
      title={t('outbox.pending')}
    >
      <Icon name="bell" className="h-3.5 w-3.5" />
      {pending}
      <span className="sr-only">{t('outbox.pending')}</span>
    </span>
  )
}
