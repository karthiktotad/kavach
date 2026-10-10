/**
 * Data-freshness formatting.
 *
 * During a crisis, "how old is this?" is a safety question, not a UI nicety. A
 * risk snapshot from four hours ago must never look as trustworthy as one from
 * four minutes ago, so every screen that shows data also shows its age.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Locale-aware relative time ("3 min ago"). */
export function formatAge(timestamp: number, locale = 'en', now = Date.now()): string {
  const delta = now - timestamp
  const rtf = relativeFormatter(locale)

  if (delta < MINUTE) return rtf.format(0, 'minute') // "now"
  if (delta < HOUR) return rtf.format(-Math.floor(delta / MINUTE), 'minute')
  if (delta < DAY) return rtf.format(-Math.floor(delta / HOUR), 'hour')
  return rtf.format(-Math.floor(delta / DAY), 'day')
}

/** Absolute local time, for "last updated 14:32" style labels. */
export function formatClock(timestamp: number, locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(localeTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toISOString().slice(11, 16)
  }
}

/** Human byte size for the pack/storage screens. */
export function formatBytes(bytes: number, locale = 'en'): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value.toFixed(value < 10 ? 1 : 0)
  try {
    return `${new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(
      Number(rounded),
    )} ${units[unit]}`
  } catch {
    return `${rounded} ${units[unit]}`
  }
}

/**
 * How stale is too stale?
 *
 * Returns a coarse band so the UI can colour/label consistently without
 * hardcoding thresholds in components.
 */
export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown'

export function freshness(timestamp: number | null, now = Date.now()): Freshness {
  if (timestamp === null) return 'unknown'
  const delta = now - timestamp
  if (delta < 15 * MINUTE) return 'fresh'
  if (delta < 2 * HOUR) return 'aging'
  return 'stale'
}

function localeTag(locale: string): string {
  const map: Record<string, string> = {
    en: 'en-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
    fr: 'fr-FR',
    de: 'de-DE',
    ar: 'ar-IN',
    zh: 'zh-CN',
    ja: 'ja-JP',
  }
  return map[locale] ?? locale
}

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  try {
    return new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' })
  } catch {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  }
}
