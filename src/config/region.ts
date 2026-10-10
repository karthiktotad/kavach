/**
 * Pilot region configuration — THE single place to change where Kavach points.
 *
 * Changing regions (a new city, a new country) should require edits here and a
 * rebuilt content pack, and nothing else in the codebase. `scripts/fetch-osm.ts`
 * and `scripts/build-road-graph.ts` both read this file, so the bbox below is
 * what actually drives what data lands in the pack.
 *
 * NOTE (engineering rule 7): nothing in this file is a safety fact. Coordinates
 * here are the region's bounding box, not a claim about any specific place.
 * Every shelter/hospital/phone entry in the content pack carries
 * `verified: false` until checked — see TODO_VERIFY.md.
 */

/** Locales the content pack is authored and translated into. */
export const SUPPORTED_LOCALES = ['en', 'ta', 'hi', 'fr', 'de', 'ar', 'zh', 'ja'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Locales written right-to-left. Drives `<html dir>` and CSS logical properties.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar'])

export interface RegionConfig {
  /** Stable machine id, also the content-pack namespace. */
  readonly id: string
  readonly name: string
  readonly country: string
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string
  /** BCP 47 default language for the region. */
  readonly defaultLocale: Locale
  /** Regional languages worth translating into even before M2 copy lands. */
  readonly regionLocales: readonly Locale[]
  readonly centre: { readonly lat: number; readonly lon: number }
  /** [west, south, east, north] — the bbox every pack generator queries. */
  readonly bbox: readonly [number, number, number, number]
  /** Approx radius in km for "is this packet relevant to me?" checks. */
  readonly radiusKm: number
  /** Attribution required by the underlying map data (ODbL). */
  readonly attribution: string
  /** Timezone IANA name, used for "expires in 3 h" style relative times. */
  readonly timeZone: string
}

export const PILOT_REGION: RegionConfig = {
  id: 'in-tn-mamallapuram',
  name: 'Mamallapuram (Mahabalipuram) & the Chennai coast',
  country: 'India',
  countryCode: 'IN',
  defaultLocale: 'en',
  // Tamil is the regional language; Hindi is the national lingua franca.
  regionLocales: ['ta', 'hi'],
  centre: { lat: 12.6208, lon: 80.1945 },
  /**
   * Mamallapuram town plus the coastal corridor east toward Chennai
   * (Kovalam, Thiruvanmiyur) and north toward Injambakkam.
   * ~19 km wide x ~27 km tall.
   */
  bbox: [80.14, 12.58, 80.32, 12.85],
  radiusKm: 25,
  attribution: '© OpenStreetMap contributors',
  timeZone: 'Asia/Kolkata',
} as const

/** True when a [lon, lat] pair falls inside the region bbox. */
export function isInsideRegion(
  lon: number,
  lat: number,
  region: RegionConfig = PILOT_REGION,
): boolean {
  const [west, south, east, north] = region.bbox
  return lon >= west && lon <= east && lat >= south && lat <= north
}

/** Endonym + direction for every supported locale (used by the selector). */
export const LOCALE_META: Record<Locale, { endonym: string; dir: 'ltr' | 'rtl' }> = {
  en: { endonym: 'English', dir: 'ltr' },
  ta: { endonym: 'தமிழ்', dir: 'ltr' },
  hi: { endonym: 'हिन्दी', dir: 'ltr' },
  fr: { endonym: 'Français', dir: 'ltr' },
  de: { endonym: 'Deutsch', dir: 'ltr' },
  ar: { endonym: 'العربية', dir: 'rtl' },
  zh: { endonym: '中文', dir: 'ltr' },
  ja: { endonym: '日本語', dir: 'ltr' },
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale)
}

/** Text direction for a locale. */
export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].dir
}

/**
 * Best-effort match of a browser language list against our supported locales.
 * Only the base language is matched, so `fr-CA` resolves to `fr`.
 */
export function resolveLocale(candidates: readonly string[]): Locale {
  for (const raw of candidates) {
    const base = raw.toLowerCase().split('-')[0]
    if (base && isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}
