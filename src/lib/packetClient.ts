/**
 * Client-side packet verification and storage bridge.
 *
 * Connects the pure crypto verification in shared/packet.ts with IndexedDB
 * and the preloaded localized alert templates.
 */

import { verifyPacket, type VerifyOptions, type VerifyResult } from '@shared/packet'
import { getDb, type AlertRow, type PacketRow } from './db'
import { packManager } from './pack'
import authorityKeys from '../config/authorityKeys.json'

export type PacketSource = 'server' | 'sms-link' | 'sms' | 'qr' | 'share' | 'manual'

export interface RenderedAlert {
  readonly headline: string
  readonly steps: readonly string[]
  readonly templateId: string
  readonly hazardName: string
  readonly levelName: string
}

const FALLBACK_HAZARD_NAMES: Record<string, string> = {
  FL: 'Flood',
  CY: 'Cyclone',
  HT: 'Extreme Heat',
  WN: 'High Winds',
  LS: 'Landslide',
  AC: 'All Clear',
}

const FALLBACK_LEVEL_NAMES: Record<number, string> = {
  0: 'All Clear / Cancelled',
  1: 'Advisory',
  2: 'Watch',
  3: 'Warning',
  4: 'Extreme Emergency',
}

/** Get the bundled authority public key registry. */
export function getAuthorityKeys(): Record<string, JsonWebKey> {
  return authorityKeys
}

/**
 * Render a verified alert packet into human-readable text using cached pack templates,
 * falling back gracefully if the content pack is not yet installed.
 */
export async function renderAlertFromPack(
  hazard: string,
  level: number,
  zones: readonly string[],
  locale = 'en',
): Promise<RenderedAlert> {
  const hazardName = FALLBACK_HAZARD_NAMES[hazard] ?? hazard
  const levelName = FALLBACK_LEVEL_NAMES[level] ?? `Level ${level}`
  const templateId = hazard === 'AC' || level === 0 ? 'AC' : `${hazard}-${level}`

  try {
    const templatesFile = await packManager.getTemplates(locale)
    const template = templatesFile.templates.find(
      (t) => t.id === templateId || (t.hazard === hazard && (level === 0 || t.level === level)),
    )

    if (template) {
      const zoneListStr = zones.join(', ')
      const replaceVars = (str: string) =>
        str
          .replace(/\{zone\}/g, zoneListStr)
          .replace(/\{hazard\}/g, hazardName)
          .replace(/\{level\}/g, levelName)

      return {
        headline: replaceVars(template.headline),
        steps: template.steps.map(replaceVars),
        templateId: template.id,
        hazardName,
        levelName,
      }
    }
  } catch {
    // Content pack not yet available; proceed with fallback
  }

  // Graceful fallback for offline first-open before pack install
  if (hazard === 'AC' || level === 0) {
    return {
      headline: `All-Clear declared for zone(s) ${zones.join(', ')}`,
      steps: [
        'Danger has subsided in the specified area(s).',
        'Follow instructions from local authorities before re-entering evacuated structures.',
      ],
      templateId,
      hazardName: 'All Clear',
      levelName: 'All Clear',
    }
  }

  return {
    headline: `Official ${hazardName} Alert (${levelName}) for zone(s) ${zones.join(', ')}`,
    steps: [
      `Stay alert in zone(s) ${zones.join(', ')}.`,
      'Move to higher ground or seek designated shelter if danger is imminent.',
      'Keep your device charged and monitor official emergency broadcasts.',
    ],
    templateId,
    hazardName,
    levelName,
  }
}

/**
 * Verify an incoming packet string and store it to IndexedDB.
 */
export async function verifyAndStore(
  packetString: string,
  source: PacketSource = 'share',
  options: VerifyOptions = {},
  locale = 'en',
): Promise<{ result: VerifyResult; rendered?: RenderedAlert }> {
  const keys = getAuthorityKeys()
  const result = await verifyPacket(keys, packetString, options)
  const db = getDb()
  const now = Date.now()

  let normalizedSource: PacketRow['source'] = 'share'
  if (source === 'server') normalizedSource = 'sync'
  else if (source === 'sms-link' || source === 'sms') normalizedSource = 'sms'
  else if (source === 'qr' || source === 'share' || source === 'manual') normalizedSource = source

  if (!result.ok) {
    // Save unverified record if we can extract key id or raw string
    try {
      await db.packets.put({
        id: packetString,
        hazard: null,
        level: null,
        zoneIds: [],
        issuedAt: now,
        expiresAt: null,
        keyId: null,
        verified: false,
        verifyError: result.error,
        isDrill: false,
        source: normalizedSource,
        receivedAt: now,
      })
    } catch {
      // Storage errors shouldn't crash the verification flow
    }
    return { result }
  }

  const { fields, isDrill, issuedAt, expiresAt } = result
  const rendered = await renderAlertFromPack(fields.hazard, fields.level, fields.zones, locale)

  try {
    const packetRow: PacketRow = {
      id: packetString,
      hazard: fields.hazard,
      level: fields.level,
      zoneIds: [...fields.zones],
      issuedAt,
      expiresAt,
      keyId: fields.kid,
      verified: true,
      verifyError: null,
      isDrill,
      source: normalizedSource,
      receivedAt: now,
    }
    await db.packets.put(packetRow)

    const alertRow: AlertRow = {
      id: `${fields.mode}-${fields.hazard}-${fields.zones.join('-')}-${fields.seq}`,
      packetId: packetString,
      templateId: rendered.templateId,
      hazard: fields.hazard,
      level: fields.level,
      zoneIds: [...fields.zones],
      headline: rendered.headline,
      steps: [...rendered.steps],
      issuedAt,
      expiresAt,
      isDrill,
      acknowledged: false,
      updatedAt: now,
    }
    await db.alerts.put(alertRow)
  } catch (err) {
    console.error('[packetClient] Failed to store packet in IndexedDB:', err)
  }

  return { result, rendered }
}
