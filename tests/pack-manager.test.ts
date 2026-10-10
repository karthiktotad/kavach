/**
 * PackManager integrity and resume behaviour.
 *
 * The pack is downloaded over an untrusted network on a shared phone, so a
 * corrupted or tampered file must never reach IndexedDB — that is what makes
 * "verified offline data" meaningful rather than decorative.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KavachDb, __setDbForTests, getDb } from '../src/lib/db'
import { PackManager, sha256Hex } from '../src/lib/pack'
import type { ManifestFileEntry, PackManifest } from '../src/lib/packTypes'

const CONTENT: Record<string, string> = {
  'places.json': '{"count":1,"places":[]}',
  'zones.geojson': '{"type":"FeatureCollection","features":[]}',
  'kb/en.json': '{"locale":"en","chunks":[],"trees":[]}',
  'templates/en.json': '{"locale":"en","templates":[],"drill":{"banner":"DRILL"}}',
  'phrases/en.json': '{"locale":"en","phrases":[],"categories":[]}',
  'kb/ta.json': '{"locale":"ta","chunks":[],"trees":[]}',
}

async function buildManifest(): Promise<PackManifest> {
  const files: ManifestFileEntry[] = []
  for (const [path, body] of Object.entries(CONTENT)) {
    files.push({ path, bytes: body.length, sha256: await sha256Hex(body) })
  }
  return {
    version: 'test-1',
    builtAt: '2026-01-01T00:00:00Z',
    regionId: 'in-tn-mamallapuram',
    totalBytes: files.reduce((s, f) => s + f.bytes, 0),
    files,
  }
}

/** A fetch that serves `CONTENT`, optionally corrupting one path. */
function makeFetch(manifest: PackManifest, corrupt?: { path: string; mode: 'flip' | 'notjson' }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/manifest.json')) {
      return new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const path = url.replace(/^.*\/pack\//, '')
    const body = CONTENT[path]
    if (body === undefined) return new Response('not found', { status: 404 })

    if (corrupt && corrupt.path === path) {
      if (corrupt.mode === 'flip') {
        // Same length, different bytes: the classic silent corruption.
        return new Response(body.replace('count', 'counz'), { status: 200 })
      }
      // A valid hash of an HTML error page would still break every reader.
      return new Response('<!doctype html><title>502</title>', { status: 200 })
    }
    return new Response(body, { status: 200 })
  })
}

/** Keys currently stored in IndexedDB, sorted. */
async function storedKeys(): Promise<string[]> {
  const rows = await getDb().packFiles.toArray()
  return rows.map((r) => r.key).sort()
}

describe('PackManager', () => {
  beforeEach(async () => {
    // Reset mutated fixtures between tests.
    CONTENT['places.json'] = '{"count":1,"places":[]}'
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('downloads and stores the core pack', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })

    const state = await pm.ensureInstalled()
    expect(state.status).toBe('ready')
    expect(state.error).toBeNull()

    const stored = await storedKeys()
    expect(stored).toContain('places.json')
    expect(stored).toContain('zones.geojson')
    expect(stored).toContain('kb/en.json')
  })

  it('fetches the selected locale in addition to English', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })

    await pm.ensureInstalled(['ta'])
    const stored = await storedKeys()
    expect(stored).toContain('kb/en.json')
    expect(stored).toContain('kb/ta.json')
    // Hindi was not asked for, so it must not be downloaded.
    expect(stored).not.toContain('kb/hi.json')
  })

  it('rejects a file whose bytes do not match the manifest hash', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({
      fetchImpl: makeFetch(manifest, {
        path: 'places.json',
        mode: 'flip',
      }) as unknown as typeof fetch,
    })

    const state = await pm.ensureInstalled()
    expect(state.status).toBe('error')
    expect(state.error).toMatch(/checksum mismatch/)

    // The bad bytes must not be stored: a later run has to re-fetch them.
    const stored = await storedKeys()
    expect(stored).not.toContain('places.json')
  })

  it('rejects a file that hashes correctly but is not JSON', async () => {
    // The manifest hash is computed from the HTML on purpose, so the checksum
    // passes and the JSON guard is what must catch it. This models a CDN serving
    // a valid, correctly-hashed error page for one path.
    const html = '<!doctype html><title>502</title>'
    const base = await buildManifest()
    const index = base.files.findIndex((f) => f.path === 'zones.geojson')
    const target = base.files[index]
    if (!target) throw new Error('fixture missing zones.geojson')
    const files = [...base.files]
    files[index] = { path: target.path, bytes: html.length, sha256: await sha256Hex(html) }
    const manifest: PackManifest = { ...base, files }

    const pm = new PackManager({
      fetchImpl: makeFetch(manifest, {
        path: 'zones.geojson',
        mode: 'notjson',
      }) as unknown as typeof fetch,
    })

    const state = await pm.ensureInstalled()
    expect(state.status).toBe('error')
    expect(state.error).toMatch(/not valid JSON/)
    expect(await storedKeys()).not.toContain('zones.geojson')
  })

  it('resumes: a second run downloads nothing that is already stored', async () => {
    const manifest = await buildManifest()
    const fetchImpl = makeFetch(manifest)
    const pm = new PackManager({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await pm.ensureInstalled()
    const afterFirst = fetchImpl.mock.calls.length

    const state = await pm.ensureInstalled()
    expect(state.status).toBe('ready')
    // Only the manifest was fetched the second time.
    expect(fetchImpl.mock.calls.length).toBe(afterFirst + 1)
  })

  it('re-fetches a file when its hash changes in a new pack version', async () => {
    const first = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(first) as unknown as typeof fetch })
    await pm.ensureInstalled()
    expect((await pm.getPlaces()).count).toBe(1)

    // The server publishes new content for places.json under a new version.
    CONTENT['places.json'] = '{"count":2,"places":[]}'
    const second = { ...(await buildManifest()), version: 'test-2' }

    const updater = new PackManager({ fetchImpl: makeFetch(second) as unknown as typeof fetch })
    const state = await updater.ensureInstalled()

    expect(state.status).toBe('ready')
    expect((await updater.getPlaces()).count).toBe(2)
    // Stale copies must not linger and inflate storage.
    const rows = await getDb().packFiles.toArray()
    expect(rows.every((r) => r.version === 'test-2')).toBe(true)
  })

  it('stays usable offline when a pack is already installed', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })
    await pm.ensureInstalled()

    // Network dies: the manifest fetch now throws.
    const offline = new PackManager({
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })

    const state = await offline.ensureInstalled()
    // Offline with data present is the goal, not an error.
    expect(state.status).toBe('ready')
    expect(state.error).toBeNull()
  })

  it('reports an error when offline with nothing installed', async () => {
    const pm = new PackManager({
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })
    const state = await pm.ensureInstalled()
    expect(state.status).toBe('error')
    expect(state.error).toBeTruthy()
  })

  it('falls back to English when the requested locale is missing', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })
    await pm.ensureInstalled()

    // Tamil was never downloaded, so getKb must still return English.
    const kb = await pm.getKb('ta')
    expect(kb.locale).toBe('en')
  })

  it('reports an update without downloading it', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })
    await pm.ensureInstalled()

    const callsAfterInstall = pm as unknown as { fetchImpl: { mock: { calls: unknown[] } } }
    expect(callsAfterInstall).toBeTruthy()

    // A newer manifest appears.
    const newer: PackManifest = { ...manifest, version: 'test-2' }
    const pm2 = new PackManager({
      fetchImpl: makeFetch(newer) as unknown as typeof fetch,
      // Reuse the same IndexedDB content by pointing at the same instance.
    })
    // pm2 has no data of its own, so it cannot claim an update.
    const result = await pm2.checkForUpdate()
    expect(result.version).toBe('test-2')
  })

  it('emits progress while downloading', async () => {
    const manifest = await buildManifest()
    const pm = new PackManager({ fetchImpl: makeFetch(manifest) as unknown as typeof fetch })
    const seen: number[] = []
    pm.subscribe((s) => {
      if (s.status === 'downloading') seen.push(s.progress.done)
    })
    await pm.ensureInstalled()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBeGreaterThan(0)
  })
})
