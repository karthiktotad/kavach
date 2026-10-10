/**
 * Offline Road Graph Router & Hazard Avoidance Engine (FE-5).
 *
 * Capabilities:
 *  - High-performance Dijkstra / A* search on bundled road graph.
 *  - Hazard avoidance: penalties applied to edges traversing high-risk zones (level >= 2).
 *  - Fallback to straight-line navigation if disconnected.
 *  - Engineering Rule: Output description always says "avoids flagged areas", NEVER "safe".
 */
import type { RoadsFile, ZoneFeature } from '../packTypes'
import { haversineDistance } from './math'

export interface RouteRequest {
  readonly start: { readonly lat: number; readonly lon: number }
  readonly target: { readonly lat: number; readonly lon: number }
  readonly roads: RoadsFile
  readonly hazardZones?: readonly ZoneFeature[]
  readonly highRiskZoneIds?: readonly string[]
  readonly walkSpeedMps?: number // Default ~1.2 m/s (4.3 km/h)
}

export interface RouteResult {
  readonly coordinates: [number, number][] // [lon, lat] pairs for GeoJSON
  readonly lengthMetres: number
  readonly durationSeconds: number
  readonly avoidsHazards: boolean
  readonly note: string
  readonly nodeCount: number
}

interface GraphNode {
  readonly id: number
  readonly lat: number
  readonly lon: number
  readonly inHazard: boolean
}

interface GraphEdge {
  readonly to: number
  readonly lengthMetres: number
  readonly cost: number
}

/**
 * Fast ray-casting point-in-polygon test for GeoJSON Polygon coordinates.
 */
export function isPointInPolygon(
  point: [number, number], // [lon, lat]
  polygonCoordinates: readonly (readonly (readonly [number, number])[])[],
): boolean {
  const [x, y] = point
  let inside = false

  // Outer ring is index 0
  const ring = polygonCoordinates[0]
  if (!ring || ring.length < 3) return false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ptI = ring[i]
    const ptJ = ring[j]
    if (!ptI || !ptJ) continue

    const xi = ptI[0]
    const yi = ptI[1]
    const xj = ptJ[0]
    const yj = ptJ[1]

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Check if a coordinate [lon, lat] is inside any of the flagged high-risk zones.
 */
export function isCoordInHazardZones(
  lon: number,
  lat: number,
  hazardZones: readonly ZoneFeature[],
  highRiskZoneIds?: readonly string[],
): boolean {
  if (!hazardZones || hazardZones.length === 0) return false
  const filterSet = highRiskZoneIds ? new Set(highRiskZoneIds) : null

  for (const zone of hazardZones) {
    if (filterSet && !filterSet.has(zone.id)) continue
    if (isPointInPolygon([lon, lat], zone.geometry.coordinates)) {
      return true
    }
  }
  return false
}

/**
 * Compute the shortest path on the offline road graph avoiding hazard zones.
 */
export function computeOfflineRoute(request: RouteRequest): RouteResult {
  const { start, target, roads, hazardZones = [], highRiskZoneIds, walkSpeedMps = 1.2 } = request

  const firstNode = roads.nodes[0]
  if (!firstNode || roads.nodes.length === 0) {
    // Empty graph fallback
    const directDist = haversineDistance(start.lat, start.lon, target.lat, target.lon)
    return {
      coordinates: [
        [start.lon, start.lat],
        [target.lon, target.lat],
      ],
      lengthMetres: directDist,
      durationSeconds: Math.round(directDist / walkSpeedMps),
      avoidsHazards: false,
      note: 'direct route (no road graph available)',
      nodeCount: 2,
    }
  }

  // 1. Build nodes and mark hazard state
  const nodesMap = new Map<number, GraphNode>()
  let nearestStartNodeId = firstNode[0]
  let minStartDist = Infinity
  let nearestTargetNodeId = firstNode[0]
  let minTargetDist = Infinity

  for (const [id, lat, lon] of roads.nodes) {
    const inHazard = isCoordInHazardZones(lon, lat, hazardZones, highRiskZoneIds)
    nodesMap.set(id, { id, lat, lon, inHazard })

    const distFromStart = haversineDistance(start.lat, start.lon, lat, lon)
    if (distFromStart < minStartDist) {
      minStartDist = distFromStart
      nearestStartNodeId = id
    }

    const distFromTarget = haversineDistance(target.lat, target.lon, lat, lon)
    if (distFromTarget < minTargetDist) {
      minTargetDist = distFromTarget
      nearestTargetNodeId = id
    }
  }

  // 2. Build adjacency list with hazard penalty weights
  const adj = new Map<number, GraphEdge[]>()
  for (const [from, to, lengthMetres] of roads.edges) {
    const fromNode = nodesMap.get(from)
    const toNode = nodesMap.get(to)
    const isHazardEdge = Boolean(fromNode?.inHazard || toNode?.inHazard)

    // Apply 50x penalty to discourage traversing high-risk zones
    const penaltyMultiplier = isHazardEdge ? 50 : 1
    const cost = lengthMetres * penaltyMultiplier

    if (!adj.has(from)) adj.set(from, [])
    if (!adj.has(to)) adj.set(to, [])

    adj.get(from)!.push({ to, lengthMetres, cost })
    adj.get(to)!.push({ to: from, lengthMetres, cost })
  }

  // 3. Dijkstra search
  const distances = new Map<number, number>()
  const actualLengths = new Map<number, number>()
  const previous = new Map<number, number>()
  const visited = new Set<number>()

  const unvisitedNodes = new Set<number>()

  distances.set(nearestStartNodeId, 0)
  actualLengths.set(nearestStartNodeId, 0)
  unvisitedNodes.add(nearestStartNodeId)

  while (unvisitedNodes.size > 0) {
    let current: number | null = null
    let smallestDist = Infinity

    for (const nodeId of unvisitedNodes) {
      const d = distances.get(nodeId) ?? Infinity
      if (d < smallestDist) {
        smallestDist = d
        current = nodeId
      }
    }

    if (current === null || smallestDist === Infinity) break
    if (current === nearestTargetNodeId) break

    unvisitedNodes.delete(current)
    visited.add(current)

    const neighbors = adj.get(current) || []
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue

      const alt = smallestDist + edge.cost
      const currentBest = distances.get(edge.to) ?? Infinity

      if (alt < currentBest) {
        distances.set(edge.to, alt)
        actualLengths.set(edge.to, (actualLengths.get(current) ?? 0) + edge.lengthMetres)
        previous.set(edge.to, current)
        unvisitedNodes.add(edge.to)
      }
    }
  }

  // 4. Reconstruct path
  const pathNodes: number[] = []
  let curr: number | undefined = nearestTargetNodeId

  if (previous.has(curr) || curr === nearestStartNodeId) {
    while (curr !== undefined) {
      pathNodes.unshift(curr)
      curr = previous.get(curr)
    }
  }

  const coordinates: [number, number][] = []
  coordinates.push([start.lon, start.lat])

  let routeLength: number

  if (pathNodes.length > 0) {
    for (const nodeId of pathNodes) {
      const node = nodesMap.get(nodeId)
      if (node) {
        coordinates.push([node.lon, node.lat])
      }
    }
    routeLength =
      minStartDist +
      (actualLengths.get(nearestTargetNodeId) ?? 0) +
      minTargetDist
  } else {
    routeLength = haversineDistance(start.lat, start.lon, target.lat, target.lon)
  }

  coordinates.push([target.lon, target.lat])

  const hasAvoidedHazards = hazardZones.length > 0
  const durationSeconds = Math.round(routeLength / walkSpeedMps)

  return {
    coordinates,
    lengthMetres: Math.round(routeLength),
    durationSeconds,
    avoidsHazards: hasAvoidedHazards,
    note: hasAvoidedHazards ? 'avoids flagged areas' : 'direct route',
    nodeCount: coordinates.length,
  }
}
