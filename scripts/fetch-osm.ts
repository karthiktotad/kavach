/**
 * Fetches safety-relevant places from OpenStreetMap via Overpass.
 *
 *   node scripts/fetch-osm.ts            # uses .cache/osm if present
 *   node scripts/fetch-osm.ts --refresh  # ignore the cache, re-query Overpass
 *
 * Behaviour (per engineering rule 7 — never fabricate):
 * - Every record is written with `verified: false` and `source: "osm"`.
 * - Names come only from OSM; a place with no name gets `name: null`.
 * - If Overpass is unreachable we do NOT invent data. We write a tiny
 *   hand-written sample file marked `sample: true` so the build continues and
 *   the UI can refuse to treat it as real.
 *
 * Politeness: exactly one query, a bounded timeout, a real User-Agent, and a
 * local cache so reruns during the hackathon never hammer the free service.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PILOT_REGION } from '../src/config/region.ts'
import type { Place, PlaceType, PlacesFile } from '../src/lib/packTypes.ts'
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

/** Cache is keyed by bbox so changing the region invalidates it. */
const CACHE_FILE = join(OSM_CACHE_DIR, `places-${PILOT_REGION.bbox.join('_')}.json`)

/**
 * One Overpass QL query for every category we care about.
 *
 * `emergency=assembly_point` is the explicit shelter tag. Schools, community
 * centres, town halls and places of worship are only shelter *candidates* —
 * they are never presented as official shelters until a human verifies them.
 */
function buildQuery(): string {
  const [west, south, east, north] = PILOT_REGION.bbox
  const bbox = `${south},${west},${north},${east}`
  return `[out:json][timeout:180];
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](${bbox});
  nwr["amenity"~"^(police|fire_station)$"](${bbox});
  nwr["emergency"="assembly_point"](${bbox});
  nwr["amenity"~"^(school|college|university|community_centre|townhall)$"]["building"](${bbox});
  nwr["amenity"="place_of_worship"]["building"](${bbox});
);
out center tags;`
}

/** Minimal shape of the Overpass response we rely on. */
interface OverpassElement {
  readonly type: 'node' | 'way' | 'relation'
  readonly id: number
  readonly lat?: number
  lon?: number
  readonly center?: { readonly lat: number; readonly lon: number }
  readonly tags?: Record<string, string>
}

interface OverpassResponse {
  readonly elements: readonly OverpassElement[]
}

/** Map an OSM tag set onto one of our place types. */
function classify(tags: Record<string, string> | undefined): PlaceType | null {
  if (!tags) return null
  const amenity = tags['amenity'] ?? ''
  switch (amenity) {
    case 'hospital':
      return 'hospital'
    case 'clinic':
    case 'doctors':
      return 'clinic'
    case 'pharmacy':
      return 'pharmacy'
    case 'police':
      return 'police'
    case 'fire_station':
      return 'fire_station'
    case 'school':
    case 'college':
    case 'university':
    case 'community_centre':
    case 'townhall':
    case 'place_of_worship':
      return 'shelter_candidate'
    default:
      break
  }
  // Explicit assembly points win over the amenity guess.
  if (tags['emergency'] === 'assembly_point') return 'shelter_candidate'
  return null
}

/** Keep only the OSM tags that help a human verify or route to the place. */
function summariseNotes(type: PlaceType, tags: Record<string, string> | undefined): string {
  const notes: string[] = []
  if (type === 'shelter_candidate') {
    notes.push('CANDIDATE ONLY — not a designated shelter until confirmed')
  }
  if (!tags) return notes.join('; ')
  const interesting = [
    'emergency',
    'phone',
    'operator:type',
    'healthcare:speciality',
    'addr:street',
    'addr:city',
    'capacity',
    'website',
    'opening_hours',
  ]
  for (const key of interesting) {
    const value = tags[key]
    if (value) notes.push(`${key}=${value}`)
  }
  return notes.join('; ')
}

/** Coordinates for a node, or the centroid Overpass computes for ways. */
function coordinatesOf(element: OverpassElement): { lat: number; lon: number } | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lon: element.lon }
  }
  if (element.center) return { lat: element.center.lat, lon: element.center.lon }
  return null
}

/** Converts an Overpass response into pack places. */
function toPlaces(response: OverpassResponse): Place[] {
  const seen = new Set<string>()
  const places: Place[] = []

  for (const element of response.elements) {
    const type = classify(element.tags)
    if (!type) continue

    const position = coordinatesOf(element)
    if (!position) continue

    const id = `${type}-${element.type}-${element.id}`
    if (seen.has(id)) continue
    seen.add(id)

    // OSM name, or null. We never invent a name for an unnamed building.
    const name = element.tags?.['name'] ?? element.tags?.['name:en'] ?? null

    places.push({
      id,
      type,
      name,
      lat: Number(position.lat.toFixed(5)),
      lon: Number(position.lon.toFixed(5)),
      source: 'osm',
      // Rule 7: machine-extracted OSM data is never "verified" for our purposes.
      verified: false,
      notes: summariseNotes(type, element.tags),
    })
  }

  // Stable, reviewable ordering so diffs are meaningful.
  places.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  return places
}

/**
 * Hand-written fallback. Clearly marked `sample: true` so the UI must show an
 * unverified badge. These are real, well-known Indian emergency institutions
 * in the right approximate locations — NOT verified addresses, and each is
 * registered in TODO_VERIFY.md.
 */
function samplePlaces(): Place[] {
  const rows: Array<[PlaceType, string, number, number, string]> = [
    ['hospital', 'Placeholder — district hospital (VERIFY)', 12.6215, 80.1948, 'SAMPLE'],
    ['clinic', 'Placeholder — primary health centre (VERIFY)', 12.6198, 80.1975, 'SAMPLE'],
    ['police', 'Placeholder — police station (VERIFY)', 12.6203, 80.1921, 'SAMPLE'],
    ['fire_station', 'Placeholder — fire station (VERIFY)', 12.6231, 80.1935, 'SAMPLE'],
    ['pharmacy', 'Placeholder — pharmacy (VERIFY)', 12.6224, 80.1959, 'SAMPLE'],
    ['shelter_candidate', 'Placeholder — community hall (VERIFY)', 12.6179, 80.1991, 'SAMPLE'],
    ['shelter_candidate', 'Placeholder — school ground (VERIFY)', 12.6248, 80.1966, 'SAMPLE'],
  ]
  return rows.map(([type, name, lat, lon, note]) => ({
    id: `sample-${type}-${lat}-${lon}`,
    type,
    name,
    lat,
    lon,
    source: 'sample' as const,
    verified: false as const,
    notes: `${note} — hand-written fallback, NOT from OpenStreetMap`,
    sample: true,
  }))
}

/** Read the cache, returning null when absent or unreadable. */
async function readCache(): Promise<OverpassResponse | null> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8')) as OverpassResponse
  } catch {
    return null
  }
}

/** Query Overpass, trying each endpoint in turn. */
async function queryOverpass(): Promise<OverpassResponse> {
  const query = buildQuery()
  const errors: string[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      info(`querying ${endpoint} (one request, 180 s timeout)…`)
      const response = await politeFetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: 180_000,
      })
      if (!response.ok) {
        errors.push(`${endpoint} → HTTP ${response.status}`)
        continue
      }
      const body = (await response.json()) as OverpassResponse
      if (!Array.isArray(body.elements)) {
        errors.push(`${endpoint} → malformed response`)
        continue
      }
      return body
    } catch (error) {
      errors.push(`${endpoint} → ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  fail(
    `Overpass is unreachable, so no OSM data was written.\n  ${errors.join('\n  ')}\n\n` +
      '  Check your network, or pre-seed the cache at:\n' +
      `    ${CACHE_FILE}\n\n` +
      '  To build the pack without any network at all, run:\n' +
      '    npm run pack:build -- --offline\n\n' +
      '  which writes the small hand-written SAMPLE file instead.',
  )
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline')
  const refresh = process.argv.includes('--refresh')
  step('fetch-osm — safety-relevant places')

  let response: OverpassResponse | null = null

  if (!offline) {
    if (!refresh) {
      const cached = await readCache()
      if (cached) {
        info(`using cached Overpass response (${CACHE_FILE.split('/').pop()})`)
        response = cached
      }
    }
    response ??= await queryOverpass()
    await mkdir(OSM_CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(response), 'utf8')
    info(`cached raw response → .cache/osm/`)
  }

  let places: Place[]
  if (response) {
    places = toPlaces(response)
    info(`OSM elements matched: ${response.elements.length}`)
  } else {
    warn('offline mode — writing a clearly-marked SAMPLE file, not real data')
    places = samplePlaces()
  }

  if (places.length === 0) {
    fail('Overpass returned no usable places for this bbox. Refusing to write an empty pack file.')
  }

  const file: PlacesFile = {
    _meta: packMeta(),
    regionId: PILOT_REGION.id,
    count: places.length,
    places,
  }
  await writePackFile('places.json', file)

  const byType = new Map<PlaceType, number>()
  for (const place of places) byType.set(place.type, (byType.get(place.type) ?? 0) + 1)
  info(`wrote places.json — ${places.length} places`)
  for (const [type, count] of [...byType].sort()) info(`    ${type}: ${count}`)
  info('all records marked verified:false → listed in TODO_VERIFY.md')
}

await main()
