import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bearingToCompass,
  buildListFallback,
  buildPlacesGeoJson,
  buildReportsGeoJson,
  buildRoadsGeoJson,
  buildRouteGeoJson,
  buildUserLocationGeoJson,
  buildZonesGeoJson,
  computeOfflineRoute,
  findNearestPlaces,
  formatCompassGuidance,
  formatDistance,
  GEOLOCATION_PROFILES,
  haversineDistance,
  pickGeolocationProfile,
} from '../src/lib/map'
import type { PlacesFile, RoadsFile, ZonesGeoJson } from '../src/lib/packTypes'

const placesRaw: PlacesFile = JSON.parse(
  readFileSync(resolve(__dirname, '../public/pack/places.json'), 'utf-8'),
)
const roadsRaw: RoadsFile = JSON.parse(
  readFileSync(resolve(__dirname, '../public/pack/roads.json'), 'utf-8'),
)
const zonesRaw: ZonesGeoJson = JSON.parse(
  readFileSync(resolve(__dirname, '../public/pack/zones.geojson'), 'utf-8'),
)

describe('Map and Routing Helpers (FE-5)', () => {
  // -------------------------------------------------------------------------
  // Math & Geodesics
  // -------------------------------------------------------------------------
  describe('Math and Compass Bearings', () => {
    it('computes accurate Haversine distance between two coordinates', () => {
      // Mamallapuram Shore Temple to Lighthouse (~900m)
      const dist = haversineDistance(12.6163, 80.1983, 12.6186, 80.1925)
      expect(dist).toBeGreaterThan(600)
      expect(dist).toBeLessThan(1200)
    })

    it('computes initial bearings and converts to 8-point compass text', () => {
      // North
      expect(bearingToCompass(0)).toBe('north')
      expect(bearingToCompass(360)).toBe('north')
      // North-East
      expect(bearingToCompass(45)).toBe('north-east')
      // East
      expect(bearingToCompass(90)).toBe('east')
      // South-East
      expect(bearingToCompass(135)).toBe('south-east')
      // South
      expect(bearingToCompass(180)).toBe('south')
      // West
      expect(bearingToCompass(270)).toBe('west')
      // North-West
      expect(bearingToCompass(315)).toBe('north-west')
    })

    it('formats compass guidance string with distance and cardinal direction', () => {
      const guidance = formatCompassGuidance(45, 900)
      expect(guidance).toBe('Head roughly north-east, 900 m')

      const kmGuidance = formatCompassGuidance(180, 2400)
      expect(kmGuidance).toBe('Head roughly south, 2.4 km')
    })

    it('formats distance into readable units', () => {
      expect(formatDistance(350)).toBe('350 m')
      expect(formatDistance(1500)).toBe('1.5 km')
    })
  })

  // -------------------------------------------------------------------------
  // Nearest Places Search & WebGL List Fallback
  // -------------------------------------------------------------------------
  describe('Nearest Places and WebGL Fallback', () => {
    it('finds and sorts nearest places accurately', () => {
      const userLat = 12.6208
      const userLon = 80.1944

      const nearest = findNearestPlaces(userLat, userLon, placesRaw.places, { limit: 5 })
      expect(nearest.length).toBeLessThanOrEqual(5)
      const first = nearest[0]
      const second = nearest[1]
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      if (first && second) {
        expect(first.distanceMetres).toBeLessThanOrEqual(second.distanceMetres)
        expect(first.compassGuidance).toBeDefined()
      }
    })

    it('filters places by specific type and role', () => {
      const userLat = 12.6208
      const userLon = 80.1944

      const shelters = findNearestPlaces(userLat, userLon, placesRaw.places, {
        type: 'shelter_candidate',
      })
      expect(shelters.every((s) => s.type === 'shelter_candidate')).toBe(true)

      const medical = findNearestPlaces(userLat, userLon, placesRaw.places, {
        role: 'medical',
      })
      expect(medical.every((m) => m.type === 'hospital' || m.type === 'clinic')).toBe(true)
    })

    it('generates structured WebGL list fallback items', () => {
      const userLat = 12.6208
      const userLon = 80.1944

      const listFallback = buildListFallback(userLat, userLon, placesRaw.places, { limit: 3 })
      expect(listFallback.length).toBe(3)
      const first = listFallback[0]
      expect(first).toBeDefined()
      if (first) {
        expect(first.distanceFormatted).toBeDefined()
        expect(first.compassGuidance).toContain('Head roughly')
        expect(first.verified).toBe(false)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Layer Helpers & Styling
  // -------------------------------------------------------------------------
  describe('Layer-Building Helpers', () => {
    it('reconstructs roads GeoJSON LineStrings from packed road graph', () => {
      const roadsGeoJson = buildRoadsGeoJson(roadsRaw)
      expect(roadsGeoJson.type).toBe('FeatureCollection')
      expect(roadsGeoJson.features.length).toBe(roadsRaw.edgeCount)
      const first = roadsGeoJson.features[0]
      expect(first).toBeDefined()
      if (first) {
        expect(first.geometry.type).toBe('LineString')
        expect(first.geometry.coordinates.length).toBe(2)
        expect(first.properties?.drivable).toBeDefined()
      }
    })

    it('builds zones GeoJSON with risk styling and hatch flag for level >= 2', () => {
      const zonesGeoJson = buildZonesGeoJson(zonesRaw, {
        Z1: { level: 3, hazard: 'FL' },
        Z2: { level: 1, hazard: 'CY' },
      })

      expect(zonesGeoJson.type).toBe('FeatureCollection')
      const z1 = zonesGeoJson.features.find((f) => f.id === 'Z1')
      const z2 = zonesGeoJson.features.find((f) => f.id === 'Z2')

      expect(z1?.properties?.riskLevel).toBe(3)
      expect(z1?.properties?.hatch).toBe(true)
      expect(z1?.properties?.fillColor).toBe('#ea580c')

      expect(z2?.properties?.riskLevel).toBe(1)
      expect(z2?.properties?.hatch).toBe(false)
    })

    it('builds places GeoJSON with distinct shapes and category colors', () => {
      const placesGeoJson = buildPlacesGeoJson(placesRaw.places)
      expect(placesGeoJson.features.length).toBe(placesRaw.places.length)

      const shelter = placesGeoJson.features.find((f) => f.properties?.type === 'shelter_candidate')
      expect(shelter?.properties?.markerShape).toBe('shield')
      expect(shelter?.properties?.markerColor).toBe('#0284c7')

      const hospital = placesGeoJson.features.find((f) => f.properties?.type === 'hospital')
      expect(hospital?.properties?.markerShape).toBe('cross')
      expect(hospital?.properties?.markerColor).toBe('#e11d48')
    })

    it('builds reports GeoJSON with dashed halo for unverified community reports', () => {
      const reportsGeoJson = buildReportsGeoJson([
        {
          id: 'rep-1',
          lat: 12.62,
          lon: 80.19,
          kind: 'flood',
          verified: false,
          confidence: 0.7,
        },
      ])

      const first = reportsGeoJson.features[0]
      expect(first).toBeDefined()
      expect(first?.properties?.dashedHalo).toBe(true)
    })

    it('builds user location and route GeoJSON with honest hazard description', () => {
      const userGeoJson = buildUserLocationGeoJson(12.62, 80.19, 10)
      const userFirst = userGeoJson.features[0]
      expect(userFirst?.geometry.coordinates).toEqual([80.19, 12.62])

      const routeGeoJson = buildRouteGeoJson({
        coordinates: [
          [80.19, 12.62],
          [80.195, 12.625],
        ],
        lengthMetres: 800,
        avoidsHazards: true,
      })

      const routeFirst = routeGeoJson.features[0]
      expect(routeFirst?.properties?.description).toBe('avoids flagged areas')
      expect(routeFirst?.properties?.description).not.toContain('safe')
    })
  })

  // -------------------------------------------------------------------------
  // Geolocation Polling Profiles
  // -------------------------------------------------------------------------
  describe('Geolocation Power Profiles', () => {
    it('selects low-power profile when battery is low or offline/cellular-only', () => {
      const lowBatt = pickGeolocationProfile({ batteryLow: true })
      expect(lowBatt).toEqual(GEOLOCATION_PROFILES.LOW_POWER)

      const offlineProf = pickGeolocationProfile({ connectivity: 'cellular-only' })
      expect(offlineProf).toEqual(GEOLOCATION_PROFILES.LOW_POWER)
    })

    it('selects high precision profile when active navigation is engaged', () => {
      const navProf = pickGeolocationProfile({ isNavigating: true, batteryLow: false })
      expect(navProf).toEqual(GEOLOCATION_PROFILES.HIGH_PRECISION)
    })
  })

  // -------------------------------------------------------------------------
  // Offline Road Graph Routing & Performance (< 1s)
  // -------------------------------------------------------------------------
  describe('Offline Road Graph Routing Performance and Hazard Avoidance', () => {
    it('finds nearest shelter and computes route in under 1 second', () => {
      const userLat = 12.6208
      const userLon = 80.1944

      const shelters = findNearestPlaces(userLat, userLon, placesRaw.places, {
        type: 'shelter_candidate',
      })
      expect(shelters.length).toBeGreaterThan(0)
      const targetShelter = shelters[0]
      expect(targetShelter).toBeDefined()
      if (!targetShelter) return

      const start = performance.now()

      const route = computeOfflineRoute({
        start: { lat: userLat, lon: userLon },
        target: { lat: targetShelter.lat, lon: targetShelter.lon },
        roads: roadsRaw,
        hazardZones: zonesRaw.features,
      })

      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000) // Must compute in under 1 second
      expect(route.coordinates.length).toBeGreaterThanOrEqual(2)
      expect(route.lengthMetres).toBeGreaterThan(0)
      expect(route.durationSeconds).toBeGreaterThan(0)
      expect(route.note).toBe('avoids flagged areas')
    })
  })
})
