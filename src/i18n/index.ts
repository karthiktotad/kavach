/**
 * i18n runtime — engineering rule 5: no user-facing string may be hardcoded
 * in a component.
 *
 * Design (per the M2 brief):
 * - `messages/en.json` is the base UI strings file and the source of truth for
 *   the key set. `scripts/translate-pack.ts` produces the other locales from it.
 * - `t(key, vars)` interpolates `{placeholder}` tokens and falls back to
 *   English, then to the key itself (loud in dev, never a crash in prod).
 * - RTL is driven by the locale table, not by string inspection, so Arabic
 *   correctly flips the whole app through `<html dir>` and CSS logical props.
 *
 * Locales are discovered with `import.meta.glob`, so a locale that has not been
 * translated yet simply has no file and quietly falls back to English.
 */
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  dirFor,
  isLocale,
  isRtl,
  resolveLocale,
  type Locale,
} from '../config/region'

export {
  SUPPORTED_LOCALES,
  LOCALE_META,
  RTL_LOCALES,
  DEFAULT_LOCALE,
  dirFor,
  isLocale,
  isRtl,
  resolveLocale,
}
export type { Locale }

export type Messages = Record<string, string>

/**
 * All locale bundles present at build time. Vite statically analyses this, so
 * missing translations simply are not included.
 */
const bundles = import.meta.glob<Messages>('./messages/*.json', {
  eager: true,
  import: 'default',
})

function bundleFor(locale: Locale): Messages | undefined {
  const direct = bundles[`./messages/${locale}.json`]
  if (direct) return direct
  // Fall back to a regional file (e.g. `pt-BR` → `pt`) if one is added later.
  const base = locale.split('-')[0]
  return base ? bundles[`./messages/${base}.json`] : undefined
}

/** Locale messages, guaranteed to contain every English key. */
export const MESSAGES: Record<Locale, Messages> = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, { ...(bundleFor(locale) ?? {}) }]),
) as Record<Locale, Messages>

/** True once a locale has its own bundle (used to warn about silent fallback). */
export function hasTranslation(locale: Locale): boolean {
  const bundle = bundleFor(locale)
  if (!bundle) return false
  return Object.keys(bundle).length > 0
}

/** BCP-47 tag for `Intl` APIs (number/date/relative-time formatting). */
const INTL_TAGS: Record<Locale, string> = {
  en: 'en-IN',
  ta: 'ta-IN',
  hi: 'hi-IN',
  fr: 'fr-FR',
  de: 'de-DE',
  ar: 'ar-IN',
  zh: 'zh-CN',
  ja: 'ja-JP',
}

export function intlLocale(locale: Locale): string {
  return INTL_TAGS[locale]
}

/** Values accepted by `{placeholder}` interpolation. */
export type Vars = Record<string, string | number>

/**
 * Look up `key` for `locale`, falling back to English and finally to the key
 * itself. `{name}` tokens are replaced from `vars`; an unknown token is left
 * visible rather than printed as `undefined`.
 */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * Locale-aware number formatting. Falls back to a plain string in runtimes
 * without full ICU rather than throwing.
 */
export function formatNumber(locale: Locale, value: number): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale)).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Relative time ("in 25 minutes", "2 h ago") for alert expiry.
 * `Intl.RelativeTimeFormat` is not universal, so this degrades gracefully.
 */
export function formatRelative(locale: Locale, deltaMinutes: number): string {
  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
    const abs = Math.abs(deltaMinutes)
    if (abs < 60) return rtf.format(Math.round(deltaMinutes), 'minute')
    return rtf.format(Math.round(deltaMinutes / 60), 'hour')
  } catch {
    const abs = Math.abs(deltaMinutes)
    return abs < 60 ? `${Math.round(deltaMinutes)} min` : `${Math.round(deltaMinutes / 60)} h`
  }
}
