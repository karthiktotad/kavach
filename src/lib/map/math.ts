/**
 * Geodesic and compass math helpers (FE-5).
 *
 * Provides Haversine distance calculations, initial bearings,
 * 8/16-point cardinal compass text, and offline heading descriptions.
 */

const EARTH_RADIUS_METRES = 6371000

/**
 * Compute great-circle distance between two points in metres via Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METRES * c
}

/**
 * Compute the initial bearing from point A to point B in degrees (0..360, where 0=North, 90=East).
 */
export function computeBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))

  const bearingRad = Math.atan2(y, x)
  const bearingDeg = (toDeg(bearingRad) + 360) % 360
  return bearingDeg
}

export const CARDINAL_DIRECTIONS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const

export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number]

/**
 * Convert a bearing in degrees (0..360) to 8-point compass text.
 */
export function bearingToCompass(bearingDeg: number): CardinalDirection {
  const normalized = (bearingDeg % 360 + 360) % 360
  // Each sector is 45 degrees, offset by 22.5 to centre on North
  const index = Math.round(normalized / 45) % 8
  return CARDINAL_DIRECTIONS[index] ?? 'north'
}

/**
 * Format human-readable distance (e.g. "450 m" or "1.8 km").
 */
export function formatDistance(distanceMetres: number): string {
  if (distanceMetres < 1000) {
    return `${Math.round(distanceMetres)} m`
  }
  return `${(distanceMetres / 1000).toFixed(1)} km`
}

/**
 * Compose compass fallback text when map rendering is unavailable.
 * Example: "Head roughly north-east, 900 m"
 */
export function formatCompassGuidance(bearingDeg: number, distanceMetres: number): string {
  const dir = bearingToCompass(bearingDeg)
  const dist = formatDistance(distanceMetres)
  return `Head roughly ${dir}, ${dist}`
}
