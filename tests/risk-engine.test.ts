/**
 * Table-driven tests for the risk engine.
 *
 * The engine decides whether a tourist is told to leave, so the tests assert
 * behaviour on the edges that matter: each threshold boundary, the official
 * floor (which must only ever raise), tolerance of missing sources, and the
 * reason text (which a human reads and may act on).
 */
import { describe, expect, it } from 'vitest'
import {
  LEVEL,
  THRESHOLDS,
  computeRisk,
  levelFromGdacs,
  type RiskInputs,
  type RiskLevel,
} from '../shared/riskEngine'

describe('riskEngine — threshold table', () => {
  // [description, inputs, expected level]
  const cases: Array<[string, RiskInputs, RiskLevel]> = [
    // --- baseline ---------------------------------------------------------
    ['no data at all', {}, LEVEL.NONE],
    ['calm weather', { rain24hMm: 0, windGustKmh: 10, heatIndexC: 30 }, LEVEL.NONE],
    ['a little rain is not a warning', { rain24hMm: 20, windGustKmh: 15 }, LEVEL.NONE],

    // --- rain boundaries --------------------------------------------------
    [
      'rain 24h just under the 50 mm warn line',
      { rain24hMm: THRESHOLDS.rain24Warn - 0.1 },
      LEVEL.NONE,
    ],
    ['rain 24h exactly at the warn line', { rain24hMm: THRESHOLDS.rain24Warn }, LEVEL.MODERATE],
    ['rain 24h at the severe line', { rain24hMm: THRESHOLDS.rain24Severe }, LEVEL.HIGH],
    ['rain 72h is allowed to dominate', { rain72hMm: THRESHOLDS.rain72Severe }, LEVEL.HIGH],
    ['extreme 72h rainfall', { rain72hMm: THRESHOLDS.rain72Severe * 1.6 }, LEVEL.EXTREME],

    // --- wind boundaries --------------------------------------------------
    ['gust just under the damaging line', { windGustKmh: THRESHOLDS.gustWarn - 1 }, LEVEL.NONE],
    ['gust exactly at the damaging line', { windGustKmh: THRESHOLDS.gustWarn }, LEVEL.MODERATE],
    ['gust at the destructive line', { windGustKmh: THRESHOLDS.gustSevere }, LEVEL.HIGH],
    ['hurricane gust', { windGustKmh: THRESHOLDS.gustSevere * 1.4 }, LEVEL.EXTREME],

    // --- heat -------------------------------------------------------------
    ['heat just under the warn line', { heatIndexC: THRESHOLDS.heatWarn - 1 }, LEVEL.NONE],
    ['heat at the warn line', { heatIndexC: THRESHOLDS.heatWarn }, LEVEL.MODERATE],
    ['heat at the severe line', { heatIndexC: THRESHOLDS.heatSevere }, LEVEL.HIGH],
    ['extreme heat', { heatIndexC: THRESHOLDS.heatSevere + 3 }, LEVEL.EXTREME],

    // --- river discharge --------------------------------------------------
    [
      'discharge percentile just under the warn line',
      { dischargePercentile: THRESHOLDS.dischargeWarn - 1 },
      LEVEL.NONE,
    ],
    [
      'discharge at the warn line',
      { dischargePercentile: THRESHOLDS.dischargeWarn },
      LEVEL.MODERATE,
    ],
    ['discharge near record', { dischargePercentile: THRESHOLDS.dischargeSevere }, LEVEL.HIGH],
    [
      'record-high discharge is extreme, not merely high',
      { dischargePercentile: 99 },
      LEVEL.EXTREME,
    ],

    // --- combination ------------------------------------------------------
    [
      'two moderate signals do not sum into one severe signal',
      { rain24hMm: THRESHOLDS.rain24Warn, windGustKmh: THRESHOLDS.gustWarn },
      LEVEL.MODERATE,
    ],
    [
      'one severe signal wins over a moderate one',
      { rain24hMm: THRESHOLDS.rain24Warn, windGustKmh: THRESHOLDS.gustSevere },
      LEVEL.HIGH,
    ],
  ]

  for (const [name, inputs, expected] of cases) {
    it(`scores ${name} → level ${expected}`, () => {
      expect(computeRisk(inputs).level).toBe(expected)
    })
  }
})

describe('riskEngine — official alerts raise the floor', () => {
  it('never lowers a level the data set higher', () => {
    const result = computeRisk({ rain24hMm: THRESHOLDS.rain24Severe, officialLevel: 1 })
    expect(result.level).toBe(LEVEL.HIGH)
  })

  it('raises a quiet zone to the official level', () => {
    const result = computeRisk({ officialLevel: 3 })
    expect(result.level).toBe(LEVEL.HIGH)
    expect(result.reason).toMatch(/official alert/i)
    expect(result.sources).toContain('official')
  })

  it('treats official level 4 as extreme', () => {
    expect(computeRisk({ officialLevel: 4 }).level).toBe(LEVEL.EXTREME)
  })

  it('ignores an official level of 0 (all-clear)', () => {
    expect(computeRisk({ officialLevel: 0 }).level).toBe(LEVEL.NONE)
  })

  it('clamps an out-of-range official level rather than trusting it', () => {
    expect(computeRisk({ officialLevel: 99 }).level).toBe(LEVEL.EXTREME)
  })
})

describe('riskEngine — degraded inputs', () => {
  it('treats null readings as absent, not as zero', () => {
    const result = computeRisk({ rain24hMm: null, windGustKmh: null, heatIndexC: null })
    expect(result.level).toBe(LEVEL.NONE)
    expect(result.sources).toHaveLength(0)
    // No source answered, so we must not claim the data is fresh.
    expect(result.fresh).toBe(false)
  })

  it('ignores NaN rather than propagating it', () => {
    const result = computeRisk({ rain24hMm: Number.NaN, windGustKmh: Number.POSITIVE_INFINITY })
    expect(result.level).toBe(LEVEL.NONE)
  })

  it('still scores the source that did answer', () => {
    const result = computeRisk({ windGustKmh: THRESHOLDS.gustSevere, rain24hMm: null })
    expect(result.level).toBe(LEVEL.HIGH)
    expect(result.sources).toContain('open-meteo')
  })

  it('reports fresh when at least one source answered', () => {
    expect(computeRisk({ windGustKmh: 10 }).fresh).toBe(true)
  })
})

describe('riskEngine — reason text', () => {
  it('always produces a non-empty reason ending in a full stop', () => {
    for (const inputs of [
      {},
      { rain24hMm: THRESHOLDS.rain24Severe },
      { officialLevel: 4 },
      { dischargePercentile: 99, windGustKmh: THRESHOLDS.gustSevere },
    ]) {
      const { reason } = computeRisk(inputs)
      expect(reason.length).toBeGreaterThan(10)
      expect(reason.trim().endsWith('.')).toBe(true)
    }
  })

  it('names the driving hazard, not the raw variable', () => {
    const result = computeRisk({ windGustKmh: THRESHOLDS.gustSevere })
    expect(result.reason).toMatch(/wind gusts/i)
    expect(result.drivers).toContain('wind')
  })

  it('lists every signal that reached moderate or above', () => {
    const result = computeRisk({
      windGustKmh: THRESHOLDS.gustSevere,
      dischargePercentile: THRESHOLDS.dischargeSevere,
    })
    expect(result.drivers).toEqual(expect.arrayContaining(['wind', 'flood']))
  })

  it('does not dump a debug string into the reason', () => {
    const { reason } = computeRisk({ rain24hMm: THRESHOLDS.rain24Severe })
    expect(reason).not.toMatch(/undefined|NaN|\{|\}|null/i)
  })
})

describe('riskEngine — GDACS mapping', () => {
  const cases: Array<[string | null | undefined, RiskLevel]> = [
    ['red', LEVEL.EXTREME],
    ['orange', LEVEL.HIGH],
    ['yellow', LEVEL.MODERATE],
    ['green', LEVEL.LOW],
    [undefined, LEVEL.NONE],
    [null, LEVEL.NONE],
    // Deliberate: an unrecognised GDACS level maps to NONE rather than to a
    // guessed number. We will not invent a severity we cannot justify; the
    // `sources` list still records that we read the feed, so a gap is visible.
    ['some-new-level-we-do-not-know', LEVEL.NONE],
  ]

  for (const [alertLevel, expected] of cases) {
    it(`maps GDACS ${String(alertLevel)} → level ${expected}`, () => {
      expect(levelFromGdacs({ alertLevel, eventType: 'flood' })).toBe(expected)
    })
  }

  it('reports an unrecognised GDACS level rather than guessing', () => {
    // Documents the choice above: inventing a level is worse than reporting none.
    expect(levelFromGdacs({ alertLevel: 'chartreuse', eventType: 'flood' })).toBe(LEVEL.NONE)
  })

  it('does not invent a level for earthquakes', () => {
    expect(levelFromGdacs({ alertLevel: 'red', eventType: 'earthquake' })).toBe(LEVEL.NONE)
  })

  it('is case-insensitive', () => {
    expect(levelFromGdacs({ alertLevel: 'ORANGE', eventType: 'FLOOD' })).toBe(LEVEL.HIGH)
  })
})
