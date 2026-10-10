/**
 * LanguageSelector — M1 stub.
 *
 * Shows the current language as a labelled button with the endonym (never the
 * English name of the language). Opens a native `<select>` for now; the
 * searchable sheet with flag + endonym list lands in M3.
 */
import { LOCALE_META, SUPPORTED_LOCALES, type Locale } from '../i18n'
import { useLanguage } from '../store/language'
import { IconChevronDown, IconGlobe } from './icons'

export interface LanguageSelectorProps {
  /** Render the compact button (header) or a labelled field (settings). */
  variant?: 'compact' | 'field'
}

export function LanguageSelector({ variant = 'compact' }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useLanguage()
  const meta = LOCALE_META[locale]

  if (variant === 'field') {
    return (
      <label className="flex flex-col gap-2">
        <span className="text-ink-muted text-sm font-medium">{t('lang.label')}</span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 rounded-xl px-4 text-base ring-1"
        >
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_META[code].endonym}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="kavach-language">
        {t('lang.label')}
      </label>
      <select
        id="kavach-language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t('a11y.selectLanguage', { language: meta.endonym })}
        className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 appearance-none rounded-full py-1.5 ps-3 pe-9 text-sm font-semibold ring-1"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_META[code].endonym}
          </option>
        ))}
      </select>
      <IconGlobe className="text-ink-muted pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4" />
      <IconChevronDown className="text-ink-muted pointer-events-none absolute inset-y-0 end-3 my-auto size-4" />
    </div>
  )
}
