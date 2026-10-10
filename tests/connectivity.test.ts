/**
 * Connectivity ladder behaviour.
 *
 * `navigator.onLine === true` is not evidence of a working link (captive
 * portals report it), so the manager pings. These tests drive that ping with a
 * fake fetch and assert the level transitions, which is what every feature in
 * the app branches on (engineering rule 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConnectivityManager,
  allowsAssistant,
  allowsDataUsage,
  allowsMapTiles,
  mustUseCache,
  type Level,
} from '../src/lib/connectivity'

/** Build a manager whose probe behaves as instructed, with no timers. */
function manager(opts: { online?: boolean; latency?: number; fail?: boolean } = {}) {
  const online = opts.online ?? true
  const latency = opts.latency ?? 10

  const fetchImpl = vi.fn(async () => {
    if (opts.fail || !online) throw new TypeError('Failed to fetch')
    // Simulate latency by returning immediately; the manager measures wall time,
    // so we drive latency through a resolved-after delay instead.
    await new Promise((r) => setTimeout(r, Math.min(latency, 5)))
    return new Response(null, { status: 200 })
  })

  const m = new ConnectivityManager({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    intervalMs: 100_000,
    degradedAboveMs: 50,
  })
  return { m, fetchImpl }
}

describe('connectivity manager', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports live when the probe succeeds quickly', async () => {
    const { m } = manager({ online: true, latency: 1 })
    await m.check()
    expect(m.getSnapshot().level).toBe('live')
    expect(m.getSnapshot().online).toBe(true)
    expect(m.getSnapshot().lastLiveAt).not.toBeNull()
    m.stop()
  })

  it('reports offline when the probe fails', async () => {
    const { m } = manager({ fail: true })
    await m.check()
    expect(m.getSnapshot().level).toBe('offline')
    expect(m.getSnapshot().online).toBe(false)
    // lastLiveAt must not be invented: we never reached the network.
    expect(m.getSnapshot().lastLiveAt).toBeNull()
    m.stop()
  })

  it('reports degraded when the link is slow but working', async () => {
    const m = slowLinkManager(200)
    await m.check()
    expect(m.getSnapshot().level).toBe('degraded')
    m.stop()
  })

  it('moves offline → live → offline as the network comes and goes', async () => {
    let healthy = false
    const fetchImpl = vi.fn(async () => {
      if (!healthy) throw new TypeError('down')
      return new Response(null, { status: 200 })
    })
    const m = new ConnectivityManager({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 100_000,
    })

    await m.check()
    expect(m.getSnapshot().level).toBe('offline')

    healthy = true
    await m.check()
    expect(m.getSnapshot().level).toBe('live')
    expect(m.getSnapshot().lastLiveAt).not.toBeNull()

    healthy = false
    await m.check()
    expect(m.getSnapshot().level).toBe('offline')
    // The last successful contact is remembered even after going offline.
    expect(m.getSnapshot().lastLiveAt).not.toBeNull()
    m.stop()
  })

  it('treats a 4xx/5xx response as reachable (the uplink works)', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    const m = new ConnectivityManager({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 100_000,
    })
    await m.check()
    // A captive portal or CDN error still proves we reached the network.
    expect(m.getSnapshot().level).toBe('live')
    m.stop()
  })

  it('emits to subscribers on every change and stops after unsubscribe', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const m = new ConnectivityManager({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 100_000,
    })

    const seen: Level[] = []
    const unsubscribe = m.subscribe((s) => seen.push(s.level))
    await m.check()
    expect(seen.length).toBeGreaterThan(0)

    const count = seen.length
    unsubscribe()
    await m.check()
    expect(seen).toHaveLength(count)
    m.stop()
  })

  it('lets other features flag relay mode, which outranks offline', async () => {
    const { m } = manager({ fail: true })
    await m.check()
    expect(m.getSnapshot().level).toBe('offline')

    m.flagRelay(true)
    // A signed packet arrived by SMS: the user can still receive alerts.
    expect(m.getSnapshot().level).toBe('relay')

    m.flagRelay(false)
    expect(m.getSnapshot().level).toBe('offline')
    m.stop()
  })

  it('lets the OS flag a metered link as cellular', async () => {
    const { m } = manager({ online: true, latency: 1 })
    await m.check()
    expect(m.getSnapshot().level).toBe('live')

    m.flagMetered(true)
    expect(m.getSnapshot().level).toBe('cellular')
    m.stop()
  })

  it('does not start a second concurrent probe', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const fetchImpl = vi.fn(async () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((r) => setTimeout(r, 10))
      concurrent -= 1
      return new Response(null, { status: 200 })
    })
    const m = new ConnectivityManager({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 100_000,
    })

    await Promise.all([m.check(), m.check(), m.check()])
    expect(maxConcurrent).toBe(1)
    m.stop()
  })

  it('aborts a probe that exceeds the timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new TypeError('aborted')))
        }),
    )
    const m = new ConnectivityManager({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
      intervalMs: 100_000,
    })
    await m.check()
    expect(m.getSnapshot().level).toBe('offline')
    m.stop()
  })
})

/** Helper for the slow-link case, where wall-clock latency must be simulated. */
function slowLinkManager(latencyMs: number): ConnectivityManager {
  const fetchImpl = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, latencyMs))
    return new Response(null, { status: 200 })
  })
  return new ConnectivityManager({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    intervalMs: 100_000,
    degradedAboveMs: 50,
  })
}

describe('ladder gating helpers', () => {
  const snap = (level: Level) => ({
    level,
    online: level !== 'offline' && level !== 'relay',
    latencyMs: null,
    lastLiveAt: null,
    checking: false,
    metered: false,
    relay: level === 'relay',
  })

  it('spends data only at the top two rungs', () => {
    expect(allowsDataUsage(snap('live'))).toBe(true)
    expect(allowsDataUsage(snap('degraded'))).toBe(true)
    expect(allowsDataUsage(snap('cellular'))).toBe(false)
    expect(allowsDataUsage(snap('offline'))).toBe(false)
    expect(allowsDataUsage(snap('relay'))).toBe(false)
  })

  it('loads map tiles only when live', () => {
    expect(allowsMapTiles(snap('live'))).toBe(true)
    for (const level of ['degraded', 'cellular', 'offline', 'relay'] as Level[]) {
      expect(allowsMapTiles(snap(level))).toBe(false)
    }
  })

  it('uses the online assistant only when live', () => {
    expect(allowsAssistant(snap('live'))).toBe(true)
    expect(allowsAssistant(snap('degraded'))).toBe(false)
  })

  it('forces cache reads below the top two rungs', () => {
    expect(mustUseCache(snap('live'))).toBe(false)
    expect(mustUseCache(snap('degraded'))).toBe(false)
    expect(mustUseCache(snap('cellular'))).toBe(true)
    expect(mustUseCache(snap('offline'))).toBe(true)
    expect(mustUseCache(snap('relay'))).toBe(true)
  })
})
