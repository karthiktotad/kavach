import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { dirFor, translate, type Locale } from '../i18n'
import {
  LANGUAGE_STORAGE_KEY,
  LanguageContext,
  applyLocaleToDocument,
  readStoredLocale,
  type LanguageContextValue,
} from './language'

/**
 * Provides the active locale + `t()` to the whole app.
 *
 * The initial value is read synchronously from localStorage/navigator so the
 * first paint already matches the user's choice and RTL is applied with no
 * layout flash.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // Private-mode / quota errors must never break the language switch.
    }
    // Applied immediately rather than in an effect so direction flips on the
    // same frame as the state change.
    applyLocaleToDocument(next)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  )

  return <LanguageContext value={value}>{children}</LanguageContext>
}
