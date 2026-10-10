/**
 * Offline datastore (Dexie / IndexedDB).
 *
 * Two layers of offline (AGENTS.md §8):
 *   (a) the app shell is precached by the service worker;
 *   (b) the content pack is downloaded here, into IndexedDB.
 * This module is layer (b)'s storage plus every queue the app needs to keep
 * working when the network does not.
 *
 * ## Schema versioning
 *
 * Versions are append-only. To change the shape:
 *   1. bump `SCHEMA_VERSION`
 *   2. add `this.version(N+1).stores({...}).upgrade(tx => ...)`
 *   3. never edit an existing version block — Dexie replays them in order to
 *      build a fresh database, so changing history corrupts old installs.
 *
 * `upgrade` runs inside a transaction and must be defensive: it must work on a
 * partially-populated database (user cleared storage mid-update) and must
 * never throw, because a throwing upgrade leaves the user with a broken app.
 */
import Dexie, { type Table } from 'dexie'

/** Bump when a migration below is added. */
export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** A content-pack file cached on device. */
export interface PackFileRow {
  /** Path within the pack, e.g. `kb/ta.json`. Primary key. */
  key: string
  /** Pack version this file was fetched under — stale copies are detectable. */
  version: string
  /** Raw JSON text; parsed lazily by the PackManager. */
  data: string
  bytes: number
  /** SHA-256 from the manifest, verified on download. */
  sha256: string
  fetchedAt: number
}

/** A verified (or explicitly unverified) alert packet. */
export interface PacketRow {
  /** The encoded packet string — its canonical identity. */
  id: string
  hazard: string | null
  level: number | null
  zoneIds: string[]
  issuedAt: number
  expiresAt: number | null
  keyId: string | null
  /** Verification outcome. Never assume true. */
  verified: boolean
  verifyError: string | null
  /** Drills are always labelled; never present one as real. */
  isDrill: boolean
  source: 'sync' | 'sms' | 'qr' | 'share' | 'manual'
  receivedAt: number
}

/** A decoded, renderable alert. */
export interface AlertRow {
  id: string
  packetId: string
  templateId: string
  hazard: string
  level: number | null
  zoneIds: string[]
  headline: string
  steps: string[]
  issuedAt: number
  expiresAt: number | null
  isDrill: boolean
  acknowledged: boolean
  updatedAt: number
}

/** Server-computed per-zone risk, cached so it can be shown offline. */
export interface RiskSnapshotRow {
  /** Region id — one current snapshot per region. */
  id: string
  zones: Array<{ zoneId: string; level: number; reason: string }>
  computedAt: number
  /** False when the snapshot came from a degraded or cached source. */
  fresh: boolean
}

/** A queued write awaiting a network. */
export interface OutboxRow {
  /** Client-generated UUID: the idempotency key. */
  id: string
  type: string
  payload: unknown
  status: 'queued' | 'sending' | 'sent' | 'failed'
  createdAt: number
  attempts: number
  /** Epoch ms before which a flush should not retry. */
  nextAttemptAt: number
  lastError: string | null
}

/** Cached community reports. Never rendered with official styling. */
export interface ReportRow {
  id: string
  hazard: string
  zoneId: string | null
  lat: number | null
  lon: number | null
  severity: number
  note: string
  /** Deterministic trust score 0..1 (computed in M9). */
  confidence: number
  confidenceReason: string
  createdAt: number
  reporterId: string
  synced: boolean
  expiresAt: number | null
}

/** An "I'm safe" check-in. Identity never leaves the device. */
export interface CheckinRow {
  id: string
  safe: boolean
  zoneId: string | null
  lat: number | null
  lon: number | null
  note: string
  createdAt: number
  synced: boolean
}

/** Small key/value settings. */
export interface SettingRow {
  key: string
  value: unknown
  updatedAt: number
}

/**
 * Medical ID. Device-only by design (AGENTS.md §7): this table is never synced
 * and never included in any outbox payload.
 */
export interface MedicalIdRow {
  /** Always 'me' — a single document. */
  id: string
  bloodType: string | null
  allergies: string[]
  conditions: string[]
  medications: string[]
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  organDonor: boolean | null
  notes: string
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class KavachDb extends Dexie {
  declare packFiles: Table<PackFileRow, string>
  declare packets: Table<PacketRow, string>
  declare alerts: Table<AlertRow, string>
  declare riskSnapshot: Table<RiskSnapshotRow, string>
  declare outbox: Table<OutboxRow, string>
  declare reports: Table<ReportRow, string>
  declare checkins: Table<CheckinRow, string>
  declare settings: Table<SettingRow, string>
  declare medicalId: Table<MedicalIdRow, string>

  constructor() {
    super('kavach')

    // v1 — initial offline schema.
    this.version(1).stores({
      packFiles: 'key, version, fetchedAt',
      packets: 'id, expiresAt, receivedAt, isDrill, verified, hazard',
      alerts: 'id, packetId, hazard, level, issuedAt, expiresAt, isDrill, acknowledged',
      riskSnapshot: 'id, computedAt',
      // `nextAttemptAt` is indexed so draining the queue is a single range scan.
      outbox: 'id, type, status, createdAt, nextAttemptAt',
      reports: 'id, zoneId, hazard, createdAt, synced, expiresAt',
      checkins: 'id, createdAt, synced, safe',
      settings: 'key, updatedAt',
      medicalId: 'id',
    })
  }
}

let instance: KavachDb | null = null

/**
 * Lazily create the database.
 *
 * Importing this module must never throw, so the instance is built on first
 * use. Callers that can tolerate no storage (tests, SSR) should use
 * `isStorageAvailable()` first.
 */
export function getDb(): KavachDb {
  if (instance) return instance
  if (typeof indexedDB === 'undefined') {
    throw new Error('Kavach: IndexedDB is unavailable in this context.')
  }
  instance = new KavachDb()
  return instance
}

/** True when this browser will give us a usable IndexedDB. */
export function isStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    // Some browsers throw on access when storage is blocked by policy.
    return false
  }
}

/** Test seam: inject a fresh instance (tests use fake-indexeddb). */
export function __setDbForTests(db: KavachDb | null): void {
  instance = db
}

/** Setting keys, centralised so they cannot drift. */
export const SETTING = {
  LOCALE: 'locale',
  PACK_VERSION: 'packVersion',
  ONBOARDED: 'onboarded',
  FOLLOWED_ZONES: 'followedZones',
  FOLLOWED_HAZARDS: 'followedHazards',
  DEVICE_ID: 'deviceId',
  LAST_KNOWN_POS: 'lastKnownPosition',
  SOS_NUMBERS: 'sosNumbers',
  RELAY_MODE: 'relayMode',
} as const

/** Read a setting, returning `fallback` when absent or unparsable. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb().settings.put({ key, value, updatedAt: Date.now() })
}

/** Drop time-expired rows so a long-lived install does not grow forever. */
export async function pruneExpired(now = Date.now()): Promise<void> {
  const db = getDb()
  await db.packets.where('expiresAt').below(now).delete()
  await db.alerts.where('expiresAt').below(now).delete()
  await db.reports.where('expiresAt').below(now).delete()
}
