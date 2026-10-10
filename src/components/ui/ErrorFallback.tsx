import { translate } from '../../i18n'
import { readStoredLocale } from '../../store/language'
import { Icon } from './Icon'
import { Button } from './Button'

export interface ErrorFallbackProps {
  onRetry: () => void
  /** Component stack — shown only in development. */
  details?: string | null
}

/**
 * Last-resort UI after a render crash. Uses `translate` directly so it still
 * works if the language provider itself is what crashed.
 */
export function ErrorFallback({ onRetry, details }: ErrorFallbackProps) {
  const t = (key: string) => translate(readStoredLocale(), key)

  return (
    <div className="bg-ground mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-6 px-4 py-10">
      <div className="rounded-16 bg-surface p-5 ring-1 ring-line">
        <h1 className="text-xl font-bold text-ink">{t('error.title')}</h1>
        <p className="text-text-2 mt-2 text-[15px] leading-relaxed">{t('error.body')}</p>
        <Button className="mt-4 w-full" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Button href="#/alerts" variant="secondary" className="w-full">
          <Icon name="bell" className="h-6 w-6" />
          {t('error.alerts')}
        </Button>
        <Button href="#/aid" variant="danger" className="w-full">
          <Icon name="aid" className="h-6 w-6" />
          {t('error.aid')}
        </Button>
      </div>

      {import.meta.env.DEV && details ? (
        <details className="rounded-12 bg-surface-raised p-3 text-[12px] text-muted">
          <summary className="cursor-pointer font-semibold">{t('error.devDetail')}</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{details}</pre>
        </details>
      ) : null}
    </div>
  )
}
