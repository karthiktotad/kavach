/**
 * Pilot region configuration — THE single place to change where Kavach points.
 *
 * Changing regions (a new city, a new country) should require edits here and
 * a rebuilt content pack, and nothing else in the codebase.
 *
 * NOTE (engineering rule 7): coordinates below are the pilot region's bounding
 * box. Every shelter/hospital/phone entry in the content pack carries
 * `verified: false` until checked — see TODO_VERIFY.md.
 */

export interface RegionConfig {
  /** Stable machine id, also used as the content-pack namespace. */
  readonly id: string
  readonly name: string
  readonly country: string
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string
  /** BCP 47 default language for the region. */
  readonly defaultLocale: string
  readonly centre: { readonly lat: number; readonly lon: number }
  /** [west, south, east, north] */
  readonly bbox: readonly [number, number, number, number]
  /** Approx radius in km used for "is this packet relevant to me?" checks. */
  readonly radiusKm: number
  /** Attribution required by the underlying map data. */
  readonly attribution: string
}

export const PILOT_REGION: RegionConfig = {
  id: 'in-tn-mamallapuram',
  name: 'Mamallapuram (Mahabalipuram) & Chennai coast',
  country: 'India',
  countryCode: 'IN',
  defaultLocale: 'en',
  centre: { lat: 12.6208, lon: 80.1945 },
  bbox: [80.08, 12.49, 80.42, 12.99],
  radiusKm: 40,
  attribution: '© OpenStreetMap contributors',
} as const

/** True when a [lon, lat] pair falls inside the pilot bbox. */
export function isInsideRegion(
  lon: number,
  lat: number,
  region: RegionConfig = PILOT_REGION,
): boolean {
  const [west, south, east, north] = region.bbox
  return lon >= west && lon <= east && lat >= south && lat <= north
}
