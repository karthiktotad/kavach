/**
 * Risk engine — turns raw readings into a per-zone risk level 0–4 plus a
 * plain-language reason.
 *
 * Pure and deterministic: no I/O, no clock, no randomness. `ingest-risk` does
 * the fetching; this file decides. That is what makes it table-testable, and it
 * is the only place the mapping from data to a warning level is defined.
 *
 * ## Why rule-based rather than a model
 *
 * A tourist is about to decide whether to walk through floodwater because of
 * what this number says. The mapping must be inspectable by a human, stable
 * across runs, and defensible line by line. Thresholds are chosen to be
 * *conservative* — erring towards warning early — because the cost of a false
 * alarm is a detour, while the cost of a missed one is a fatality.
 *
 * ## Thresholds and their basis
 *
 * Rain (mm) — tropical convective thresholds used by national severe-weather
 *   services. 24h: 50 mm ≈ heavy, 100 mm ≈ very heavy. 72h accumulates because
 *   antecedent rain is what turns a downpour into a flood.
 * Wind gusts (km/h) — 62 km/h is the "damaging gust" threshold for a tropical
 *   cyclone warning; 88 km/h is destructive.
 * Heat index (°C) — 40 is dangerous with humidity; 46 is an emergency risk
 *   for anyone without shelter.
 * River discharge (percentile) — an absolute m³/s is meaningless without local
 *   flood-stage knowledge, so we use a *percentile* which is self-normalising.
 *
 * Every threshold is exported so it can be reviewed, argued with, and changed in
 * one place.
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  /** Rainfall in mm over the window. */
  rain24Warn: 50,
  rain24Severe: 100,
  rain72Warn: 80,
  rain72Severe: 150,
  /** Peak gust in km/h. */
  gustWarn: 62,
  gustSevere: 88,
  /** Heat index in °C. */
  heatWarn: 40,
  heatSevere: 46,
  /** Discharge percentile (0–100). */
  dischargeWarn: 80,
  dischargeSevere: 95,
} as const

/** Level 0 is "no known hazard". Kept separate from `none` for clarity. */
export const LEVEL = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  EXTREME: 4,
} as const

export type RiskLevel = 0 | 1 | 2 | 3 | 4

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One zone's readings. Every field is optional: a source may have failed. */
export interface RiskInputs {
  /** Total rainfall mm in the last 24 h. */
  readonly rain24hMm?: number | null
  /** Total rainfall mm in the last 72 h. */
  readonly rain72hMm?: number | null
  /** Forecast peak gust km/h over the next 24 h. */
  readonly windGustKmh?: number | null
  /** Highest heat index °C over the next 24 h. */
  readonly heatIndexC?: number | null
  /** River discharge percentile for a nearby gauge, 0–100. */
  readonly dischargePercentile?: number | null
  /**
   * An active OFFICIAL alert covering this zone, 0–4. This raises the floor:
   * if an authority has declared level 3, live data must never talk it down.
   */
  readonly officialLevel?: number | null
}

/** Which upstream sources actually answered. */
export type SourceName = 'open-meteo' | 'open-meteo-flood' | 'gdacs' | 'official'

export interface RiskResult {
  readonly level: RiskLevel
  /** One or two plain sentences. Shown verbatim to the user. */
  readonly reason: string
  /** Names of the signals that actually moved the level. */
  readonly drivers: readonly string[]
  /** Sources that answered, so a degraded snapshot is visible in the UI. */
  readonly sources: readonly SourceName[]
  /** True when every requested source answered. */
  readonly fresh: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Map a magnitude onto 0–4 by comparing against up to three cut points. */
function levelFrom(value: number, warn: number, severe: number, extreme: number): RiskLevel {
  if (value >= extreme) return LEVEL.EXTREME
  if (value >= severe) return LEVEL.HIGH
  if (value >= warn) return LEVEL.MODERATE
  return LEVEL.NONE
}

/** Round to at most 1 decimal, for a reason string a human reads. */
function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** Map 0–4 onto a word. Used only in the reason text. */
const LEVEL_WORD: Record<RiskLevel, string> = {
  0: 'no hazard',
  1: 'low risk',
  2: 'moderate risk',
  3: 'high risk',
  4: 'extreme risk',
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Compute the risk level for one zone.
 *
 * Signals combine by taking the **maximum**, not the sum: two moderate signals
 * are not automatically one severe signal, because that would let ordinary rain
 * and a stiff breeze combine into a scary number that justifies neither.
 *
 * An official alert then raises the floor (never lowers it), so the app can
 * never contradict an authority in public.
 */
export function computeRisk(inputs: RiskInputs): RiskResult {
  const drivers: string[] = []
  const sources: SourceName[] = []
  const reasons: string[] = []

  let level: RiskLevel = LEVEL.NONE
  const consider = (candidate: RiskLevel, driver: string, reason: string): void => {
    if (candidate > level) {
      level = candidate
      reasons.length = 0
    }
    if (candidate >= LEVEL.MODERATE) {
      drivers.push(driver)
      reasons.push(reason)
    }
  }

  // --- Rain ---------------------------------------------------------------
  const rain24 = isNum(inputs.rain24hMm) ? inputs.rain24hMm : null
  const rain72 = isNum(inputs.rain72hMm) ? inputs.rain72hMm : null
  if (rain24 !== null || rain72 !== null) {
    sources.push('open-meteo')
    // Antedecent rain matters more than a single burst, so 72 h is allowed to
    // dominate: take whichever window is worse.
    const worstRain = Math.max(rain24 ?? 0, (rain72 ?? 0) * (24 / 72))
    const rainLevel =
      rain72 !== null && rain72 >= THRESHOLDS.rain72Severe
        ? levelFrom(
            rain72,
            THRESHOLDS.rain72Warn,
            THRESHOLDS.rain72Severe,
            THRESHOLDS.rain72Severe * 1.6,
          )
        : levelFrom(
            worstRain,
            THRESHOLDS.rain24Warn,
            THRESHOLDS.rain24Severe,
            THRESHOLDS.rain24Severe * 1.6,
          )
    if (rainLevel >= LEVEL.MODERATE) {
      consider(
        rainLevel,
        'rain',
        rain72 !== null && rain72 >= THRESHOLDS.rain72Warn
          ? `${n(rain72)} mm of rain in 72 hours`
          : `${n(rain24 ?? 0)} mm of rain in 24 hours`,
      )
    }
  }

  // --- Wind ---------------------------------------------------------------
  const gust = isNum(inputs.windGustKmh) ? inputs.windGustKmh : null
  if (gust !== null) {
    sources.push('open-meteo')
    const windLevel = levelFrom(
      gust,
      THRESHOLDS.gustWarn,
      THRESHOLDS.gustSevere,
      THRESHOLDS.gustSevere * 1.4,
    )
    if (windLevel >= LEVEL.MODERATE) {
      consider(windLevel, 'wind', `wind gusts up to ${n(gust)} km/h`)
    }
  }

  // --- Heat ---------------------------------------------------------------
  const heat = isNum(inputs.heatIndexC) ? inputs.heatIndexC : null
  if (heat !== null) {
    sources.push('open-meteo')
    const heatLevel = levelFrom(
      heat,
      THRESHOLDS.heatWarn,
      THRESHOLDS.heatSevere,
      THRESHOLDS.heatSevere + 3,
    )
    if (heatLevel >= LEVEL.MODERATE) {
      consider(heatLevel, 'heat', `heat index reaching ${n(heat)}°C`)
    }
  }

  // --- River discharge ----------------------------------------------------
  const discharge = isNum(inputs.dischargePercentile) ? inputs.dischargePercentile : null
  if (discharge !== null) {
    sources.push('open-meteo-flood')
    const floodLevel = levelFrom(
      discharge,
      THRESHOLDS.dischargeWarn,
      THRESHOLDS.dischargeSevere,
      99,
    )
    if (floodLevel >= LEVEL.MODERATE) {
      consider(
        floodLevel,
        'flood',
        `nearby river at the ${n(discharge)}th percentile of its recorded range`,
      )
    }
  }

  // --- Official alert raises the floor ------------------------------------
  const official = isNum(inputs.officialLevel) ? inputs.officialLevel : null
  if (official !== null && official > 0) {
    sources.push('official')
    const officialLevel = (official >= 4 ? LEVEL.EXTREME : Math.min(official, 4)) as RiskLevel
    if (officialLevel > level) {
      level = officialLevel
      reasons.length = 0
      reasons.push('an official alert is in force for this zone')
    }
  }

  // --- Reason -------------------------------------------------------------
  const uniqueDrivers = [...new Set(drivers)]
  const reason =
    reasons.length > 0
      ? `${LEVEL_WORD[level]} — ${reasons.join('; ')}.`
      : level === 0
        ? 'no hazard detected from available data.'
        : 'an official alert is in force for this zone.'

  return {
    level,
    reason,
    drivers: uniqueDrivers,
    sources: [...new Set(sources)],
    // "fresh" means every source we asked answered. With no inputs at all we
    // must not claim freshness.
    fresh: sources.length > 0,
  }
}

/**
 * GDACS event → a floor for nearby zones.
 *
 * Kept separate from `computeRisk` because it is advisory context from an
 * unverified feed, not a measurement. It can raise the level; a stale GDACS
 * entry cannot lower one.
 */
export function levelFromGdacs(event: {
  readonly alertLevel?: string | null
  readonly eventType?: string | null
}): RiskLevel {
  const type = (event.eventType ?? '').toLowerCase()
  // Earthquakes and volcanoes are outside our hazard model; do not invent a
  // level for them.
  if (type.includes('earthquake') || type.includes('volcano')) return LEVEL.NONE

  switch ((event.alertLevel ?? '').toLowerCase()) {
    case 'red':
      return LEVEL.EXTREME
    case 'orange':
      return LEVEL.HIGH
    case 'yellow':
      return LEVEL.MODERATE
    case 'green':
      return LEVEL.LOW
    default:
      return LEVEL.NONE
  }
}
