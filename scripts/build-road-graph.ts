/**
 * Builds the offline road graph used by hazard-aware routing (core idea 5).
 *
 *   node scripts/build-road-graph.ts            # uses .cache/osm if present
 *   node scripts/build-road-graph.ts --refresh  # re-query Overpass
 *   node scripts/build-road-graph.ts --offline  # sample graph, no network
 *
 * GPS works with no data, but a map does not. So we ship a small road graph in
 * the content pack and run A* over it on-device, penalising edges that touch
 * flood-prone zones.
 *
 * Size matters: a tourist downloads this once on hotel wi-fi. The target is
 * < 1.5 MB uncompressed. Simplification is therefore deliberate:
 *   1. keep only walkable/drivable highway classes (no motorway/trunk)
 *   2. drop `area=yes` and indoor ways
 *   3. drop sub-5 m slivers
 *   4. iteratively prune short dead-end stubs (< 35 m)
 *   5. drop small disconnected fragments
 *   6. store [id, lat, lon] / [from, to, len, flags] tuples, 4-decimal coords
 *
 * Every point comes from OpenStreetMap (ODbL — see DISCLOSURES.md).
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PILOT_REGION } from '../src/config/region.ts'
import {
  COORD_DECIMALS,
  EDGE_FLAG,
  type RoadEdge,
  type RoadEdgeTuple,
  type RoadNode,
  type RoadNodeTuple,
  type RoadsFile,
} from '../src/lib/packTypes.ts'
import {
  OSM_CACHE_DIR,
  fail,
  info,
  packMeta,
  politeFetch,
  step,
  warn,
  writePackFile,
} from './_lib.ts'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const

const CACHE_FILE = join(OSM_CACHE_DIR, `roads-${PILOT_REGION.bbox.join('_')}.json`)

/** Hard ceiling from the brief. We report if we exceed it, never silently ship. */
const SIZE_BUDGET_BYTES = 1.5 * 1024 * 1024

/** Vehicles allowed. No motorway/trunk: useless for evacuation, expensive in bytes. */
const DRIVABLE = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
])

/** Pedestrians allowed. */
const WALKABLE = new Set([
  'footway',
  'path',
  'pedestrian',
  'steps',
  'track',
  'cycleway',
  'bridleway',
  ...DRIVABLE,
])

/**
 * Only skip genuinely degenerate segments.
 *
 * An earlier 5 m threshold looked reasonable but silently CUT roads: OSM packs
 * many sub-5 m segments into a single way, so dropping them broke the network
 * into 6000+ islands (24% connectivity). Connectivity matters far more than
 * pruning noise, so we only drop zero-length edges.
 */
const MIN_SEGMENT_M = 0.25
/**
 * A dead-end stub shorter than this is pruned (iteratively).
 * Kept modest: at 65 m we lost ~10 points of network connectivity for very few
 * bytes once the JSON writer stopped inflating numeric arrays.
 */
const STUB_MAX_M = 40
/** Connected components smaller than this are dropped as noise. */
const MIN_COMPONENT_NODES = 40
/**
 * Douglas–Peucker tolerance in metres.
 *
 * 12 m is well below a city block, so turn-by-turn guidance still follows real
 * streets, while removing most of the ~48 000 raw nodes.
 */
const SIMPLIFY_TOLERANCE_M = 12

interface OverpassGeometryPoint {
  readonly lat: number
  readonly lon: number
}

interface OverpassWay {
  readonly type: 'way'
  readonly id: number
  readonly nodes?: readonly number[]
  readonly geometry?: readonly OverpassGeometryPoint[]
  readonly tags?: Record<string, string>
}

interface OverpassResponse {
  readonly elements: readonly OverpassWay[]
}

function buildQuery(): string {
  const [west, south, east, north] = PILOT_REGION.bbox
  const bbox = `${south},${west},${north},${east}`
  const classes = [...new Set([...DRIVABLE, ...WALKABLE])].join('|')
  return `[out:json][timeout:180];
way["highway"~"^(${classes})$"](${bbox})[!area][!indoor];
out body geom;`
}

/** Great-circle distance in metres. */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_008.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Flag byte for one way. */
function flagsFor(tags: Record<string, string> | undefined, highway: string): number {
  let flags = 0
  if (DRIVABLE.has(highway)) flags |= EDGE_FLAG.DRIVABLE
  if (WALKABLE.has(highway)) flags |= EDGE_FLAG.WALKABLE

  const name = (tags?.['name'] ?? '') + ' ' + (tags?.['name:en'] ?? '')
  const waterway = tags?.['waterway']
  const looksWet =
    waterway !== undefined ||
    /\b(river|canal|stream|nagar|kulaiyaru|coast|bay|creek)\b/i.test(name) ||
    tags?.['flood'] !== undefined
  if (looksWet) flags |= EDGE_FLAG.WATER

  if (
    tags?.['bridge'] !== undefined ||
    tags?.['tunnel'] !== undefined ||
    tags?.['layer'] !== undefined
  ) {
    flags |= EDGE_FLAG.CROSSING
  }
  return flags
}

interface Draft {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

/**
 * A usable OSM way: node ids and geometry are index-aligned.
 */
interface UsableWay {
  readonly ids: readonly number[]
  readonly points: readonly OverpassGeometryPoint[]
  readonly tags: Record<string, string> | undefined
}

/** Keep only ways we can actually turn into edges. */
function extractWays(ways: readonly OverpassWay[]): UsableWay[] {
  const out: UsableWay[] = []
  for (const way of ways) {
    const nodeIds = way.nodes ?? []
    const geometry = way.geometry ?? []
    // `out body geom` gives both, index-aligned. If either is missing we skip
    // the way rather than guessing geometry from the node list.
    if (nodeIds.length < 2 || geometry.length < 2 || nodeIds.length !== geometry.length) continue
    out.push({ ids: nodeIds, points: geometry, tags: way.tags })
  }
  return out
}

/** Convert usable ways into a node/edge graph keyed by OSM node id. */
function buildGraph(ways: readonly UsableWay[]): Draft {
  const positions = new Map<number, RoadNode>()
  const edges: RoadEdge[] = []

  for (const way of ways) {
    const highway = way.tags?.['highway']
    if (!highway) continue

    const flags = flagsFor(way.tags, highway)

    for (let i = 0; i < way.ids.length; i += 1) {
      const id = way.ids[i]
      const point = way.points[i]
      if (id === undefined || point === undefined) continue

      if (!positions.has(id)) {
        positions.set(id, {
          id,
          lat: Number(point.lat.toFixed(COORD_DECIMALS)),
          lon: Number(point.lon.toFixed(COORD_DECIMALS)),
        })
      }

      if (i === 0) continue
      const prevId = way.ids[i - 1]
      const prevPoint = way.points[i - 1]
      if (prevId === undefined || prevPoint === undefined) continue

      const length = haversineMetres(prevPoint.lat, prevPoint.lon, point.lat, point.lon)
      if (length < MIN_SEGMENT_M) continue

      edges.push({ from: prevId, to: id, lengthMetres: Math.round(length), flags })
    }
  }

  return { nodes: [...positions.values()], edges }
}

/** Remove duplicate undirected edges (two ways describing the same road). */
/**
 * Perpendicular distance in metres, using a local equirectangular projection.
 * Over a 30 km bbox the error is far below our simplification tolerance.
 */
function perpDistanceMetres(
  p: OverpassGeometryPoint,
  a: OverpassGeometryPoint,
  b: OverpassGeometryPoint,
): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const mPerDegLat = 111_132
  const mPerDegLon = 111_320 * Math.cos(meanLat)

  const px = (lon: number) => lon * mPerDegLon
  const py = (lat: number) => lat * mPerDegLat

  const x1 = px(p.lon)
  const y1 = py(p.lat)
  const x2 = px(a.lon)
  const y2 = py(a.lat)
  const x3 = px(b.lon)
  const y3 = py(b.lat)

  const dx = x3 - x2
  const dy = y3 - y2
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return Math.hypot(x1 - x2, y1 - y2)

  let t = ((x1 - x2) * dx + (y1 - y2) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x1 - (x2 + t * dx), y1 - (y2 + t * dy))
}

/**
 * Douglas–Peucker, keeping only vertices further than `toleranceM` from the
 * chord they sit on. Recursion is iterative so a 500-vertex way cannot blow
 * the stack.
 */
function douglasPeucker(points: readonly OverpassGeometryPoint[], toleranceM: number): number[] {
  const n = points.length
  if (n <= 2) return points.map((_, i) => i)

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const stack: Array<[number, number]> = [[0, n - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (!range) break
    const [first, last] = range
    if (last - first < 2) continue

    let worstIndex = -1
    let worstDistance = 0
    for (let i = first + 1; i < last; i += 1) {
      const point = points[i]
      const start = points[first]
      const end = points[last]
      if (!point || !start || !end) continue
      const distance = perpDistanceMetres(point, start, end)
      if (distance > worstDistance) {
        worstDistance = distance
        worstIndex = i
      }
    }

    if (worstIndex !== -1 && worstDistance > toleranceM) {
      keep[worstIndex] = 1
      stack.push([first, worstIndex], [worstIndex, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(i)
  return out
}

/**
 * Nodes that geometry simplification must never remove.
 *
 * A junction between two OSM ways often has degree exactly 2 (one edge from
 * each way), so a naive degree>2 test would delete it and silently cut the
 * street in half. OSM splits streets into separate ways, so **every way
 * endpoint** is a real junction and must be preserved.
 */
function forcedNodes(ways: readonly UsableWay[], degrees: Map<number, number>): Set<number> {
  const forced = new Set<number>()
  for (const way of ways) {
    const first = way.ids[0]
    const last = way.ids[way.ids.length - 1]
    if (first !== undefined) forced.add(first)
    if (last !== undefined) forced.add(last)
    for (let i = 1; i < way.ids.length - 1; i += 1) {
      const id = way.ids[i]
      if (id !== undefined && (degrees.get(id) ?? 0) !== 2) forced.add(id)
    }
  }
  return forced
}

/**
 * Simplify way geometry, but never drop a junction or a way endpoint.
 * Independent per-way simplification would silently disconnect shared
 * intersections, which is exactly the bug we must avoid.
 */
function simplifyWays(
  ways: readonly UsableWay[],
  forced: Set<number>,
  toleranceM: number,
): UsableWay[] {
  return ways.map((way) => {
    const kept = douglasPeucker(way.points, toleranceM)

    // Add every forced index — NOT only those DP already kept. Filtering `kept`
    // by `forced` would be a no-op and would let junctions be deleted.
    const mustKeep: number[] = []
    for (let i = 0; i < way.ids.length; i += 1) {
      if (forced.has(way.ids[i] as number)) mustKeep.push(i)
    }

    const indices = [...new Set([...kept, ...mustKeep])].sort((a, b) => a - b)

    // A way reduced to fewer than 2 points is unusable; keep the original.
    if (indices.length < 2) return way

    return {
      ids: indices.map((i) => way.ids[i] as number),
      points: indices.map((i) => way.points[i] as OverpassGeometryPoint),
      tags: way.tags,
    }
  })
}

/** Degree (incident edge count) per node in the raw graph. */
function degreesOf(draft: Draft): Map<number, number> {
  const degrees = new Map<number, number>()
  for (const edge of draft.edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1)
    if (edge.to !== edge.from) degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1)
  }
  return degrees
}

/**
 * Component summary for a draft graph.
 *
 * A road graph that looks large but is 200 disconnected islands is useless for
 * routing, so every stage reports this. The largest component is the part of
 * the region a tourist can actually travel across.
 */
function componentStats(draft: Draft): { components: number; largest: number; coverage: number } {
  const adjacency = buildAdjacency(draft.nodes, draft.edges)
  const seen = new Set<number>()
  let components = 0
  let largest = 0

  for (const start of draft.nodes) {
    if (seen.has(start.id)) continue
    components += 1
    let size = 0
    const stack = [start.id]
    seen.add(start.id)
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined) continue
      size += 1
      for (const edge of adjacency.get(id) ?? []) {
        const other: number = edge.from === id ? edge.to : edge.from
        if (other === id || seen.has(other)) continue
        seen.add(other)
        stack.push(other)
      }
    }
    if (size > largest) largest = size
  }

  const total = draft.nodes.length
  return { components, largest, coverage: total === 0 ? 0 : largest / total }
}

/** Compact one-line component report. */
function reportComponents(label: string, draft: Draft): void {
  const stats = componentStats(draft)
  info(
    `${label}: ${stats.components} components, largest ${stats.largest} ` +
      `(${(stats.coverage * 100).toFixed(1)}% of nodes)`,
  )
}

function dedupeEdges(edges: readonly RoadEdge[]): RoadEdge[] {
  const seen = new Set<string>()
  const out: RoadEdge[] = []
  for (const edge of edges) {
    const lo = Math.min(edge.from, edge.to)
    const hi = Math.max(edge.from, edge.to)
    const key = `${lo}:${hi}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(edge)
  }
  return out
}

/** Adjacency map for pruning passes. */
function buildAdjacency(
  nodes: readonly RoadNode[],
  edges: readonly RoadEdge[],
): Map<number, RoadEdge[]> {
  const byId = new Map(nodes.map((n) => [n.id, [] as RoadEdge[]]))
  for (const edge of edges) {
    byId.get(edge.from)?.push(edge)
    if (edge.to !== edge.from) byId.get(edge.to)?.push(edge)
  }
  return byId
}

/**
 * Iteratively remove short dead-end stubs.
 *
 * Keeps the graph usable (junctions survive) while deleting the thousands of
 * tiny driveways and alleys that would otherwise dominate the file size.
 */
function pruneStubs(draft: Draft): Draft {
  const aliveNodes = new Set(draft.nodes.map((n) => n.id))
  let aliveEdges = [...draft.edges]

  for (;;) {
    const live = aliveNodes
    const degree = new Map<number, number>()
    for (const edge of aliveEdges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
      if (edge.to !== edge.from) degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
    }

    const doomedEdges = new Set<number>()
    for (const [index, edge] of aliveEdges.entries()) {
      if (edge.to === edge.from) continue
      const fromDeg = degree.get(edge.from) ?? 0
      const toDeg = degree.get(edge.to) ?? 0
      const deadEnd = fromDeg === 1 || toDeg === 1
      if (deadEnd && edge.lengthMetres <= STUB_MAX_M) {
        doomedEdges.add(index)
        live.delete(edge.from)
        live.delete(edge.to)
      }
    }

    if (doomedEdges.size === 0) break
    aliveEdges = aliveEdges.filter((_, i) => !doomedEdges.has(i))
  }

  return {
    nodes: draft.nodes.filter((n) => aliveNodes.has(n.id)),
    edges: aliveEdges.filter((e) => aliveNodes.has(e.from) && aliveNodes.has(e.to)),
  }
}

/** Keep only connected components with at least `MIN_COMPONENT_NODES` nodes. */
function dropSmallComponents(draft: Draft): Draft {
  const adjacency = buildAdjacency(draft.nodes, draft.edges)
  const seen = new Set<number>()
  const keep = new Set<number>()

  for (const start of draft.nodes) {
    if (seen.has(start.id)) continue
    const stack = [start.id]
    const component: number[] = []
    seen.add(start.id)

    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined) continue
      component.push(id)
      for (const edge of adjacency.get(id) ?? []) {
        const other: number = edge.from === id ? edge.to : edge.from
        if (other === id || seen.has(other)) continue
        seen.add(other)
        stack.push(other)
      }
    }

    if (component.length >= MIN_COMPONENT_NODES) for (const id of component) keep.add(id)
  }

  return {
    nodes: draft.nodes.filter((n) => keep.has(n.id)),
    edges: draft.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  }
}

/** Drop nodes that lost all their edges during pruning. */
function dropOrphanNodes(draft: Draft): Draft {
  const used = new Set<number>()
  for (const edge of draft.edges) {
    used.add(edge.from)
    used.add(edge.to)
  }
  return { nodes: draft.nodes.filter((n) => used.has(n.id)), edges: draft.edges }
}

/** Rename OSM ids to 0..n-1 so the shipped file uses small integers. */
function compactIds(draft: Draft): Draft {
  const remap = new Map<number, number>()
  const nodes = draft.nodes.map((node, index) => {
    remap.set(node.id, index)
    return { id: index, lat: node.lat, lon: node.lon }
  })
  const edges = draft.edges.map((edge) => ({
    from: remap.get(edge.from) ?? -1,
    to: remap.get(edge.to) ?? -1,
    lengthMetres: edge.lengthMetres,
    flags: edge.flags,
  }))
  return { nodes, edges: edges.filter((e) => e.from >= 0 && e.to >= 0) }
}

async function readCache(): Promise<OverpassResponse | null> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8')) as OverpassResponse
  } catch {
    return null
  }
}

async function queryOverpass(): Promise<OverpassResponse> {
  const body = new URLSearchParams({ data: buildQuery() }).toString()
  const errors: string[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      info(`querying ${endpoint} (one request, 180 s timeout)…`)
      const response = await politeFetch(endpoint, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: 180_000,
      })
      if (!response.ok) {
        errors.push(`${endpoint} → HTTP ${response.status}`)
        continue
      }
      const parsed = (await response.json()) as OverpassResponse
      if (!Array.isArray(parsed.elements)) {
        errors.push(`${endpoint} → malformed response`)
        continue
      }
      return parsed
    } catch (error) {
      errors.push(`${endpoint} → ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  fail(
    `Overpass is unreachable, so no road graph was written.\n  ${errors.join('\n  ')}\n\n` +
      '  Use the cache at .cache/osm, or build the sample graph with:\n' +
      '    npm run pack:build -- --offline',
  )
}

/**
 * Tiny hand-written grid around Mamallapuram, used only when offline.
 * Marked with sampleIds so M8 refuses to route on it without a warning.
 */
function sampleGraph(): Draft {
  const nodes: RoadNode[] = []
  const edges: RoadEdge[] = []
  const base = { lat: 12.6208, lon: 80.1945 }
  const rows = 4
  const cols = 4
  const dLat = 0.002
  const dLon = 0.002

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      nodes.push({
        id: nodes.length,
        lat: Number((base.lat + r * dLat).toFixed(COORD_DECIMALS)),
        lon: Number((base.lon + c * dLon).toFixed(COORD_DECIMALS)),
      })
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const id = r * cols + c
      if (c + 1 < cols) {
        edges.push({
          from: id,
          to: id + 1,
          lengthMetres: 220,
          flags: EDGE_FLAG.DRIVABLE | EDGE_FLAG.WALKABLE,
        })
      }
      if (r + 1 < rows) {
        edges.push({
          from: id,
          to: id + cols,
          lengthMetres: 222,
          flags: EDGE_FLAG.DRIVABLE | EDGE_FLAG.WALKABLE,
        })
      }
    }
  }
  return { nodes, edges }
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline')
  const refresh = process.argv.includes('--refresh')
  step('build-road-graph — offline routing graph')

  let response: OverpassResponse | null = null

  if (!offline) {
    if (!refresh) {
      const cached = await readCache()
      if (cached) {
        info('using cached Overpass response')
        response = cached
      }
    }
    response ??= await queryOverpass()
    await mkdir(OSM_CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(response), 'utf8')
    info('cached raw response → .cache/osm/')
  }

  let draft: Draft
  let sample = false

  if (response) {
    info(`raw ways: ${response.elements.length}`)
    const usable = extractWays(response.elements)
    const raw = buildGraph(usable)
    info(`raw graph: ${raw.nodes.length} nodes, ${raw.edges.length} edges`)
    reportComponents('raw connectivity', raw)

    // Degree pass first: junctions must survive geometry simplification.
    const degrees = degreesOf(raw)
    const simplifiedWays = simplifyWays(usable, forcedNodes(usable, degrees), SIMPLIFY_TOLERANCE_M)
    draft = buildGraph(simplifiedWays)
    info(`after simplification: ${draft.nodes.length} nodes, ${draft.edges.length} edges`)
    reportComponents('after simplification', draft)

    // Pruning stages, each consuming and returning a Draft.
    let simplified: Draft = { nodes: draft.nodes, edges: dedupeEdges(draft.edges) }
    simplified = dropSmallComponents(simplified)
    simplified = pruneStubs(simplified)
    simplified = dropOrphanNodes(simplified)
    draft = compactIds(simplified)
    info(`final: ${draft.nodes.length} nodes, ${draft.edges.length} edges`)
    reportComponents('final connectivity', draft)
  } else {
    warn('offline mode — writing a clearly-marked SAMPLE grid, not real roads')
    draft = compactIds(sampleGraph())
    sample = true
  }

  if (draft.nodes.length === 0 || draft.edges.length === 0) {
    fail('Road graph came out empty. Refusing to ship a pack that cannot route.')
  }

  // Pack to tuples only at the very end: the pruning passes want named fields.
  const file: RoadsFile = {
    _meta: packMeta(),
    regionId: PILOT_REGION.id,
    nodeCount: draft.nodes.length,
    edgeCount: draft.edges.length,
    nodes: draft.nodes.map((n): RoadNodeTuple => [n.id, n.lat, n.lon]),
    edges: draft.edges.map((e): RoadEdgeTuple => [e.from, e.to, e.lengthMetres, e.flags]),
    ...(sample ? { sample: true } : {}),
  }

  const full = await writePackFile('roads.json', file)
  const { size } = await stat(full)

  const walkable = draft.edges.filter((e) => (e.flags & EDGE_FLAG.WALKABLE) !== 0).length
  const drivable = draft.edges.filter((e) => (e.flags & EDGE_FLAG.DRIVABLE) !== 0).length
  const water = draft.edges.filter((e) => (e.flags & EDGE_FLAG.WATER) !== 0).length

  info(`wrote roads.json — ${(size / 1024).toFixed(1)} KiB`)
  info(`    walkable edges: ${walkable} · drivable edges: ${drivable} · water-adjacent: ${water}`)
  if (size > SIZE_BUDGET_BYTES) {
    warn(
      `roads.json is ${(size / 1048576).toFixed(2)} MiB, over the ${(SIZE_BUDGET_BYTES / 1048576).toFixed(2)} MiB budget.`,
    )
    warn('Consider tightening the bbox or raising STUB_MAX_M in this script.')
  }
}

await main()
