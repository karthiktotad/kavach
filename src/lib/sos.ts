/**
 * SOS Message Generator & SMS Dispatcher (FE-7).
 *
 * Requirements:
 *  - Format: "SOS from Kavach. I need help. My location: <lat>, <lon> (about <n> m). Blood group: <x>. Allergies: <y>."
 *  - Omit empty fields; NEVER put placeholder text into a real message.
 *  - URL-encode; cap at 300 characters (drop allergy detail first if too long).
 *  - Handle SMS URI syntax differences (iOS uses '&body=', Android '?body=').
 *  - When no contact is saved, open 'sms:' without a recipient and return warning flag.
 */

export interface SosLocation {
  readonly lat: number
  readonly lon: number
  readonly accuracyMetres?: number
}

export interface SosMedicalDetails {
  readonly bloodGroup?: string | null
  readonly allergies?: string | string[] | null
}

export interface BuildSosOptions {
  readonly location?: SosLocation | null
  readonly medical?: SosMedicalDetails | null
  readonly recipientPhone?: string | null
  readonly platform?: 'ios' | 'android' | 'other'
}

export interface SosPayload {
  readonly text: string
  readonly smsUrl: string
  readonly recipientPhone: string | null
  readonly needsContact: boolean
  readonly warning?: string
}

const MAX_SOS_LENGTH = 300

/**
 * Format a human-readable location string:
 * e.g. "My location: 12.6208, 80.1944 (about 15 m)."
 */
function formatLocation(loc?: SosLocation | null): string | null {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
    return null
  }
  const latStr = loc.lat.toFixed(5)
  const lonStr = loc.lon.toFixed(5)
  if (typeof loc.accuracyMetres === 'number' && loc.accuracyMetres > 0) {
    const acc = Math.round(loc.accuracyMetres)
    return `My location: ${latStr}, ${lonStr} (about ${acc} m).`
  }
  return `My location: ${latStr}, ${lonStr}.`
}

/**
 * Clean and format allergy string.
 */
function formatAllergies(allergies?: string | string[] | null): string | null {
  if (!allergies) return null
  if (Array.isArray(allergies)) {
    const filtered = allergies.map((a) => a.trim()).filter(Boolean)
    if (filtered.length === 0) return null
    return filtered.join(', ')
  }
  const trimmed = allergies.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Compose the text message respecting the 300-char limit.
 * If over 300 characters, progressively drops allergy detail first, then truncates safely.
 */
export function formatSosText(options: {
  location?: SosLocation | null
  medical?: SosMedicalDetails | null
}): string {
  const base = 'SOS from Kavach. I need help.'
  const locationStr = formatLocation(options.location)
  const bloodGroup = options.medical?.bloodGroup?.trim() || null
  const allergiesStr = formatAllergies(options.medical?.allergies)

  const build = (includeAllergies: boolean, includeBlood: boolean, includeLoc: boolean): string => {
    const parts: string[] = [base]
    if (includeLoc && locationStr) parts.push(locationStr)
    if (includeBlood && bloodGroup) parts.push(`Blood group: ${bloodGroup}.`)
    if (includeAllergies && allergiesStr) parts.push(`Allergies: ${allergiesStr}.`)
    return parts.join(' ')
  }

  let text = build(true, true, true)
  if (text.length <= MAX_SOS_LENGTH) return text

  // Exceeds 300 chars: drop allergies first
  text = build(false, true, true)
  if (text.length <= MAX_SOS_LENGTH) return text

  // Still exceeds: drop blood group
  text = build(false, false, true)
  if (text.length <= MAX_SOS_LENGTH) return text

  // Truncate at hard limit if still oversized
  return text.slice(0, MAX_SOS_LENGTH)
}

/**
 * Detect runtime platform (iOS vs Android / others).
 */
export function detectPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  if (/Android/i.test(ua)) {
    return 'android'
  }
  return 'other'
}

/**
 * Build the platform-specific sms: URI.
 *  - iOS uses: `sms:<number>&body=<encodedText>` or `sms:&body=<encodedText>`
 *  - Android/Standard uses: `sms:<number>?body=<encodedText>` or `sms:?body=<encodedText>`
 */
export function buildSmsUrl(options: {
  phoneNumber?: string | null
  body: string
  platform?: 'ios' | 'android' | 'other'
}): string {
  const phone = options.phoneNumber?.trim().replace(/[^\d+]/g, '') || ''
  const encodedBody = encodeURIComponent(options.body)
  const isIos = options.platform === 'ios'

  const separator = isIos ? '&body=' : '?body='
  return `sms:${phone}${separator}${encodedBody}`
}

/**
 * Construct full SOS payload with text, SMS URI, and UI warning flags.
 */
export function buildSosPayload(options: BuildSosOptions): SosPayload {
  const text = formatSosText({
    location: options.location,
    medical: options.medical,
  })

  const platform = options.platform ?? detectPlatform()
  const recipient = options.recipientPhone?.trim() || null
  const hasRecipient = Boolean(recipient && recipient.length > 0)

  const smsUrl = buildSmsUrl({
    phoneNumber: recipient,
    body: text,
    platform,
  })

  return {
    text,
    smsUrl,
    recipientPhone: hasRecipient ? recipient : null,
    needsContact: !hasRecipient,
    warning: !hasRecipient ? 'needs: Add an emergency contact in Me' : undefined,
  }
}
