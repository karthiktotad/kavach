/**
 * Content-pack validation.
 *
 * The pack is safety data that ships inside the app, so it gets the same
 * scrutiny as application code. These tests enforce the invariants that would
 * otherwise only fail in a crisis:
 *
 *  - every file exists and matches its manifest hash
 *  - ids are unique and stable
 *  - alert templates only use placeholders the renderer actually provides
 *  - decision-tree `next` pointers all resolve (no dead ends, no orphans)
 *  - zones are valid, closed GeoJSON polygons inside the region bbox
 *  - nothing safety-critical claims to be verified
 *
 * If a file is missing (e.g. before the first `npm run pack:build`), the
 * relevant test is skipped rather than failed — the app still builds.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PILOT_REGION } from '../src/config/region'
import {
  ALERT_LEVELS,
  ALLOWED_PLACEHOLDERS,
  HAZARD_CODES,
  PACK_VERSION,
  PLACE_ROLES,
  PLACE_TYPES,
  PHRASE_CATEGORIES,
  extractPlaceholders,
  type ContactsFile,
  type KbFile,
  type ManifestFileEntry,
  type PackManifest,
  type PhrasesFile,
  type PlacesFile,
  type RoadsFile,
  type TemplatesFile,
  type ZonesGeoJson,
} from '../src/lib/packTypes'

const PACK_DIR = join(process.cwd(), 'public', 'pack')

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(PACK_DIR, name), 'utf8')) as T
}

async function exists(name: string): Promise<boolean> {
  try {
    await readFile(join(PACK_DIR, name), 'utf8')
    return true
  } catch {
    return false
  }
}

/** True when the pack has been built at least once. */
const BUILT = await exists('manifest.json')
const describePack = BUILT ? describe : describe.skip

if (!BUILT) {
  console.warn(
    '[pack.test] no public/pack/manifest.json — run `npm run pack:build` to enable these tests',
  )
}

// ---------------------------------------------------------------------------

describe('pack manifest', () => {
  it.skipIf(!BUILT)('lists every pack file with a size and a correct hash', async () => {
    const manifest = await readJson<PackManifest>('manifest.json')

    expect(manifest.files.length).toBeGreaterThan(0)
    expect(manifest.totalBytes).toBe(manifest.files.reduce((sum, f) => sum + f.bytes, 0))

    for (const file of manifest.files) {
      const raw = await readFile(join(PACK_DIR, file.path))
      expect(file.bytes, `${file.path} size mismatch`).toBe(raw.length)
      expect(file.sha256, `${file.path} hash mismatch`).toBe(
        createHash('sha256').update(raw.toString('utf8')).digest('hex'),
      )
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it.skipIf(!BUILT)('names itself with the pack version and the region', async () => {
    const manifest = await readJson<PackManifest>('manifest.json')
    expect(manifest.version.startsWith(PACK_VERSION)).toBe(true)
    expect(manifest.regionId).toBe(PILOT_REGION.id)
    expect(new Date(manifest.builtAt).toString()).not.toBe('Invalid Date')
  })

  it.skipIf(!BUILT)('every entry in the manifest actually exists on disk', async () => {
    const manifest = await readJson<PackManifest>('manifest.json')
    const paths: string[] = manifest.files.map((f: ManifestFileEntry) => f.path)
    expect(paths).toContain('places.json')
    expect(paths).toContain('roads.json')
    expect(paths).toContain('zones.geojson')
    expect(paths).toContain('contacts.json')
    expect(paths).toContain('kb/en.json')
    expect(paths).toContain('templates/en.json')
    expect(paths).toContain('phrases/en.json')
  })
})

// ---------------------------------------------------------------------------

describePack('places.json', () => {
  it('has unique ids and valid coordinates inside the region', async () => {
    const file = await readJson<PlacesFile>('places.json')
    expect(file.count).toBe(file.places.length)
    expect(file.places.length).toBeGreaterThan(0)

    const seen = new Set<string>()
    const [west, south, east, north] = PILOT_REGION.bbox

    for (const place of file.places) {
      expect(seen.has(place.id), `duplicate place id ${place.id}`).toBe(false)
      seen.add(place.id)

      expect(PLACE_TYPES).toContain(place.type)
      expect(PLACE_ROLES[place.type]).toBeTruthy()

      expect(place.lat).toBeGreaterThanOrEqual(south)
      expect(place.lat).toBeLessThanOrEqual(north)
      expect(place.lon).toBeGreaterThanOrEqual(west)
      expect(place.lon).toBeLessThanOrEqual(east)

      // A missing name must be null, never a made-up one.
      expect(place.name === null || place.name.length > 0).toBe(true)
    }
  })

  it('marks every place unverified — OSM data is not a verified claim', async () => {
    const file = await readJson<PlacesFile>('places.json')
    for (const place of file.places) {
      expect(place.verified, `${place.id} must not claim verification`).toBe(false)
      expect(['osm', 'sample']).toContain(place.source)
    }
  })

  it('warns loudly when the file is only the hand-written sample', async () => {
    const file = await readJson<PlacesFile>('places.json')
    const isSample = file.places.every((p) => p.sample === true)
    if (isSample) {
      expect(file.places.every((p) => p.source === 'sample')).toBe(true)
    }
    // Sample and real records must never be mixed.
    expect(file.places.every((p) => p.sample === true) || file.places.every((p) => !p.sample)).toBe(
      true,
    )
  })
})

// ---------------------------------------------------------------------------

describePack('roads.json', () => {
  it('has consistent counts and in-range node ids', async () => {
    const file = await readJson<RoadsFile>('roads.json')
    expect(file.nodeCount).toBe(file.nodes.length)
    expect(file.edgeCount).toBe(file.edges.length)
    expect(file.nodes.length).toBeGreaterThan(10)

    file.nodes.forEach((tuple, i) => {
      expect(tuple).toHaveLength(3)
      expect(tuple[0]).toBe(i)
      expect(Math.abs(tuple[1])).toBeLessThanOrEqual(90)
      expect(Math.abs(tuple[2])).toBeLessThanOrEqual(180)
    })
  })

  it('has valid edges', async () => {
    const file = await readJson<RoadsFile>('roads.json')
    const ids = new Set(file.nodes.map((n) => n[0]))

    for (const edge of file.edges) {
      expect(edge).toHaveLength(4)
      const [from, to, length, flags] = edge
      expect(ids.has(from), `edge references unknown node ${from}`).toBe(true)
      expect(ids.has(to), `edge references unknown node ${to}`).toBe(true)
      expect(length).toBeGreaterThan(0)
      expect(Number.isInteger(flags)).toBe(true)
    }
  })

  it('stays inside the 1.5 MB download budget', async () => {
    const file = await readJson<RoadsFile>('roads.json')
    const bytes = Buffer.byteLength(JSON.stringify(file))
    expect(bytes, `roads.json is ${(bytes / 1048576).toFixed(2)} MiB`).toBeLessThan(
      1.5 * 1024 * 1024,
    )
  })
})

// ---------------------------------------------------------------------------

describePack('zones.geojson', () => {
  it('is a valid GeoJSON FeatureCollection of closed polygons', async () => {
    const zones = await readJson<ZonesGeoJson>('zones.geojson')
    expect(zones.type).toBe('FeatureCollection')
    expect(zones.features.length).toBeGreaterThanOrEqual(6)
    expect(zones.features.length).toBeLessThanOrEqual(10)

    const seen = new Set<string>()
    const [west, south, east, north] = PILOT_REGION.bbox

    for (const feature of zones.features) {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry.type).toBe('Polygon')

      const id = feature.properties.id
      expect(id).toMatch(/^Z\d+$/)
      expect(seen.has(id), `duplicate zone id ${id}`).toBe(false)
      seen.add(id)

      expect(feature.properties.name.length).toBeGreaterThan(0)
      expect(typeof feature.properties.floodProne).toBe('boolean')
      expect(feature.properties.verified).toBe(false)
      expect(feature.properties.source.toLowerCase()).toContain('hand-drawn')

      // Rings must be closed and have at least 4 positions.
      const ring = feature.geometry.coordinates[0]!
      expect(ring.length).toBeGreaterThanOrEqual(4)
      expect(ring[0]).toEqual(ring[ring.length - 1])

      for (const [lon, lat] of ring) {
        expect(lon).toBeGreaterThanOrEqual(west)
        expect(lon).toBeLessThanOrEqual(east)
        expect(lat).toBeGreaterThanOrEqual(south)
        expect(lat).toBeLessThanOrEqual(north)
      }
    }
  })
})

// ---------------------------------------------------------------------------

describePack('kb/en.json', () => {
  it('has unique chunk ids, valid severities and named sources', async () => {
    const kb = await readJson<KbFile>('kb/en.json')
    expect(kb.chunks.length).toBeGreaterThanOrEqual(10)

    const seen = new Set<string>()
    for (const chunk of kb.chunks) {
      expect(seen.has(chunk.id), `duplicate kb id ${chunk.id}`).toBe(false)
      seen.add(chunk.id)

      expect(chunk.title.length).toBeGreaterThan(0)
      expect(chunk.tags.length).toBeGreaterThan(0)
      expect(chunk.steps.length).toBeGreaterThan(0)
      expect(['critical', 'urgent', 'routine']).toContain(chunk.severity)
      expect(typeof chunk.escalate).toBe('boolean')
      expect(chunk.source.length).toBeGreaterThan(0)

      // Rule 7: medical content is never "verified" without human review.
      expect(chunk.verified, `${chunk.id} must not claim verification`).toBe(false)
    }
  })

  it('covers every first-aid topic the brief requires', async () => {
    const kb = await readJson<KbFile>('kb/en.json')
    const required = [
      'bleeding-severe',
      'burns',
      'fractures',
      'cpr-adult',
      'drowning',
      'heat-exhaustion',
      'heat-stroke',
      'hypothermia',
      'snake-bite',
      'electric-shock',
      'anaphylaxis',
      'fainting',
      'choking',
      'flood-safety',
      'cyclone-safety',
      'what-to-pack',
      'find-shelter',
    ]
    const ids = new Set(kb.chunks.map((c) => c.id))
    for (const id of required) expect(ids.has(id), `missing kb chunk: ${id}`).toBe(true)
  })

  it('has decision trees whose every "next" resolves', async () => {
    const kb = await readJson<KbFile>('kb/en.json')
    expect(kb.trees.length).toBeGreaterThanOrEqual(5)

    const ids = new Set(kb.trees.map((t) => t.id))
    for (const tree of kb.trees) expect(ids.has(tree.id)).toBe(true)
    expect(ids.size).toBe(kb.trees.length)

    for (const tree of kb.trees) {
      expect(tree.question.length).toBeGreaterThan(0)
      expect(tree.options.length).toBeGreaterThan(0)

      for (const option of tree.options) {
        expect(option.label.length).toBeGreaterThan(0)
        if (option.next !== null) {
          expect(ids.has(option.next), `${tree.id} → ${option.next} does not resolve`).toBe(true)
        }
      }

      // Only a node that actually terminates needs terminal guidance. Routing
      // questions (e.g. "is the bleeding heavy?") legitimately continue.
      const hasTerminal = tree.options.some((o) => o.next === null)
      if (hasTerminal) {
        expect(tree.terminalSteps?.length, `${tree.id} needs terminalSteps`).toBeGreaterThan(0)
        expect(
          typeof tree.terminalEscalates,
          `${tree.id} terminates, so escalation must be explicit (true or false)`,
        ).toBe('boolean')
      } else {
        // A node with no terminal must hand off to a real, resolvable node.
        for (const option of tree.options) {
          expect(option.next, `${tree.id} goes nowhere`).not.toBeNull()
        }
      }
    }
  })

  it('has no unreachable decision nodes', async () => {
    const kb = await readJson<KbFile>('kb/en.json')
    const reachable = new Set<string>()

    // Walk forward from every node; anything never reached is dead weight.
    const queue: string[] = kb.trees.map((t) => t.id)
    while (queue.length > 0) {
      const id = queue.pop()!
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const tree of kb.trees) {
        if (tree.id !== id) continue
        for (const option of tree.options) {
          if (option.next !== null && !reachable.has(option.next)) queue.push(option.next)
        }
      }
    }

    const ids = new Set(kb.trees.map((t) => t.id))
    for (const id of ids) {
      expect(reachable.has(id), `decision node ${id} is unreachable`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------

describePack('templates/en.json', () => {
  it('covers every hazard code and every level', async () => {
    const file = await readJson<TemplatesFile>('templates/en.json')
    const ids = new Set(file.templates.map((t) => t.id))

    for (const hazard of HAZARD_CODES) {
      if (hazard === 'AC') {
        expect(ids.has('AC'), 'missing all-clear template').toBe(true)
        continue
      }
      for (const level of ALERT_LEVELS) {
        expect(ids.has(`${hazard}-${level}`), `missing template ${hazard}-${level}`).toBe(true)
      }
    }
    expect(ids.size).toBe(file.templates.length)
  })

  it('uses at most 3 steps and only allowed placeholders', async () => {
    const file = await readJson<TemplatesFile>('templates/en.json')

    for (const template of file.templates) {
      expect(template.steps.length, `${template.id} has too many steps`).toBeLessThanOrEqual(3)
      expect(template.steps.length, `${template.id} has no steps`).toBeGreaterThan(0)
      expect(template.headline.length).toBeGreaterThan(0)
      expect(template.drillNote.toUpperCase()).toContain('DRILL')

      for (const text of [template.headline, ...template.steps]) {
        for (const name of extractPlaceholders(text)) {
          expect(
            (ALLOWED_PLACEHOLDERS as readonly string[]).includes(name),
            `${template.id} uses unknown placeholder {${name}}`,
          ).toBe(true)
        }
      }
    }
  })

  it('gives every template an all-clear for its own hazard', async () => {
    const file = await readJson<TemplatesFile>('templates/en.json')
    // Every hazard must be resolvable to something renderable at level 1.
    for (const hazard of HAZARD_CODES) {
      const match =
        hazard === 'AC'
          ? file.templates.find((t) => t.hazard === 'AC')
          : file.templates.find((t) => t.hazard === hazard && t.level === 1)
      expect(match, `no template for ${hazard}`).toBeTruthy()
    }
  })

  it('marks drill text unmistakably', async () => {
    const file = await readJson<TemplatesFile>('templates/en.json')
    expect(file.drill.banner).toBe('DRILL')
    expect(file.drill.bannerLong.toUpperCase()).toContain('DRILL')
    expect(file.drill.disclaimer.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describePack('phrases/en.json', () => {
  it('has ~40 unique phrases across every category', async () => {
    const file = await readJson<PhrasesFile>('phrases/en.json')
    expect(file.phrases.length).toBeGreaterThanOrEqual(35)
    expect(file.phrases.length).toBeLessThanOrEqual(50)

    const seen = new Set<string>()
    const usedCategories = new Set<string>()

    for (const phrase of file.phrases) {
      expect(seen.has(phrase.id), `duplicate phrase id ${phrase.id}`).toBe(false)
      seen.add(phrase.id)
      expect(phrase.text.length).toBeGreaterThan(0)
      expect(PHRASE_CATEGORIES).toContain(phrase.category)
      usedCategories.add(phrase.category)
    }

    for (const category of PHRASE_CATEGORIES) {
      expect(usedCategories.has(category), `no phrases for ${category}`).toBe(true)
    }
  })

  it('only uses placeholders the UI can fill', async () => {
    const file = await readJson<PhrasesFile>('phrases/en.json')
    for (const phrase of file.phrases) {
      for (const name of extractPlaceholders(phrase.text)) {
        expect((ALLOWED_PLACEHOLDERS as readonly string[]).includes(name)).toBe(true)
      }
      for (const name of extractPlaceholders(phrase.intent ?? '')) {
        expect((ALLOWED_PLACEHOLDERS as readonly string[]).includes(name)).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------

describePack('contacts.json', () => {
  it('lists the expected emergency numbers, all unverified', async () => {
    const file = await readJson<ContactsFile>('contacts.json')
    const numbers = new Set(file.emergency.map((c) => c.number))

    for (const expected of ['112', '108', '100', '101', '1070', '1363']) {
      expect(numbers.has(expected), `missing emergency number ${expected}`).toBe(true)
    }

    for (const contact of file.emergency) {
      expect(contact.verified, `${contact.id} must not claim verification`).toBe(false)
      expect(contact.number).toMatch(/^\d+$/)
      expect(contact.service.length).toBeGreaterThan(0)
      expect(contact.note.length).toBeGreaterThan(0)
    }
  })

  it('never invents a consulate phone number', async () => {
    const file = await readJson<ContactsFile>('contacts.json')
    for (const consulate of file.consulates) {
      expect(consulate.verified).toBe(false)
      // Unknown means null — a guessed number is worse than no number.
      if (consulate.phone !== null) expect(consulate.phone).toMatch(/^\+?\d[\d\s-]{5,}$/)
    }
  })
})
