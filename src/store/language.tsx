/**
 * Language preference — engineering rule 5 (i18n) and rule 6 (RTL).
 *
 * M1 stub: the preference lives in React state seeded from the browser, and is
 * mirrored to localStorage so the choice survives a reload even before the
 * Dexie-backed store arrives in M3.
 */
import { createContext, use } from 'react'
import { DEFAULT_LOCALE, dirFor, resolveLocale, translate, type Locale } from '../i18n'

export const LANGUAGE_STORAGE_KEY = 'kavach.locale'

export interface LanguageContextValue {
  readonly locale: Locale
  readonly dir: 'ltr' | 'rtl'
  readonly setLocale: (locale: Locale) => void
  /** `t('key', { param })` — bound to the active locale. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

/** Read the stored preference, falling back to the browser's language list. */
export function readStoredLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored) {
    const resolved = resolveLocale([stored])
    // Only trust the stored value if it is actually a supported locale.
    if (stored === resolved) return resolved
  }
  return resolveLocale(typeof navigator === 'undefined' ? [] : [...navigator.languages])
}

/** Persist and apply the choice to the document (lang + dir attributes). */
export function applyLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = dirFor(locale)
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
  return (key: string, params?: Record<string, string | number>) => translate(locale, key, params)
}
