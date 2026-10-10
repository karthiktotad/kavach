/**
 * Kavach signed alert packets (core idea 1).
 *
 * Runs across the client browser, unit tests, and Supabase Edge Functions.
 * Uses WebCrypto only (no Node/Deno dependencies).
 */

export const HAZARD_CODES = ['FL', 'CY', 'HT', 'WN', 'LS', 'AC'] as const
export type HazardCode = (typeof HAZARD_CODES)[number]

export const ALERT_LEVELS = [0, 1, 2, 3, 4] as const
export type AlertLevel = (typeof ALERT_LEVELS)[number]

export type PacketMode = 'L' | 'D' // Live or Drill

export interface PacketFields {
  readonly kid: string
  readonly hazard: HazardCode
  readonly level: AlertLevel
  readonly zones: readonly string[]
  readonly issuedMin: number // Unix minutes
  readonly expiresMin: number // Unix minutes
  readonly seq: number
  readonly mode: PacketMode
}

export type PacketVerifyFailureReason =
  | 'format'
  | 'unknown-kid'
  | 'signature'
  | 'expired'
  | 'not-yet-valid'

export interface VerifySuccess {
  readonly ok: true
  readonly fields: PacketFields
  readonly packet: string
  readonly payload: string
  readonly signature: string
  readonly isDrill: boolean
  readonly issuedAt: number // Epoch ms
  readonly expiresAt: number // Epoch ms
  readonly clockSkewWarning?: boolean
}

export interface VerifyFailure {
  readonly ok: false
  readonly reason: PacketVerifyFailureReason
  readonly error: string
  readonly raw?: string
}

export type VerifyResult = VerifySuccess | VerifyFailure

export interface VerifyOptions {
  /** Timestamp in ms against which to check expiry/not-yet-valid. Defaults to Date.now(). */
  readonly now?: number
  /** Allowed clock skew in minutes for not-yet-valid alerts. Defaults to 10. */
  readonly toleranceMinutes?: number
  /** If true, verifies cryptographic validity without failing on time expiration. */
  readonly allowExpired?: boolean
}

const VERSION = 'KV1'
const KID_REGEX = /^[a-zA-Z0-9_-]{1,16}$/
const ZONE_REGEX = /^[A-Za-z0-9_-]{1,16}$/
const BASE36_REGEX = /^[0-9a-z]+$/i

/** Encode payload fields into canonical dot-separated string. */
export function encodePayload(fields: PacketFields): string {
  if (!KID_REGEX.test(fields.kid)) {
    throw new Error(`Invalid kid: "${fields.kid}"`)
  }
  if (!HAZARD_CODES.includes(fields.hazard)) {
    throw new Error(`Invalid hazard: "${fields.hazard}"`)
  }
  if (!ALERT_LEVELS.includes(fields.level)) {
    throw new Error(`Invalid level: ${fields.level}`)
  }
  if (!fields.zones.length || fields.zones.some((z) => !ZONE_REGEX.test(z))) {
    throw new Error(`Invalid zones: ${JSON.stringify(fields.zones)}`)
  }
  if (fields.issuedMin < 0 || !Number.isInteger(fields.issuedMin)) {
    throw new Error(`Invalid issuedMin: ${fields.issuedMin}`)
  }
  if (fields.expiresMin < fields.issuedMin || !Number.isInteger(fields.expiresMin)) {
    throw new Error(`Invalid expiresMin: ${fields.expiresMin}`)
  }
  if (fields.seq < 0 || !Number.isInteger(fields.seq)) {
    throw new Error(`Invalid seq: ${fields.seq}`)
  }
  if (fields.mode !== 'L' && fields.mode !== 'D') {
    throw new Error(`Invalid mode: "${String(fields.mode)}"`)
  }

  const zonesStr = fields.zones.join('-')
  const issuedStr = fields.issuedMin.toString(36)
  const expiresStr = fields.expiresMin.toString(36)
  const seqStr = fields.seq.toString(36)

  return `${VERSION}.${fields.kid}.${fields.hazard}.${fields.level}.${zonesStr}.${issuedStr}.${expiresStr}.${seqStr}.${fields.mode}`
}

/** Parse and strictly validate payload string. */
export function parsePayload(
  payloadStr: string,
): { ok: true; fields: PacketFields } | { ok: false; reason: 'format'; error: string } {
  const parts = payloadStr.split('.')
  if (parts.length !== 9) {
    return {
      ok: false,
      reason: 'format',
      error: `Payload must have 9 dot-separated parts, found ${parts.length}`,
    }
  }

  const [version, kid, hazard, levelStr, zonesStr, issuedStr, expiresStr, seqStr, mode] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]

  if (version !== VERSION) {
    return { ok: false, reason: 'format', error: `Unsupported protocol version: ${version}` }
  }
  if (!KID_REGEX.test(kid)) {
    return { ok: false, reason: 'format', error: `Invalid key id: ${kid}` }
  }
  if (!HAZARD_CODES.includes(hazard as HazardCode)) {
    return { ok: false, reason: 'format', error: `Unknown hazard code: ${hazard}` }
  }

  const levelNum = Number(levelStr)
  if (!/^[0-4]$/.test(levelStr) || !ALERT_LEVELS.includes(levelNum as AlertLevel)) {
    return { ok: false, reason: 'format', error: `Invalid alert level: ${levelStr}` }
  }

  if (!zonesStr) {
    return { ok: false, reason: 'format', error: 'Zones list cannot be empty' }
  }
  const zones = zonesStr.split('-')
  if (zones.some((z) => !ZONE_REGEX.test(z))) {
    return { ok: false, reason: 'format', error: `Invalid zone identifiers in: ${zonesStr}` }
  }

  if (!BASE36_REGEX.test(issuedStr) || !BASE36_REGEX.test(expiresStr)) {
    return { ok: false, reason: 'format', error: 'Timestamps must be base36 strings' }
  }
  const issuedMin = parseInt(issuedStr, 36)
  const expiresMin = parseInt(expiresStr, 36)

  if (isNaN(issuedMin) || isNaN(expiresMin) || issuedMin < 0) {
    return { ok: false, reason: 'format', error: 'Invalid numeric timestamps' }
  }
  if (expiresMin < issuedMin) {
    return { ok: false, reason: 'format', error: 'Expiry cannot be before issue time' }
  }

  // Absurd duration check (> 30 days)
  const maxDurationMinutes = 30 * 24 * 60
  if (expiresMin - issuedMin > maxDurationMinutes) {
    return { ok: false, reason: 'format', error: 'Alert duration exceeds maximum 30 days limit' }
  }

  if (!BASE36_REGEX.test(seqStr)) {
    return { ok: false, reason: 'format', error: 'Sequence must be base36 string' }
  }
  const seq = parseInt(seqStr, 36)
  if (isNaN(seq) || seq < 0 || seq > 2147483647) {
    return { ok: false, reason: 'format', error: `Invalid sequence integer: ${seqStr}` }
  }

  if (mode !== 'L' && mode !== 'D') {
    return { ok: false, reason: 'format', error: `Invalid mode: ${mode} (must be L or D)` }
  }

  return {
    ok: true,
    fields: {
      kid,
      hazard: hazard as HazardCode,
      level: levelNum as AlertLevel,
      zones,
      issuedMin,
      expiresMin,
      seq,
      mode,
    },
  }
}

/** Base64url encode without padding. */
export function base64urlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const base64 = globalThis.btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Base64url decode. */
export function base64urlDecode(str: string): Uint8Array | null {
  if (!str || typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) {
    return null
  }
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) {
      base64 += '='
    }
    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

/** Sign a packet payload with an ECDSA P-256 private key JWK. */
export async function signPacket(
  privateKeyJwk: JsonWebKey,
  fields: PacketFields,
): Promise<string> {
  const payload = encodePayload(fields)
  const crypto = globalThis.crypto

  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const payloadBytes = new TextEncoder().encode(payload)
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    payloadBytes,
  )

  const signatureBase64 = base64urlEncode(signatureBuffer)
  return `${payload}.${signatureBase64}`
}

/** Verify a full packet string against bundled authority public key(s). */
export async function verifyPacket(
  publicKeys: Record<string, JsonWebKey> | JsonWebKey,
  packetString: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  if (!packetString || typeof packetString !== 'string') {
    return { ok: false, reason: 'format', error: 'Packet string is empty or invalid' }
  }

  const trimmed = packetString.trim()
  const lastDotIndex = trimmed.lastIndexOf('.')
  if (lastDotIndex <= 0 || lastDotIndex === trimmed.length - 1) {
    return { ok: false, reason: 'format', error: 'Packet must contain payload and signature separated by dot' }
  }

  const payload = trimmed.slice(0, lastDotIndex)
  const signatureStr = trimmed.slice(lastDotIndex + 1)

  const parsed = parsePayload(payload)
  if (!parsed.ok) {
    return { ok: false, reason: 'format', error: parsed.error, raw: trimmed }
  }

  const { fields } = parsed
  const keysMap: Record<string, JsonWebKey> =
    'kty' in publicKeys
      ? { [fields.kid]: publicKeys }
      : (publicKeys as Record<string, JsonWebKey>)

  const keyJwk = keysMap[fields.kid]
  if (!keyJwk) {
    return {
      ok: false,
      reason: 'unknown-kid',
      error: `Key ID "${fields.kid}" not found in trusted authority key registry`,
      raw: trimmed,
    }
  }

  const signatureBytes = base64urlDecode(signatureStr)
  if (!signatureBytes || signatureBytes.length !== 64) {
    return {
      ok: false,
      reason: 'signature',
      error: 'Malformed signature binary length (must be 64 bytes for P-256 raw IEEE P1363)',
      raw: trimmed,
    }
  }

  try {
    const crypto = globalThis.crypto
    const key = await crypto.subtle.importKey(
      'jwk',
      keyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )

    const payloadBytes = new TextEncoder().encode(payload)
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      signatureBytes as unknown as BufferSource,
      payloadBytes,
    )

    if (!valid) {
      return { ok: false, reason: 'signature', error: 'Cryptographic signature mismatch', raw: trimmed }
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'signature',
      error: `Crypto verification failed: ${err instanceof Error ? err.message : String(err)}`,
      raw: trimmed,
    }
  }

  // Time verification with clock skew tolerance
  const nowMs = options.now ?? Date.now()
  const nowMin = Math.floor(nowMs / 60000)
  const tolerance = options.toleranceMinutes ?? 10

  const issuedAt = fields.issuedMin * 60000
  const expiresAt = fields.expiresMin * 60000

  if (!options.allowExpired) {
    if (fields.expiresMin < nowMin - tolerance) {
      return {
        ok: false,
        reason: 'expired',
        error: `Alert expired at ${new Date(expiresAt).toISOString()}`,
        raw: trimmed,
      }
    }
  }

  // Clock skew check
  let clockSkewWarning = false
  if (fields.issuedMin > nowMin + tolerance) {
    return {
      ok: false,
      reason: 'not-yet-valid',
      error: `Alert issued in the future (${new Date(issuedAt).toISOString()}) beyond tolerance`,
      raw: trimmed,
    }
  } else if (fields.issuedMin > nowMin) {
    // Within tolerance ahead of time: still accept, flag warning
    clockSkewWarning = true
  }

  return {
    ok: true,
    fields,
    packet: trimmed,
    payload,
    signature: signatureStr,
    isDrill: fields.mode === 'D',
    issuedAt,
    expiresAt,
    clockSkewWarning: clockSkewWarning ? true : undefined,
  }
}
