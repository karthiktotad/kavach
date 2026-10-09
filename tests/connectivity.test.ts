import { describe, expect, it } from 'vitest'
import {
  CONNECTIVITY_LADDER,
  STUB_CONNECTIVITY,
  allowsDataUsage,
  allowsMapTiles,
  isDisconnected,
  type ConnectivityState,
} from '../src/store/connectivity'

function state(overrides: Partial<ConnectivityState>): ConnectivityState {
  return { ...STUB_CONNECTIVITY, ...overrides }
}

describe('connectivity ladder', () => {
  it('orders the rungs best-to-worst', () => {
    expect([...CONNECTIVITY_LADDER]).toEqual(['live', 'degraded', 'cellular', 'offline', 'relay'])
  })

  it('starts at live in the M1 stub', () => {
    expect(STUB_CONNECTIVITY.level).toBe('live')
    expect(Object.isFrozen(STUB_CONNECTIVITY)).toBe(true)
  })

  it('treats offline and relay as disconnected', () => {
    expect(isDisconnected(state({ level: 'offline' }))).toBe(true)
    expect(isDisconnected(state({ level: 'relay' }))).toBe(true)
    // A bad navigator.onLine report must still be respected.
    expect(isDisconnected(state({ level: 'live', online: false }))).toBe(true)
    expect(isDisconnected(state({ level: 'live' }))).toBe(false)
  })

  it('only spends mobile data at the top of the ladder', () => {
    expect(allowsDataUsage(state({ level: 'live' }))).toBe(true)
    expect(allowsDataUsage(state({ level: 'degraded' }))).toBe(true)
    expect(allowsDataUsage(state({ level: 'cellular' }))).toBe(false)
    expect(allowsDataUsage(state({ level: 'offline' }))).toBe(false)
  })

  it('only loads map tiles at the live rung', () => {
    expect(allowsMapTiles(state({ level: 'live' }))).toBe(true)
    expect(allowsMapTiles(state({ level: 'degraded' }))).toBe(false)
  })
})
