/**
 * Packet verification and alert state test suite (M4).
 *
 * Enforces cryptographic invariants, tampering rejection, clock skew tolerance,
 * alert superseding rules, and size budget limits.
 */

import { describe, expect, it } from 'vitest'
import {
  base64urlDecode,
  base64urlEncode,
  encodePayload,
  parsePayload,
  signPacket,
  verifyPacket,
  type PacketFields,
} from '../shared/packet'
import { computeEffectiveAlerts, filterAlertsForZone, getMaxZoneRisk } from '../shared/alertState'

// Generate an ephemeral in-memory test keypair for tests
async function createTestKeypair(kid = 'test-k1'): Promise<{
  publicJwk: JsonWebKey
  privateJwk: JsonWebKey
}> {
  const crypto = globalThis.crypto
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & { kid: string }
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey & { kid: string }
  publicJwk.kid = kid
  privateJwk.kid = kid
  return { publicJwk, privateJwk }
}

const { publicJwk: testPublic, privateJwk: testPrivate } = await createTestKeypair('k1')
const { privateJwk: wrongPrivate } = await createTestKeypair('k-wrong')

const nowMs = 1775800000000 // Fixed reference epoch ms
const nowMin = Math.floor(nowMs / 60000)

const sampleFields: PacketFields = {
  kid: 'k1',
  hazard: 'FL',
  level: 3,
  zones: ['Z1', 'Z2', 'Z3'],
  issuedMin: nowMin - 10,
  expiresMin: nowMin + 120,
  seq: 1,
  mode: 'L',
}

describe('Packet Codec & Signing', () => {
  it('encodes payload to canonical format', () => {
    const payload = encodePayload(sampleFields)
    expect(payload).toBe(
      `KV1.k1.FL.3.Z1-Z2-Z3.${(nowMin - 10).toString(36)}.${(nowMin + 120).toString(36)}.1.L`,
    )
  })

  it('parses valid payload correctly', () => {
    const payload = encodePayload(sampleFields)
    const res = parsePayload(payload)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.fields).toEqual(sampleFields)
    }
  })

  it('round-trip signs and verifies a valid packet', async () => {
    const packetStr = await signPacket(testPrivate, sampleFields)
    const result = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields.hazard).toBe('FL')
      expect(result.fields.level).toBe(3)
      expect(result.fields.zones).toEqual(['Z1', 'Z2', 'Z3'])
      expect(result.isDrill).toBe(false)
      expect(result.issuedAt).toBe(sampleFields.issuedMin * 60000)
      expect(result.expiresAt).toBe(sampleFields.expiresMin * 60000)
    }
  })

  it('total packet string length is under 160 characters for typical input', async () => {
    const packetStr = await signPacket(testPrivate, sampleFields)
    expect(packetStr.length).toBeLessThan(160)
    expect(packetStr.length).toBeGreaterThan(100)
  })

  it('base64url encoding contains no padding (=) and no URL-unsafe characters', async () => {
    const packetStr = await signPacket(testPrivate, sampleFields)
    const signature = packetStr.split('.').pop()!
    expect(signature).not.toContain('=')
    expect(signature).not.toContain('+')
    expect(signature).not.toContain('/')
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(signature.length).toBe(86) // 64 bytes IEEE P1363 raw signature base64url encoded
  })

  it('base64url round-trips raw byte buffers', () => {
    const raw = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 64])
    const enc = base64urlEncode(raw)
    const dec = base64urlDecode(enc)
    expect(dec).toEqual(raw)
  })
})

describe('Tamper & Security Matrix', () => {
  it('detects tampering in each field of the payload', async () => {
    const packetStr = await signPacket(testPrivate, sampleFields)
    const parts = packetStr.split('.')
    const signature = parts[parts.length - 1]!
    const payloadParts = parts.slice(0, -1)

    // Tamper each position:
    // 0: Version
    const tamperedVer = ['KV2', ...payloadParts.slice(1), signature].join('.')
    expect((await verifyPacket({ k1: testPublic }, tamperedVer, { now: nowMs })).ok).toBe(false)

    // 2: Hazard (FL -> CY)
    const tamperedHazard = [
      payloadParts[0],
      payloadParts[1],
      'CY',
      ...payloadParts.slice(3),
      signature,
    ].join('.')
    const resHazard = await verifyPacket({ k1: testPublic }, tamperedHazard, { now: nowMs })
    expect(resHazard.ok).toBe(false)
    if (!resHazard.ok) expect(resHazard.reason).toBe('signature')

    // 3: Level (3 -> 4)
    const tamperedLevel = [
      ...payloadParts.slice(0, 3),
      '4',
      ...payloadParts.slice(4),
      signature,
    ].join('.')
    const resLevel = await verifyPacket({ k1: testPublic }, tamperedLevel, { now: nowMs })
    expect(resLevel.ok).toBe(false)
    if (!resLevel.ok) expect(resLevel.reason).toBe('signature')

    // 4: Zones (Z1-Z2-Z3 -> Z1-Z9)
    const tamperedZones = [
      ...payloadParts.slice(0, 4),
      'Z1-Z9',
      ...payloadParts.slice(5),
      signature,
    ].join('.')
    const resZones = await verifyPacket({ k1: testPublic }, tamperedZones, { now: nowMs })
    expect(resZones.ok).toBe(false)
    if (!resZones.ok) expect(resZones.reason).toBe('signature')

    // 8: Mode (L -> D)
    const tamperedMode = [...payloadParts.slice(0, 8), 'D', signature].join('.')
    const resMode = await verifyPacket({ k1: testPublic }, tamperedMode, { now: nowMs })
    expect(resMode.ok).toBe(false)
    if (!resMode.ok) expect(resMode.reason).toBe('signature')
  })

  it('fails with "signature" when signed by wrong private key', async () => {
    // Sign with wrong private key, attempt verify against k1 public key
    const packetStr = await signPacket(wrongPrivate, sampleFields)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('signature')
  })

  it('fails with "unknown-kid" when key id is not in registry', async () => {
    const unregFields = { ...sampleFields, kid: 'k-unknown' }
    const packetStr = await signPacket(testPrivate, unregFields)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown-kid')
  })

  it('fails with "expired" when alert expiry is in the past', async () => {
    const expiredFields: PacketFields = {
      ...sampleFields,
      issuedMin: nowMin - 100,
      expiresMin: nowMin - 15, // Expired 15 min ago (outside default 10m tolerance)
    }
    const packetStr = await signPacket(testPrivate, expiredFields)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('expired')
  })

  it('accepts alert within clock skew tolerance ahead of time with warning', async () => {
    const futureWithinTol: PacketFields = {
      ...sampleFields,
      issuedMin: nowMin + 5, // 5 min in the future (within 10 min tolerance)
      expiresMin: nowMin + 120,
    }
    const packetStr = await signPacket(testPrivate, futureWithinTol)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clockSkewWarning).toBe(true)
    }
  })

  it('fails with "not-yet-valid" when alert issuance is far in the future', async () => {
    const futureFar: PacketFields = {
      ...sampleFields,
      issuedMin: nowMin + 60, // 60 min ahead (beyond 10 min tolerance)
      expiresMin: nowMin + 180,
    }
    const packetStr = await signPacket(testPrivate, futureFar)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not-yet-valid')
  })

  it('flags DRILL alerts correctly', async () => {
    const drillFields: PacketFields = { ...sampleFields, mode: 'D' }
    const packetStr = await signPacket(testPrivate, drillFields)
    const res = await verifyPacket({ k1: testPublic }, packetStr, { now: nowMs })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.isDrill).toBe(true)
      expect(res.fields.mode).toBe('D')
    }
  })
})

describe('Supersede & Alert State Consolidation', () => {
  it('higher sequence number supersedes lower sequence number for same hazard and zone', () => {
    const alert1: PacketFields = {
      ...sampleFields,
      hazard: 'FL',
      level: 2,
      zones: ['Z1'],
      seq: 1,
    }
    const alert2: PacketFields = {
      ...sampleFields,
      hazard: 'FL',
      level: 4,
      zones: ['Z1'],
      seq: 2,
    }

    const effective = computeEffectiveAlerts([alert1, alert2], { now: nowMs })
    expect(effective.length).toBe(1)
    expect(effective[0]?.level).toBe(4)
    expect(effective[0]?.seq).toBe(2)
  })

  it('level 0 cancels active alert for that hazard and zone', () => {
    const alert1: PacketFields = {
      ...sampleFields,
      hazard: 'FL',
      level: 3,
      zones: ['Z1', 'Z2'],
      seq: 1,
    }
    const cancelAlert: PacketFields = {
      ...sampleFields,
      hazard: 'FL',
      level: 0,
      zones: ['Z1'],
      seq: 2,
    }

    const effective = computeEffectiveAlerts([alert1, cancelAlert], { now: nowMs })
    // Z1 is cancelled (level 0), Z2 remains active at level 3
    const z1Alerts = filterAlertsForZone(effective, 'Z1')
    const z2Alerts = filterAlertsForZone(effective, 'Z2')

    expect(z1Alerts.length).toBe(0)
    expect(z2Alerts.length).toBe(1)
    expect(z2Alerts[0]?.level).toBe(3)
  })

  it('hazard "AC" (All Clear) cancels all hazards for specified zone', () => {
    const floodAlert: PacketFields = {
      ...sampleFields,
      hazard: 'FL',
      level: 3,
      zones: ['Z1'],
      seq: 1,
    }
    const cycloneAlert: PacketFields = {
      ...sampleFields,
      hazard: 'CY',
      level: 2,
      zones: ['Z1'],
      seq: 1,
    }
    const allClear: PacketFields = {
      ...sampleFields,
      hazard: 'AC',
      level: 0,
      zones: ['Z1'],
      seq: 2,
    }

    const effective = computeEffectiveAlerts([floodAlert, cycloneAlert, allClear], { now: nowMs })
    expect(filterAlertsForZone(effective, 'Z1').length).toBe(0)
    expect(getMaxZoneRisk(effective, 'Z1')).toBe(0)
  })

  it('strictly isolates DRILL alerts from LIVE alerts', () => {
    const liveAlert: PacketFields = {
      ...sampleFields,
      mode: 'L',
      hazard: 'FL',
      level: 2,
      zones: ['Z1'],
      seq: 1,
    }
    const drillAlert: PacketFields = {
      ...sampleFields,
      mode: 'D',
      hazard: 'FL',
      level: 4,
      zones: ['Z1'],
      seq: 1,
    }

    const liveOnly = computeEffectiveAlerts([liveAlert, drillAlert], { now: nowMs, mode: 'L' })
    expect(liveOnly.length).toBe(1)
    expect(liveOnly[0]?.level).toBe(2)
    expect(liveOnly[0]?.isDrill).toBe(false)

    const drillOnly = computeEffectiveAlerts([liveAlert, drillAlert], { now: nowMs, mode: 'D' })
    expect(drillOnly.length).toBe(1)
    expect(drillOnly[0]?.level).toBe(4)
    expect(drillOnly[0]?.isDrill).toBe(true)
  })
})

describe('Fuzz & Robustness Testing', () => {
  it('fuzzing with 500 random garbage strings never throws unhandled exceptions', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-_~!@#$%^&*()=+[]{}|;:,<>?/'

    for (let i = 0; i < 500; i++) {
      const len = Math.floor(Math.random() * 200)
      let randomStr = ''
      for (let j = 0; j < len; j++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      // Must return an object with ok: false without throwing
      const res = await verifyPacket({ k1: testPublic }, randomStr, { now: nowMs })
      expect(res).toBeDefined()
      expect(res.ok).toBe(false)
    }
  })
})
