/**
 * Non-blocking "update available" banner.
 *
 * We never auto-reload. An unexpected reload during a flood is worse than
 * being slightly out of date, so the user chooses — and "later" is the
 * default position of the button.
 */
import { useLanguage } from '../store/language'

export interface UpdateBannerProps {
  /** A new service worker is waiting. */
  readonly serviceWorkerReady: boolean
  /** A newer content pack is available. */
  readonly packUpdateReady: boolean
  /** Activate the waiting service worker. */
  readonly onApplyServiceWorker: () => void
  /** Download the newer pack. */
  readonly onApplyPack: () => void
  readonly onDismiss: () => void
}

export function UpdateBanner(props: UpdateBannerProps) {
  const { t } = useLanguage()
  const { serviceWorkerReady, packUpdateReady } = props
  if (!serviceWorkerReady && !packUpdateReady) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-brand/30 bg-brand/10 sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b px-4 py-2"
    >
      <p className="text-ink min-w-0 flex-1 text-xs leading-snug">
        <span className="font-semibold">{t('update.available')}</span>{' '}
        <span className="text-ink-muted">{t('update.body')}</span>
      </p>

      <div className="flex items-center gap-2">
        {serviceWorkerReady ? (
          <button
            type="button"
            onClick={props.onApplyServiceWorker}
            className="touch-target bg-brand text-surface-sunken rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            {t('update.now')}
          </button>
        ) : null}
        {packUpdateReady ? (
          <button
            type="button"
            onClick={props.onApplyPack}
            className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1"
          >
            {t('ready.download')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={props.onDismiss}
          className="touch-target text-ink-muted px-2 text-xs"
        >
          {t('update.later')}
        </button>
      </div>
    </div>
  )
}
