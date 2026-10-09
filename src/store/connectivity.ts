/**
 * The connectivity ladder.
 *
 * Core idea 3 of the brief. `StatusChip` in the header renders the current
 * rung; every feature in the app branches on it.
 *
 * NOTE (M1): detection is a hardcoded stub. The real implementation
 * (Network Information API, latency probe, `navigator.onLine`) lands in M3.
 * This module owns the *type model* now so the rest of the app can be built
 * against the real shape instead of a placeholder string.
 */

/** Ordered from best to worst. The index in this tuple IS the ladder rung. */
export const CONNECTIVITY_LADDER = ['live', 'degraded', 'cellular', 'offline', 'relay'] as const

export type ConnectivityLevel = (typeof CONNECTIVITY_LADDER)[number]

export interface ConnectivityState {
  readonly level: ConnectivityLevel
  /** `navigator.onLine` as reported by the browser. */
  readonly online: boolean
  /** Round-trip probe latency in ms, when measured. */
  readonly latencyMs: number | null
  /** Network Information API effectiveType, when exposed. */
  readonly effectiveType: string | null
  /** True while a probe is in flight. */
  readonly checking: boolean
}

/**
 * M1 stub state: always `live`. Replaced in M3 by a real detector.
 * Kept as a frozen constant so no component can mutate it accidentally.
 */
export const STUB_CONNECTIVITY: ConnectivityState = Object.freeze({
  level: 'live',
  online: true,
  latencyMs: null,
  effectiveType: null,
  checking: false,
})

/** True when the app has no usable network at all. */
export function isDisconnected(state: ConnectivityState): boolean {
  return !state.online || state.level === 'offline' || state.level === 'relay'
}

/** True when we may spend the user's mobile data. */
export function allowsDataUsage(state: ConnectivityState): boolean {
  return state.level === 'live' || state.level === 'degraded'
}

/** Map tiles are expensive; only load them at the top of the ladder. */
export function allowsMapTiles(state: ConnectivityState): boolean {
  return state.level === 'live'
}
