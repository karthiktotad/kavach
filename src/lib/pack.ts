/**
 * PackManager — downloads the content pack into IndexedDB and serves it back.
 *
 * The pack is the single source of truth for offline mode (AGENTS.md §3).
 * This is what turns "the app exists" into "the app is useful with no network".
 *
 * Guarantees:
 *  - Every file is verified against the manifest's SHA-256 before it is stored.
 *    A corrupted or tampered file is discarded and re-fetched, never used.
 *  - Downloads resume: a file already present at the current version is skipped,
 *    so an interrupted run costs only what it had not yet finished.
 *  - Only what the user needs is downloaded. English is always fetched (the
 *    fallback language); other locales are fetched on demand, which keeps the
 *    pack small enough for a tourist on hotel wi-fi.
 *  - Storage is requested as *persistent* so the OS will not evict the pack —
 *    the one thing that must survive is exactly the thing an OS evicts first.
 */
import { getDb, getSetting, setSetting, SETTING } from './db'
import {
  type ContactsFile,
  type KbFile,
  type ManifestFileEntry,
  type PackManifest,
  type PhrasesFile,
  type PlacesFile,
  type RoadsFile,
  type TemplatesFile,
  type ZonesGeoJson,
} from './packTypes'

/** Files that are always fetched, whatever language the tourist picked. */
const CORE_FILES = ['places.json', 'roads.json', 'zones.geojson', 'contacts.json'] as const

/** Locales fetched in addition to the selected one, to bound pack size. */
const DEFAULT_FALLBACKS = ['en'] as const

export type PackStatus = 'not-installed' | 'downloading' | 'ready' | 'update-available' | 'error'

export interface PackProgress {
  /** Files completed in this run. */
  readonly done: number
  /** Total files this run intends to fetch. */
  readonly total: number
  /** Bytes fetched so far in this run. */
  readonly bytes: number
  /** Currently-downloading path, for the progress label. */
  readonly current: string | null
}

export interface PackState {
  readonly status: PackStatus
  readonly version: string | null
  readonly progress: PackProgress
  readonly error: string | null
}

const IDLE: PackState = {
  status: 'not-installed',
  version: null,
  progress: { done: 0, total: 0, bytes: 0, current: null },
  error: null,
}

/** Locales this build has a bundle for; avoids 404s on the on-demand fetch. */
const AVAILABLE_LOCALES = ['en', 'ta', 'hi', 'fr', 'de', 'ar', 'zh', 'ja'] as const

export type Listener = (state: PackState) => void

export interface PackManagerOptions {
  /** Base URL of the pack, e.g. `/pack`. */
  readonly baseUrl?: string
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch
}

export class PackManager {
  private state: PackState = IDLE
  private readonly listeners = new Set<Listener>()
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private manifest: PackManifest | null = null

  constructor(options: PackManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/pack').replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a))
  }

  getState(): PackState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  /**
   * Ask the OS not to evict our storage.
   *
   * Best-effort: Safari and Firefox decline, and Firefox private mode throws.
   * That is fine — the pack still works, it is just less likely to survive a
   * storage crunch, so the UI shows the pack size and lets the user delete it.
   */
  async requestPersistence(): Promise<boolean> {
    try {
      if (navigator.storage?.persist) {
        const granted = await navigator.storage.persist()
        if (granted) return true
      }
      if (navigator.storage?.persisted) {
        return await navigator.storage.persisted()
      }
    } catch {
      // Denied or unsupported: not fatal.
    }
    return false
  }

  /** Manifest we last downloaded, or null if we have never fetched one. */
  getManifest(): PackManifest | null {
    return this.manifest
  }

  /** Files already stored at `version`. */
  async installedFiles(version = this.state.version): Promise<Set<string>> {
    const rows = await getDb()
      .packFiles.where('version')
      .equals(version ?? '')
      .toArray()
    return new Set(rows.map((r) => r.key))
  }

  /**
   * Ensure the pack is installed, downloading only what is missing or changed.
   *
   * `locales` are fetched in addition to English. Passing a large list is the
   * user's choice, not ours.
   */
  async ensureInstalled(locales: readonly string[] = []): Promise<PackState> {
    if (this.state.status === 'downloading') return this.state

    let manifest: PackManifest
    try {
      manifest = await this.fetchManifest()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Offline with a pack already installed is not an error — it is the goal.
      const installed = await this.hasAnyPack()
      this.set({
        status: installed ? 'ready' : 'error',
        error: installed ? null : message,
        version: installed ? this.state.version : null,
      })
      return this.state
    }

    this.manifest = manifest
    const stored = await this.installedFiles(manifest.version)

    const wanted = this.plan(manifest, locales)
    const missing = wanted.filter((f) => !stored.has(f.path))
    // Everything wanted is already here at this version.
    if (missing.length === 0) {
      this.set({ status: 'ready', version: manifest.version, error: null })
      await setSetting(SETTING.PACK_VERSION, manifest.version)
      void this.requestPersistence()
      return this.state
    }

    this.set({
      status: 'downloading',
      version: manifest.version,
      error: null,
      progress: { done: 0, total: missing.length, bytes: 0, current: missing[0]?.path ?? null },
    })

    let bytes = 0
    let done = 0

    for (const entry of missing) {
      try {
        bytes += await this.downloadFile(manifest, entry)
      } catch (error) {
        this.set({
          status: 'error',
          error: `${entry.path}: ${error instanceof Error ? error.message : String(error)}`,
        })
        return this.state
      }
      done += 1
      this.set({
        progress: { done, total: missing.length, bytes, current: entry.path },
      })
    }

    // Drop files from an older version so storage does not grow forever.
    await this.pruneStaleVersions(manifest.version)

    this.set({ status: 'ready', version: manifest.version, error: null })
    await setSetting(SETTING.PACK_VERSION, manifest.version)
    void this.requestPersistence()
    return this.state
  }

  /**
   * Check the manifest without downloading.
   *
   * Returns true when a newer version exists — the UI offers this as a
   * non-blocking prompt, because replacing the pack mid-crisis would be worse
   * than being slightly out of date.
   */
  async checkForUpdate(): Promise<{ updateAvailable: boolean; version: string | null }> {
    try {
      const manifest = await this.fetchManifest()
      const storedVersion =
        this.state.version ?? (await getSetting<string | null>(SETTING.PACK_VERSION, null))

      const updateAvailable = storedVersion !== null && manifest.version !== storedVersion
      this.set({
        status: updateAvailable
          ? 'update-available'
          : this.state.status === 'not-installed'
            ? 'not-installed'
            : 'ready',
        version: manifest.version,
      })
      return { updateAvailable, version: manifest.version }
    } catch {
      // Offline: whatever we have is what we keep.
      return { updateAvailable: false, version: this.state.version }
    }
  }

  // -------------------------------------------------------------------------
  // Typed getters — each reads from IndexedDB and parses on demand.
  // -------------------------------------------------------------------------

  async getPlaces(): Promise<PlacesFile> {
    return this.readJson<PlacesFile>('places.json')
  }

  async getRoads(): Promise<RoadsFile> {
    return this.readJson<RoadsFile>('roads.json')
  }

  async getZones(): Promise<ZonesGeoJson> {
    return this.readJson<ZonesGeoJson>('zones.geojson')
  }

  async getContacts(): Promise<ContactsFile> {
    return this.readJson<ContactsFile>('contacts.json')
  }

  /** Knowledge base, falling back to English when the locale is absent. */
  async getKb(locale: string): Promise<KbFile> {
    return this.readLocalized<KbFile>('kb', locale)
  }

  async getTemplates(locale: string): Promise<TemplatesFile> {
    return this.readLocalized<TemplatesFile>('templates', locale)
  }

  async getPhrases(locale: string): Promise<PhrasesFile> {
    return this.readLocalized<PhrasesFile>('phrases', locale)
  }

  /** True when at least one pack file is stored, whatever version. */
  async hasAnyPack(): Promise<boolean> {
    return (await getDb().packFiles.count()) > 0
  }

  /** Total bytes currently stored, for the storage screen. */
  async storageUsed(): Promise<number> {
    const rows = await getDb().packFiles.toArray()
    return rows.reduce((sum, r) => sum + r.bytes, 0)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private set(patch: Partial<PackState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  private async fetchManifest(): Promise<PackManifest> {
    const response = await this.fetchImpl(`${this.baseUrl}/manifest.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`)
    return (await response.json()) as PackManifest
  }

  /**
   * Which files this install wants.
   *
   * Core geometry is always needed; knowledge content follows the chosen
   * language plus English, which is the fallback when a translation is missing.
   */
  private plan(manifest: PackManifest, locales: readonly string[]): ManifestFileEntry[] {
    const wanted = new Set<string>(CORE_FILES)
    const langs = new Set<string>(DEFAULT_FALLBACKS)
    for (const locale of locales) {
      if ((AVAILABLE_LOCALES as readonly string[]).includes(locale)) langs.add(locale)
    }
    for (const lang of langs) {
      wanted.add(`kb/${lang}.json`)
      wanted.add(`templates/${lang}.json`)
      wanted.add(`phrases/${lang}.json`)
    }
    return manifest.files.filter((f) => wanted.has(f.path))
  }

  /**
   * Download one file, verify its hash, and store it.
   *
   * A hash mismatch deletes whatever we have for that key and throws, so the
   * next run re-fetches from scratch rather than serving bad bytes.
   */
  private async downloadFile(manifest: PackManifest, entry: ManifestFileEntry): Promise<number> {
    const response = await this.fetchImpl(`${this.baseUrl}/${entry.path}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const body = await response.text()
    const digest = await sha256Hex(body)

    if (digest !== entry.sha256) {
      await getDb().packFiles.delete(entry.path)
      throw new Error(
        `checksum mismatch (expected ${entry.sha256.slice(0, 8)}…, got ${digest.slice(0, 8)}…)`,
      )
    }

    // Reject anything that is not JSON, even if it hashes correctly: a valid
    // hash of a valid error page would still break every reader.
    try {
      JSON.parse(body)
    } catch {
      await getDb().packFiles.delete(entry.path)
      throw new Error('not valid JSON')
    }

    await getDb().packFiles.put({
      key: entry.path,
      version: manifest.version,
      data: body,
      bytes: entry.bytes,
      sha256: entry.sha256,
      fetchedAt: Date.now(),
    })

    return entry.bytes
  }

  private async pruneStaleVersions(keepVersion: string): Promise<void> {
    const rows = await getDb().packFiles.toArray()
    const stale = rows.filter((r) => r.version !== keepVersion)
    await getDb().packFiles.bulkDelete(stale.map((r) => r.key))
  }

  private async readJson<T>(key: string): Promise<T> {
    const row = await getDb().packFiles.get(key)
    if (!row) throw new Error(`pack file missing: ${key}`)
    return JSON.parse(row.data) as T
  }

  /** Try the requested locale, then English, then throw. */
  private async readLocalized<T>(dir: string, locale: string): Promise<T> {
    try {
      return await this.readJson<T>(`${dir}/${locale}.json`)
    } catch {
      return await this.readJson<T>(`${dir}/en.json`)
    }
  }
}

/** SHA-256 as lowercase hex, via WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The app-wide singleton. */
export const packManager = new PackManager()
