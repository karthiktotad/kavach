/**
 * Types and interfaces for the Authority Console (FE-8).
 */
import type { AlertLevel, HazardCode, PacketMode } from '../../../shared/packet'

export type AuthorityNavTab = 'create' | 'active' | 'history' | 'reports' | 'checkins'

export interface CommunityReportItem {
  readonly id: string
  readonly kind: 'flood' | 'wind' | 'heat' | 'landslide' | 'injury' | 'other'
  readonly hazardCode: HazardCode
  readonly zoneId: string
  readonly zoneName: string
  readonly note: string
  readonly timestamp: number
  readonly confidence: number // 0..100
  readonly confirmationsCount: number
  readonly gpsVerified: boolean
  readonly photoAttached?: boolean
}

export interface ZoneCheckinMetric {
  readonly zoneId: string
  readonly zoneName: string
  readonly safeCount: number
  readonly needHelpCount: number
  readonly evacuatingCount: number
  readonly totalCheckins: number
  readonly priorHourCheckins: number
  readonly dropDetected: boolean
}

export interface IssuedAlertRecord {
  readonly id: string
  readonly packet: string
  readonly hazard: HazardCode
  readonly level: AlertLevel
  readonly zones: readonly string[]
  readonly issuedAt: number
  readonly expiresAt: number
  readonly seq: number
  readonly mode: PacketMode
  readonly kid: string
  readonly note?: string
}
