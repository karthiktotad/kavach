/**
 * Map Layer Helpers & GeoJSON Converters (FE-5).
 *
 * Requirements:
 *  - Roads: reconstructed from pack roads graph tuples into GeoJSON LineStrings.
 *  - Zones: formatted with risk level & hatch flag for level >= 2.
 *  - Community reports: dashed halo for unverified reports.
 *  - Places: distinct shapes and colors per category.
 *  - Route: GeoJSON with note "avoids flagged areas" (never "safe").
 *  - User: user dot and accuracy ring.
 */
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'
import type { Place, RoadsFile, ZonesGeoJson } from '../packTypes'

export interface ZoneRiskMap {
  readonly [zoneId: string]: {
    readonly level: number
    readonly hazard?: string
  }
}

export interface CommunityReportMarker {
  readonly id: string
  readonly lat: number
  readonly lon: number
  readonly kind: string
  readonly verified: boolean
  readonly confidence: number
}

export interface RouteGeometryInput {
  readonly coordinates: readonly [number, number][] // [lon, lat] pairs
  readonly lengthMetres: number
  readonly avoidsHazards: boolean
}

/**
 * Convert packed roads tuples into a GeoJSON FeatureCollection.
 */
export function buildRoadsGeoJson(roads: RoadsFile): FeatureCollection<LineString> {
  const nodeMap = new Map<number, [number, number]>()
  for (const [id, lat, lon] of roads.nodes) {
    nodeMap.set(id, [lon, lat])
  }

  const features: Feature<LineString>[] = []

  for (const [from, to, lengthMetres, flags] of roads.edges) {
    const p1 = nodeMap.get(from)
    const p2 = nodeMap.get(to)
    if (p1 && p2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [p1, p2],
        },
        properties: {
          from,
          to,
          lengthMetres,
          flags,
          drivable: (flags & 1) !== 0,
          walkable: (flags & 2) !== 0,
        },
      })
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

/**
 * Enrich zones GeoJSON with real-time or snapshot risk levels.
 * Flags `hatch: true` whenever risk level >= 2.
 */
export function buildZonesGeoJson(
  zonesFile: ZonesGeoJson,
  riskByZone: ZoneRiskMap = {},
): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = zonesFile.features.map((f) => {
    const risk = riskByZone[f.id] || { level: 0 }
    const level = risk.level ?? 0
    const hatch = level >= 2

    return {
      type: 'Feature',
      id: f.id,
      geometry: {
        type: 'Polygon',
        coordinates: f.geometry.coordinates as unknown as Position[][],
      },
      properties: {
        ...f.properties,
        riskLevel: level,
        hazard: risk.hazard ?? 'NONE',
        hatch,
        fillColor: getZoneColor(level),
        fillOpacity: level === 0 ? 0.08 : 0.25 + level * 0.1,
      },
    }
  })

  return {
    type: 'FeatureCollection',
    features,
  }
}

/**
 * Return curated hazard level colors adhering to high-contrast palette.
 */
export function getZoneColor(level: number): string {
  switch (level) {
    case 4:
      return '#dc2626' // Red
    case 3:
      return '#ea580c' // Deep Orange
    case 2:
      return '#d97706' // Amber
    case 1:
      return '#eab308' // Yellow
    case 0:
    default:
      return '#10b981' // Green / Normal
  }
}

/**
 * Build places GeoJSON with distinct icons and categories.
 */
export function buildPlacesGeoJson(places: readonly Place[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = places.map((p) => ({
    type: 'Feature',
    id: p.id,
    geometry: {
      type: 'Point',
      coordinates: [p.lon, p.lat],
    },
    properties: {
      id: p.id,
      name: p.name || p.type.replace('_', ' '),
      type: p.type,
      markerShape: getPlaceMarkerShape(p.type),
      markerColor: getPlaceMarkerColor(p.type),
      verified: p.verified,
    },
  }))

  return {
    type: 'FeatureCollection',
    features,
  }
}

export function getPlaceMarkerShape(type: string): 'diamond' | 'cross' | 'shield' | 'circle' {
  switch (type) {
    case 'shelter_candidate':
      return 'shield'
    case 'hospital':
    case 'clinic':
      return 'cross'
    case 'police':
    case 'fire_station':
      return 'diamond'
    default:
      return 'circle'
  }
}

export function getPlaceMarkerColor(type: string): string {
  switch (type) {
    case 'shelter_candidate':
      return '#0284c7' // Blue
    case 'hospital':
    case 'clinic':
      return '#e11d48' // Rose / Medical
    case 'police':
      return '#4f46e5' // Indigo
    case 'fire_station':
      return '#ea580c' // Orange
    default:
      return '#64748b' // Slate
  }
}

/**
 * Build community reports GeoJSON with unverified halo styling.
 */
export function buildReportsGeoJson(
  reports: readonly CommunityReportMarker[],
): FeatureCollection<Point> {
  const features: Feature<Point>[] = reports.map((r) => ({
    type: 'Feature',
    id: r.id,
    geometry: {
      type: 'Point',
      coordinates: [r.lon, r.lat],
    },
    properties: {
      id: r.id,
      kind: r.kind,
      confidence: r.confidence,
      verified: r.verified,
      dashedHalo: !r.verified,
    },
  }))

  return {
    type: 'FeatureCollection',
    features,
  }
}

/**
 * Build user location Point GeoJSON.
 */
export function buildUserLocationGeoJson(
  lat: number,
  lon: number,
  accuracyMetres?: number,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          accuracyMetres: accuracyMetres ?? 0,
        },
      },
    ],
  }
}

/**
 * Build route LineString GeoJSON.
 * Engineering Rule: Never describes a route as safe; only "avoids flagged areas".
 */
export function buildRouteGeoJson(route: RouteGeometryInput): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [...route.coordinates],
        },
        properties: {
          lengthMetres: route.lengthMetres,
          avoidsHazards: route.avoidsHazards,
          description: route.avoidsHazards ? 'avoids flagged areas' : 'direct route',
        },
      },
    ],
  }
}
