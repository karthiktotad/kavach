/**
 * Alert state consolidation and supersede rules.
 *
 * Runs across the client, tests, and Edge Functions.
 *
 * Rules:
 *  1. Grouping: alerts are evaluated per (mode, hazard, zone).
 *  2. Sequence precedence: for a given (mode, hazard, zone), highest `seq` wins.
 *     If `seq` is identical, the one with later `issuedMin` wins.
 *  3. Cancellation:
 *     - `level: 0` cancels any active alert for that specific hazard in those zones.
 *     - `hazard: 'AC'` (All-Clear) cancels alerts for ALL hazards in those zones up to that sequence.
 *  4. Expiry: alerts whose `expiresMin` is in the past relative to `now` drop out.
 *  5. Drill isolation: Live ('L') and Drill ('D') alerts are strictly partitioned.
 */

import {
  type AlertLevel,
  type HazardCode,
  type PacketFields,
  type PacketMode,
  type VerifySuccess,
} from './packet'

export interface EffectiveAlert {
  readonly id: string
  readonly hazard: HazardCode
  readonly level: AlertLevel
  readonly zoneId: string
  readonly allZones: readonly string[]
  readonly issuedAt: number
  readonly expiresAt: number
  readonly seq: number
  readonly mode: PacketMode
  readonly isDrill: boolean
  readonly kid: string
  readonly packet?: string
}

export interface ComputeAlertsOptions {
  /** Reference epoch ms to filter out expired alerts. Defaults to Date.now(). */
  readonly now?: number
  /** If specified, returns only Live or Drill alerts. */
  readonly mode?: PacketMode
}

function normalizeInput(item: VerifySuccess | PacketFields): {
  fields: PacketFields
  packet?: string
} {
  if ('fields' in item) {
    return { fields: item.fields, packet: item.packet }
  }
  return { fields: item }
}

/**
 * Compute the effective active alerts from a collection of verified packets.
 */
export function computeEffectiveAlerts(
  packets: readonly (VerifySuccess | PacketFields)[],
  options: ComputeAlertsOptions = {},
): EffectiveAlert[] {
  const nowMs = options.now ?? Date.now()
  const nowMin = Math.floor(nowMs / 60000)

  // Map key: `${mode}:${zone}:${hazard}` -> latest candidate
  const perHazardState = new Map<
    string,
    { fields: PacketFields; packet?: string; zoneId: string }
  >()

  // Map key: `${mode}:${zone}` -> latest All-Clear (AC) sequence & issuedMin
  const allClearState = new Map<string, { seq: number; issuedMin: number }>()

  // Sort packets chronologically / by sequence to establish ordering
  const sorted = [...packets].map(normalizeInput).sort((a, b) => {
    if (a.fields.seq !== b.fields.seq) {
      return a.fields.seq - b.fields.seq
    }
    return a.fields.issuedMin - b.fields.issuedMin
  })

  for (const { fields, packet } of sorted) {
    // Drop expired packets
    if (fields.expiresMin < nowMin) {
      continue
    }

    // Filter by mode if requested
    if (options.mode && fields.mode !== options.mode) {
      continue
    }

    const { mode, hazard, zones, seq, issuedMin } = fields

    for (const zoneId of zones) {
      const zoneKey = `${mode}:${zoneId}`

      // Handle All-Clear ('AC') hazard
      if (hazard === 'AC') {
        const existingAc = allClearState.get(zoneKey)
        if (
          !existingAc ||
          seq > existingAc.seq ||
          (seq === existingAc.seq && issuedMin >= existingAc.issuedMin)
        ) {
          allClearState.set(zoneKey, { seq, issuedMin })
        }
        continue
      }

      const hazardKey = `${mode}:${zoneId}:${hazard}`
      const existing = perHazardState.get(hazardKey)

      if (
        !existing ||
        seq > existing.fields.seq ||
        (seq === existing.fields.seq && issuedMin >= existing.fields.issuedMin)
      ) {
        perHazardState.set(hazardKey, { fields, packet, zoneId })
      }
    }
  }

  // Filter out superseded / cancelled / level-0 alerts
  const results: EffectiveAlert[] = []

  for (const [, { fields, packet, zoneId }] of perHazardState.entries()) {
    const { mode, hazard, level, zones, seq, issuedMin, expiresMin, kid } = fields

    // Level 0 means explicitly cancelled
    if (level === 0) {
      continue
    }

    // Check if an All-Clear for this zone occurred at or after this alert's seq
    const zoneKey = `${mode}:${zoneId}`
    const ac = allClearState.get(zoneKey)
    if (ac && (ac.seq > seq || (ac.seq === seq && ac.issuedMin >= issuedMin))) {
      // Alert cancelled by All-Clear
      continue
    }

    results.push({
      id: `${mode}-${hazard}-${zoneId}-${seq}`,
      hazard,
      level,
      zoneId,
      allZones: zones,
      issuedAt: issuedMin * 60000,
      expiresAt: expiresMin * 60000,
      seq,
      mode,
      isDrill: mode === 'D',
      kid,
      packet,
    })
  }

  // Return sorted with highest severity first, then by earliest issuedAt
  return results.sort((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level
    }
    return a.issuedAt - b.issuedAt
  })
}

/** Filter effective alerts for a specific zone. */
export function filterAlertsForZone(
  alerts: readonly EffectiveAlert[],
  zoneId: string,
): EffectiveAlert[] {
  return alerts.filter((a) => a.zoneId === zoneId)
}

/** Maximum active level for a zone across all hazards. */
export function getMaxZoneRisk(alerts: readonly EffectiveAlert[], zoneId: string): AlertLevel {
  const zoneAlerts = filterAlertsForZone(alerts, zoneId)
  if (!zoneAlerts.length) return 0
  return Math.max(...zoneAlerts.map((a) => a.level)) as AlertLevel
}
