/**
 * Nearest Place Search & WebGL List Fallback (FE-5).
 *
 * Provides deterministic distance/bearing sorting and WebGL fallback views.
 */
import { PLACE_ROLES, type Place, type PlaceType } from '../packTypes'
import { computeBearing, formatCompassGuidance, formatDistance, haversineDistance } from './math'

export interface PlaceWithDistance extends Place {
  readonly distanceMetres: number
  readonly bearingDeg: number
  readonly compassGuidance: string
  readonly distanceFormatted: string
}

export interface FindNearestOptions {
  readonly type?: PlaceType
  readonly role?: 'shelter' | 'medical' | 'safety' | 'supply'
  readonly limit?: number
  readonly maxDistanceMetres?: number
}

/**
 * Search and rank nearby places relative to a reference coordinate.
 */
export function findNearestPlaces(
  userLat: number,
  userLon: number,
  places: readonly Place[],
  options: FindNearestOptions = {},
): PlaceWithDistance[] {
  const limit = options.limit ?? 20

  const enriched = places
    .filter((p) => {
      if (options.type && p.type !== options.type) return false
      if (options.role && PLACE_ROLES[p.type] !== options.role) return false
      return true
    })
    .map((p) => {
      const distanceMetres = haversineDistance(userLat, userLon, p.lat, p.lon)
      const bearingDeg = computeBearing(userLat, userLon, p.lat, p.lon)
      return {
        ...p,
        distanceMetres,
        bearingDeg,
        compassGuidance: formatCompassGuidance(bearingDeg, distanceMetres),
        distanceFormatted: formatDistance(distanceMetres),
      }
    })
    .filter((p) => {
      if (options.maxDistanceMetres && p.distanceMetres > options.maxDistanceMetres) {
        return false
      }
      return true
    })
    .sort((a, b) => a.distanceMetres - b.distanceMetres)

  return enriched.slice(0, limit)
}

/**
 * Check whether WebGL is supported by the current browser context.
 */
export function isWebGlSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return Boolean(gl && gl instanceof WebGLRenderingContext)
  } catch {
    return false
  }
}

export interface ListFallbackItem {
  readonly id: string
  readonly name: string
  readonly type: PlaceType
  readonly role: 'shelter' | 'medical' | 'safety' | 'supply'
  readonly distanceFormatted: string
  readonly compassGuidance: string
  readonly lat: number
  readonly lon: number
  readonly verified: boolean
}

/**
 * Generate a complete, formatted list fallback when WebGL rendering is disabled or unavailable.
 */
export function buildListFallback(
  userLat: number,
  userLon: number,
  places: readonly Place[],
  options: FindNearestOptions = {},
): ListFallbackItem[] {
  const nearest = findNearestPlaces(userLat, userLon, places, options)
  return nearest.map((p) => ({
    id: p.id,
    name: p.name || `Designated ${p.type.replace('_', ' ')}`,
    type: p.type,
    role: PLACE_ROLES[p.type],
    distanceFormatted: p.distanceFormatted,
    compassGuidance: p.compassGuidance,
    lat: p.lat,
    lon: p.lon,
    verified: p.verified,
  }))
}
