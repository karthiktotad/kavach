/**
 * Typed Supabase client for the Kavach app.
 *
 * Rules this file exists to enforce:
 *  - **Every request has a timeout and a cached fallback.** A crisis app that
 *    hangs on a dead network is worse than one that shows yesterday's data.
 *  - **On failure it returns cached data WITH ITS AGE**, so the UI can say
 *    "from 40 minutes ago" instead of pretending it is current.
 *  - **No secret ever reaches this module.** The anon key is public by design;
 *    the service role key must never appear in a `VITE_` variable (rule 2).
 *
 * Realtime is an optimisation: if the socket does not connect within a few
 * seconds we fall back to polling, because a stale alert is better than none.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { envConfig, isBackendConfigured } from '../config/env'
import { getDb } from './db'
import type { AlertRow, RiskSnapshotRow } from './db'

/** Long enough for a slow link, short enough that a user is not left hanging. */
const DEFAULT_TIMEOUT_MS = 6000
/** Fall back to polling when the socket has not delivered by now. */
const REALTIME_GRACE_MS = 5000
export const POLL_INTERVAL_MS = 30_000

export interface SnapshotZone {
  readonly zoneId: string
  readonly level: number
  readonly reason: string
  readonly sources: readonly string[]
  /** True only when every source answered AND the data is recent. */
  readonly complete: boolean
  readonly computedAt: string
}

export interface Snapshot {
  readonly zones: readonly SnapshotZone[]
  readonly computedAt: string | null
  readonly ageMs: number | null
  readonly stale: boolean
  /** True when this came from IndexedDB rather than the network. */
  readonly fromCache: boolean
}

export interface ApiResult<T> {
  readonly data: T
  /** Where the data came from. The UI must be able to say so. */
  readonly source: 'network' | 'cache'
  /** Epoch ms the data was fetched, or null when unknown. */
  readonly fetchedAt: number | null
  /** Present when the network call failed. */
  readonly error: string | null
}

let client: SupabaseClient | null = null

/** The Supabase client, or null when the app is running without a backend. */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured) return null
  if (!client) {
    const url = envConfig.supabaseUrl
    const anonKey = envConfig.supabaseAnonKey
    // `isBackendConfigured` already guarantees both are present; this guard
    // narrows the types for the compiler.
    if (!url || !anonKey) return null
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 5 } },
      // The app must never hang waiting for the network.
      global: { fetch: timeoutFetch(DEFAULT_TIMEOUT_MS) },
    })
  }
  return client
}

/**
 * `fetch` with a hard timeout.
 *
 * Without this a request on a half-open connection can hang for minutes,
 * which is exactly the failure mode a tourist in a dead zone will hit.
 */
export type FetchWithTimeout = typeof fetch

export function timeoutFetch(timeoutMs = DEFAULT_TIMEOUT_MS): FetchWithTimeout {
  // The controller is per-request, not per-wrapper: one shared deadline would be
  // consumed by the first caller and silently disable the timeout for the rest.
  return async (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Base URL for Edge Functions, without a trailing slash. */
function functionsBase(): string | null {
  if (!envConfig.supabaseUrl) return null
  return `${envConfig.supabaseUrl.replace(/\/$/, '')}/functions/v1`
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Fetch the computed risk snapshot.
 *
 * On any failure it returns the cached snapshot with `fromCache: true`, because
 * a four-hour-old risk level is still more useful than an error screen — as
 * long as the UI says how old it is.
 */
/** The timeout-wrapped fetch used by every call in this module. */
const apiFetch = timeoutFetch(DEFAULT_TIMEOUT_MS)

export async function getSnapshot(): Promise<ApiResult<Snapshot> | null> {
  const base = functionsBase()
  if (!base) return null

  try {
    const response = await apiFetch(`${base}/get-snapshot`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const body = (await response.json()) as Omit<Snapshot, 'fromCache'>
    const fetchedAt = Date.now()

    await cacheSnapshot({
      id: 'current',
      zones: body.zones.map((zone) => ({
        zoneId: zone.zoneId,
        level: zone.level,
        reason: zone.reason,
      })),
      // Stored as epoch ms, matching RiskSnapshotRow.
      computedAt: body.computedAt ? new Date(body.computedAt).getTime() : Date.now(),
      fresh: !body.stale,
    })

    return {
      data: { ...body, fromCache: false },
      source: 'network',
      fetchedAt,
      error: null,
    }
  } catch (error) {
    const cached = await readCachedSnapshot()
    const cachedAt = cached?.computedAt ?? null
    return {
      data: {
        zones: (cached?.zones ?? []).map((zone) => ({
          zoneId: zone.zoneId,
          level: zone.level,
          reason: zone.reason,
          // The cached copy cannot claim per-source completeness.
          sources: [],
          complete: false,
          computedAt:
            cachedAt === null ? new Date().toISOString() : new Date(cachedAt).toISOString(),
        })),
        computedAt: cachedAt === null ? null : new Date(cachedAt).toISOString(),
        ageMs: cachedAt === null ? null : Date.now() - cachedAt,
        stale: true,
        fromCache: true,
      },
      source: 'cache',
      fetchedAt: cachedAt,
      error: error instanceof Error ? error.message : 'request failed',
    }
  }
}

async function cacheSnapshot(row: RiskSnapshotRow): Promise<void> {
  try {
    await getDb().riskSnapshot.put(row)
  } catch {
    // A full disk must not break the fetch we just completed.
  }
}

async function readCachedSnapshot(): Promise<RiskSnapshotRow | undefined> {
  try {
    return await getDb().riskSnapshot.get('current')
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface ApiAlert {
  readonly id: string
  readonly hazard: string
  readonly level: number
  readonly zone_ids: string[]
  readonly packet: string
  readonly seq: number
  readonly is_drill: boolean
  readonly issued_at: string
  readonly expires_at: string | null
}

/**
 * List alerts, newest first, hiding expired ones.
 *
 * Cached into IndexedDB on every success so the alerts list renders instantly
 * and completely offline — this is the one screen that must never be empty.
 */
export async function listAlerts(limit = 50): Promise<ApiResult<ApiAlert[]>> {
  const supabase = getSupabase()
  if (!supabase) {
    return {
      data: await cachedAlerts(limit),
      source: 'cache',
      fetchedAt: null,
      error: 'no backend',
    }
  }

  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('id,hazard,level,zone_ids,packet,seq,is_drill,issued_at,expires_at')
      .order('issued_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as ApiAlert[]
    const now = Date.now()
    const live = rows.filter(
      (row) => row.expires_at === null || new Date(row.expires_at).getTime() > now,
    )

    await cacheAlerts(live)
    return { data: live, source: 'network', fetchedAt: Date.now(), error: null }
  } catch (error) {
    return {
      data: await cachedAlerts(limit),
      source: 'cache',
      fetchedAt: null,
      error: error instanceof Error ? error.message : 'request failed',
    }
  }
}

async function cacheAlerts(rows: ApiAlert[]): Promise<void> {
  try {
    const db = getDb()
    await db.alerts.bulkPut(
      rows.map((row) => ({
        id: row.id,
        packetId: row.packet,
        templateId: `${row.hazard}-${row.level}`,
        hazard: row.hazard,
        level: row.level,
        zoneIds: row.zone_ids ?? [],
        headline: '',
        steps: [],
        issuedAt: new Date(row.issued_at).getTime(),
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
        isDrill: row.is_drill,
        acknowledged: false,
        updatedAt: Date.now(),
      })) satisfies AlertRow[],
    )
  } catch {
    // Never fail a successful fetch because the cache write failed.
  }
}

async function cachedAlerts(limit: number): Promise<ApiAlert[]> {
  try {
    const rows = await getDb().alerts.orderBy('issuedAt').reverse().limit(limit).toArray()
    const now = Date.now()
    return rows
      .filter((row) => row.expiresAt === null || row.expiresAt > now)
      .map((row) => ({
        id: row.id,
        hazard: row.hazard,
        level: row.level ?? 0,
        zone_ids: row.zoneIds,
        packet: row.packetId,
        seq: 0,
        is_drill: row.isDrill,
        issued_at: new Date(row.issuedAt).toISOString(),
        expires_at: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      }))
  } catch {
    return []
  }
}

/**
 * Subscribe to new alerts, falling back to polling.
 *
 * Realtime is best-effort by design: if the socket has not delivered anything
 * within `REALTIME_GRACE_MS`, we start polling so the user still hears about an
 * alert without a live connection.
 */
export function subscribeToAlerts(onAlert: (alert: ApiAlert) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => undefined

  let channel: RealtimeChannel | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const graceTimer = setTimeout(() => {
    if (pollTimer === null) {
      pollTimer = setInterval(() => {
        void listAlerts().then((result) => {
          result.data.slice(0, 1).forEach(onAlert)
        })
      }, POLL_INTERVAL_MS)
    }
  }, REALTIME_GRACE_MS)

  channel = supabase
    .channel('kavach-alerts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
      const row = payload.new as ApiAlert
      void cacheAlerts([row])
      onAlert(row)
    })
    .subscribe()

  return () => {
    clearTimeout(graceTimer)
    if (pollTimer !== null) clearInterval(pollTimer)
    if (channel) void supabase.removeChannel(channel)
  }
}

// ---------------------------------------------------------------------------
// Reports & check-ins
// ---------------------------------------------------------------------------

export type ReportKind = 'flood' | 'wind' | 'heat' | 'landslide' | 'injury' | 'other'

export interface SubmitReportInput {
  readonly deviceId: string
  readonly kind: ReportKind
  readonly lat: number | null
  readonly lon: number | null
  readonly zoneId: string | null
  readonly note: string
}

/**
 * Submit a community report.
 *
 * Returns a discriminated result rather than throwing, because the caller must
 * enqueue on failure (the outbox does that) and show a distinct message for
 * "rate limited" versus "network down".
 */
export async function submitReport(input: SubmitReportInput): Promise<ApiResult<boolean>> {
  const supabase = getSupabase()
  if (!supabase) {
    return { data: false, source: 'cache', fetchedAt: null, error: 'no backend' }
  }

  try {
    const { error } = await supabase.from('reports').insert({
      device_id: input.deviceId,
      kind: input.kind,
      lat: input.lat,
      lon: input.lon,
      zone_id: input.zoneId,
      note: input.note.slice(0, 500),
      // Auto-expire: a stale crowd report is worse than none.
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
    })

    if (error) return { data: false, source: 'cache', fetchedAt: null, error: error.message }
    return { data: true, source: 'network', fetchedAt: Date.now(), error: null }
  } catch (error) {
    return {
      data: false,
      source: 'cache',
      fetchedAt: null,
      error: error instanceof Error ? error.message : 'request failed',
    }
  }
}

export interface SubmitCheckinInput {
  readonly deviceId: string
  readonly lat: number | null
  readonly lon: number | null
  readonly zoneId: string | null
  readonly status: 'safe' | 'need_help' | 'evacuating'
  readonly note: string
}

export async function submitCheckin(input: SubmitCheckinInput): Promise<ApiResult<boolean>> {
  const supabase = getSupabase()
  if (!supabase) {
    return { data: false, source: 'cache', fetchedAt: null, error: 'no backend' }
  }

  try {
    const { error } = await supabase.from('checkins').insert({
      device_id: input.deviceId,
      lat: input.lat,
      lon: input.lon,
      zone_id: input.zoneId,
      status: input.status,
      note: input.note.slice(0, 280),
    })

    if (error) return { data: false, source: 'cache', fetchedAt: null, error: error.message }
    return { data: true, source: 'network', fetchedAt: Date.now(), error: null }
  } catch (error) {
    return {
      data: false,
      source: 'cache',
      fetchedAt: null,
      error: error instanceof Error ? error.message : 'request failed',
    }
  }
}

/** Confirm a report ("I saw this too"). Repeat taps are a no-op server-side. */
export async function confirmReport(
  reportId: string,
  deviceId: string,
): Promise<ApiResult<boolean>> {
  const supabase = getSupabase()
  if (!supabase) return { data: false, source: 'cache', fetchedAt: null, error: 'no backend' }

  try {
    const { error } = await supabase
      .from('confirmations')
      .insert({ report_id: reportId, device_id: deviceId })

    // A duplicate is a success from the user's point of view: they confirmed it.
    if (error && !error.message.includes('duplicate')) {
      return { data: false, source: 'cache', fetchedAt: null, error: error.message }
    }
    return { data: true, source: 'network', fetchedAt: Date.now(), error: null }
  } catch (error) {
    return {
      data: false,
      source: 'cache',
      fetchedAt: null,
      error: error instanceof Error ? error.message : 'request failed',
    }
  }
}
