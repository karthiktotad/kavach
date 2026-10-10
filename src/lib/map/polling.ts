/**
 * Geolocation Polling & Power Profiles (FE-5).
 *
 * Provides optimized battery-aware geolocation settings.
 */

export interface GeolocationProfile {
  readonly enableHighAccuracy: boolean
  readonly timeout: number
  readonly maximumAge: number
  readonly pollIntervalMs: number
}

export const GEOLOCATION_PROFILES = {
  /** High accuracy for active routing in clear connectivity. */
  HIGH_PRECISION: {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 5_000,
    pollIntervalMs: 5_000,
  },
  /** Balanced profile for standard browsing and moving between zones. */
  BALANCED: {
    enableHighAccuracy: false,
    timeout: 15_000,
    maximumAge: 30_000,
    pollIntervalMs: 20_000,
  },
  /** Low-power profile to preserve battery on low charge or offline/relay state. */
  LOW_POWER: {
    enableHighAccuracy: false,
    timeout: 20_000,
    maximumAge: 120_000,
    pollIntervalMs: 60_000,
  },
} as const satisfies Record<string, GeolocationProfile>

export function pickGeolocationProfile(options: {
  connectivity?: 'live' | 'degraded' | 'cellular-only' | 'offline' | 'relay'
  isNavigating?: boolean
  batteryLow?: boolean
}): GeolocationProfile {
  if (options.batteryLow) {
    return GEOLOCATION_PROFILES.LOW_POWER
  }
  if (options.isNavigating) {
    return GEOLOCATION_PROFILES.HIGH_PRECISION
  }
  if (options.connectivity === 'cellular-only' || options.connectivity === 'relay') {
    return GEOLOCATION_PROFILES.LOW_POWER
  }
  return GEOLOCATION_PROFILES.BALANCED
}
