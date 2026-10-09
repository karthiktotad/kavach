import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Locale } from '../i18n'
import { dirFor, translate } from '../i18n'
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
 * M3 will back this with Dexie so the preference syncs across the device;
 * localStorage keeps the choice alive across reloads right now.
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
    applyLocaleToDocument(next)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  )

  return <LanguageContext value={value}>{children}</LanguageContext>
}
