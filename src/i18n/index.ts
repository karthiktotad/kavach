/**
 * i18n runtime — engineering rule 5: no user-facing string may be hardcoded
 * in a component.
 *
 * This is intentionally tiny and dependency-free so it works offline with zero
 * bytes of network. The full translation set lands in M2/M3; the 8 languages
 * are registered here so the language selector and RTL logic are real from day
 * one rather than retrofitted later.
 */

export const SUPPORTED_LOCALES = ['en', 'ta', 'hi', 'bn', 'ar', 'fr', 'es', 'ja'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Locales written right-to-left. Drives `<html dir>` and Tailwind logical props. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar'])

export interface LocaleMeta {
  /** Name in the language itself — never in English. */
  readonly endonym: string
  readonly dir: 'ltr' | 'rtl'
  readonly flag: string
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { endonym: 'English', dir: 'ltr', flag: '🇬🇧' },
  ta: { endonym: 'தமிழ்', dir: 'ltr', flag: '🇮🇳' },
  hi: { endonym: 'हिन्दी', dir: 'ltr', flag: '🇮🇳' },
  bn: { endonym: 'বাংলা', dir: 'ltr', flag: '🇮🇳' },
  ar: { endonym: 'العربية', dir: 'rtl', flag: '🌍' },
  fr: { endonym: 'Français', dir: 'ltr', flag: '🌍' },
  es: { endonym: 'Español', dir: 'ltr', flag: '🌍' },
  ja: { endonym: '日本語', dir: 'ltr', flag: '🌍' },
}

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** Best-effort match of a browser language list against our supported set. */
export function resolveLocale(candidates: readonly string[]): Locale {
  for (const raw of candidates) {
    const base = raw.toLowerCase().split('-')[0]
    if (base && isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].dir
}

/**
 * Translation dictionary. Flat keys, `{placeholder}` interpolation.
 * Values are stored as functions of the interpolation map so we do not need a
 * template parser and stay tree-shakeable.
 */
export type Messages = Record<string, string>

import { messages as enMessages } from './messages/en'

export const MESSAGES: Record<Locale, Messages> = {
  en: enMessages,
  ta: {}, // populated in M2 — falls back to English until translated
  hi: {},
  bn: {},
  ar: {},
  fr: {},
  es: {},
  ja: {},
}

/**
 * Look up `key` for `locale`, falling back to English and finally to the key
 * itself so a missing translation is loud in development but never breaks the UI.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const raw = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** BCP-47 tag for Intl APIs (number/date/relative-time formatting). */
export function intlLocale(locale: Locale): string {
  const map: Record<Locale, string> = {
    en: 'en-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
    bn: 'bn-IN',
    ar: 'ar-IN',
    fr: 'fr-FR',
    es: 'es-ES',
    ja: 'ja-JP',
  }
  return map[locale]
}
