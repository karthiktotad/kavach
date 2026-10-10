/**
 * Language preference — engineering rule 5 (i18n) and rule 6 (RTL).
 *
 * The stored locale drives `<html lang>` and `<html dir>` so Arabic flips the
 * entire layout through CSS logical properties rather than a second stylesheet.
 *
 * M3 moves this onto Dexie so it syncs with the rest of the offline store;
 * localStorage keeps it working now and survives a cold offline start.
 */
import { createContext, use } from 'react'
import { DEFAULT_LOCALE, isRtl, resolveLocale, translate, type Locale } from '../i18n'
import { loadScriptFont } from '../lib/scriptFonts'

export const LANGUAGE_STORAGE_KEY = 'kavach.locale'

export interface LanguageContextValue {
  readonly locale: Locale
  readonly dir: 'ltr' | 'rtl'
  readonly setLocale: (locale: Locale) => void
  /** `t('key', { param })` — bound to the active locale. */
  readonly t: (key: string, vars?: Record<string, string | number>) => string
}

export const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  setLocale: () => undefined,
  t: makeTranslate(DEFAULT_LOCALE),
})

/**
 * Read the stored preference.
 *
 * Applied synchronously (not in an effect) so the very first paint already has
 * the right language and direction — an offline cold start must not flash the
 * wrong script.
 */
export function readStoredLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored && resolveLocale([stored]) === stored) return stored
  } catch {
    // Private mode / disabled storage must never break the app.
  }
  return typeof navigator === 'undefined' ? DEFAULT_LOCALE : resolveLocale([...navigator.languages])
}

/** Persist and apply the choice to the document (lang + dir attributes). */
export function applyLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr'
  loadScriptFont(locale)
}

export function useLanguage(): LanguageContextValue {
  const ctx = use(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}

/** Convenience hook for components that only need `t`. */
export function useTranslate(): LanguageContextValue['t'] {
  return useLanguage().t
}

/** Build a `t` bound to a specific locale (used by tests and workers). */
export function makeTranslate(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
}
