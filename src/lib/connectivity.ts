/**
 * Connectivity manager — computes the ladder level (core idea 3).
 *
 * Three levels are *measured*: `live`, `degraded`, `offline`.
 * Two are *declared* by other features:
 *   - `cellular` — the user or the OS told us the link is metered
 *   - `relay`    — a packet was received by SMS/QR, so data is not available
 *
 * Measurement is an active ping, not just `navigator.onLine`, because
 * `navigator.onLine === true` is true on a captive portal or a dead uplink.
 *
 * The ping is paused while the tab is hidden: during a crisis the phone is in
 * a pocket most of the time, and background pings drain the battery the user
 * needs for the SOS call.
 */
import { useEffect, useState } from 'react'

/** The ladder, best to worst. Index is the rung. */
export const LADDER = ['live', 'degraded', 'cellular', 'offline', 'relay'] as const
export type Level = (typeof LADDER)[number]

/** Levels this manager computes by measurement. */
export type MeasuredLevel = Extract<Level, 'live' | 'degraded' | 'offline'>

export interface ConnectivitySnapshot {
  readonly level: Level
  /** `navigator.onLine` as the browser reports it. */
  readonly online: boolean
  /** Round-trip time of the last successful ping, ms. */
  readonly latencyMs: number | null
  /** When we last reached the network successfully. */
  readonly lastLiveAt: number | null
  /** True while a ping is in flight. */
  readonly checking: boolean
  /** Set when the user/OS flagged a metered link. */
  readonly metered: boolean
  /** Set when a packet arrived by SMS/QR, so we are off the data path. */
  readonly relay: boolean
}

export type Listener = (snapshot: ConnectivitySnapshot) => void

export interface ConnectivityOptions {
  /** Endpoint to ping. Must be tiny and must not need auth. */
  readonly probeUrl?: string
  /** Probe timeout, ms. */
  readonly timeoutMs?: number
  /** Poll interval while visible, ms. */
  readonly intervalMs?: number
  /** Latency above which we call it `degraded`. */
  readonly degradedAboveMs?: number
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch
}

const DEFAULTS = {
  probeUrl: '/health.txt',
  timeoutMs: 3000,
  intervalMs: 30_000,
  degradedAboveMs: 1200,
} as const

const INITIAL: ConnectivitySnapshot = {
  level: 'live',
  online: true,
  latencyMs: null,
  lastLiveAt: null,
  checking: false,
  metered: false,
  relay: false,
}

export class ConnectivityManager {
  private snapshot: ConnectivitySnapshot = INITIAL
  private readonly listeners = new Set<Listener>()
  private readonly options: Required<Omit<ConnectivityOptions, 'fetchImpl'>>
  private readonly fetchImpl: typeof fetch

  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false
  private started = false

  constructor(options: ConnectivityOptions = {}) {
    this.options = {
      probeUrl: options.probeUrl ?? DEFAULTS.probeUrl,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      intervalMs: options.intervalMs ?? DEFAULTS.intervalMs,
      degradedAboveMs: options.degradedAboveMs ?? DEFAULTS.degradedAboveMs,
    }
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a))
  }

  getSnapshot(): ConnectivitySnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  /**
   * Flag the link as metered (`cellular`), overriding the measured level.
   * Idempotent, so repeated reports from the OS are harmless.
   */
  flagMetered(metered = true): void {
    this.set({ metered })
    this.recompute()
  }

  /**
   * Flag relay mode: data arrived by SMS/QR, so we are not on the data path.
   * This outranks `offline` for UI purposes because the user can still receive
   * signed packets, just not fetch them.
   */
  flagRelay(on: boolean): void {
    this.set({ relay: on })
    this.recompute()
  }

  /** Begin measuring. Safe to call more than once. */
  start(): void {
    if (this.started) return
    this.started = true

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
      document.addEventListener('visibilitychange', this.handleVisibility)
    }

    this.set({ online: navigatorOnLine() })
    this.recompute()
    void this.check()
    this.timer = setInterval(() => void this.check(), this.options.intervalMs)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
      document.removeEventListener('visibilitychange', this.handleVisibility)
    }
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** Run one probe now. */
  async check(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    this.set({ checking: true })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const startedAt = Date.now()

    try {
      // HEAD is cheapest; some CDNs answer 405, which still proves reachability.
      const response = await this.fetchImpl(this.options.probeUrl, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      })
      // Any HTTP answer means the uplink works, including 4xx/5xx.
      if (!response.ok && response.status === 0) {
        throw new Error('unreachable')
      }
      this.set({
        online: true,
        latencyMs: Date.now() - startedAt,
        lastLiveAt: Date.now(),
      })
    } catch {
      this.set({ online: false, latencyMs: null })
    } finally {
      clearTimeout(timer)
      this.inFlight = false
      this.set({ checking: false })
      this.recompute()
    }
  }

  private set(patch: Partial<ConnectivitySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  /** Derive the level from the measured state. */
  private recompute(): void {
    const { online, latencyMs, metered, relay } = this.snapshot

    let level: Level
    if (relay) level = 'relay'
    else if (!online) level = 'offline'
    else if (metered) level = 'cellular'
    else if (latencyMs !== null && latencyMs > this.options.degradedAboveMs) level = 'degraded'
    else level = 'live'

    if (level !== this.snapshot.level) this.set({ level })
  }

  private readonly handleOnline = () => {
    this.set({ online: true })
    this.recompute()
    void this.check()
  }

  private readonly handleOffline = () => {
    this.set({ online: false })
    this.recompute()
  }

  private readonly handleVisibility = () => {
    // Never ping a hidden tab: it burns battery the user may need for SOS.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      if (this.timer !== null) clearInterval(this.timer)
      this.timer = null
      return
    }
    if (this.timer === null && this.started) {
      this.timer = setInterval(() => void this.check(), this.options.intervalMs)
      void this.check()
    }
  }
}

/**
 * Flag relay mode app-wide (a packet arrived by SMS/QR). Exposed separately so
 * the relay feature does not need a manager reference.
 */
export function setRelayFlag(on: boolean): void {
  connectivity.flagRelay(on)
}

/** The app-wide singleton. */
export const connectivity = new ConnectivityManager()

function navigatorOnLine(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------

/**
 * Subscribe a component to the ladder.
 *
 * `manager` is injectable so a test can pass a stub instead of the singleton.
 */
export function useConnectivity(manager: ConnectivityManager = connectivity): ConnectivitySnapshot {
  const [snapshot, setSnapshot] = useState<ConnectivitySnapshot>(() => manager.getSnapshot())

  useEffect(() => {
    manager.start()
    return manager.subscribe(setSnapshot)
  }, [manager])

  return snapshot
}

// ---------------------------------------------------------------------------
// Derived helpers — used by every feature to branch on the ladder (rule 1)
// ---------------------------------------------------------------------------

/** True when we may spend the user's data. */
export function allowsDataUsage(s: ConnectivitySnapshot): boolean {
  return s.level === 'live' || s.level === 'degraded'
}

/** Map tiles are expensive; only at the top of the ladder. */
export function allowsMapTiles(s: ConnectivitySnapshot): boolean {
  return s.level === 'live'
}

/** The LLM proxy is never worth a round trip on a slow link. */
export function allowsAssistant(s: ConnectivitySnapshot): boolean {
  return s.level === 'live'
}

/** True when reads must be served from the device. */
export function mustUseCache(s: ConnectivitySnapshot): boolean {
  return !allowsDataUsage(s) || s.level === 'cellular'
}
