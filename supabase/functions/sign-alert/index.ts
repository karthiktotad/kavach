/**
 * sign-alert — the only thing in the system that can mint an official alert.
 *
 * Threat model, in order:
 *  1. An anonymous client must never be able to call this successfully.
 *  2. A signed-in user who is not an authority must never be able to call it.
 *  3. An authority must never be able to sign a packet referencing a zone that
 *     does not exist, or with an absurd expiry, because such a packet would be
 *     trusted by every tourist who received it.
 *  4. The private key must never appear in a log, an error, or a response.
 *
 * The private JWK is read from a Supabase secret. It is used to import a key
 * once per cold start and is never serialised back out.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ALERT_LEVELS, HAZARD_CODES, signPacket, type HazardCode } from '../../../shared/packet.ts'
import {
  corsHeaders,
  handleOptions,
  jsonError,
  jsonOk,
  parseObject,
  readJson,
  v,
} from '../_shared/http.ts'

const ALLOWED_DURATIONS_MIN = [30, 60, 180, 360, 720, 1440] as const

interface SignRequest {
  hazard: HazardCode
  level: number
  zones: string[]
  durationMin: number
  isDrill: boolean
  note?: string
}

const schema = parseObject<Record<string, unknown>>

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonError('bad_request', 'POST required')

  const headers = corsHeaders(req.headers.get('origin'))

  // --- 1. Authentication ----------------------------------------------------
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return withHeaders(jsonError('unauthorized', 'missing Authorization'), headers)

  // The anon key is safe to expose; the JWT identifies the caller.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    // The error text may contain the token, so it is deliberately not echoed.
    return withHeaders(jsonError('unauthorized', 'invalid session'), headers)
  }
  const userId = userData.user.id

  // --- 2. Authority check ---------------------------------------------------
  // Read through the service role so the RLS policy on profiles (which only
  // lets a user read their own row) does not interfere with the role lookup.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.role !== 'authority') {
    return withHeaders(jsonError('forbidden', 'caller is not an authority'), headers)
  }

  // --- 3. Validate the request ----------------------------------------------
  const body = await readJson(req)
  if (body === null) return withHeaders(jsonError('bad_request', 'body is not JSON'), headers)

  const parsed = parseObject<SignRequest>(body, {
    hazard: v.enum(HAZARD_CODES),
    level: v.number({ min: 0, max: 4, int: true }),
    zones: v.stringArray({ max: 20, pattern: /^Z\d{1,3}$/ }),
    durationMin: v.enum(ALLOWED_DURATIONS_MIN.map(String) as unknown as readonly string[]) as never,
    isDrill: v.boolean(),
    note: v.optional(v.string({ max: 280 })),
  })

  if (!parsed.ok) return withHeaders(jsonError('invalid_input', parsed.error), headers)
  const request = parsed.value as unknown as SignRequest

  if (request.zones.length === 0) {
    return withHeaders(jsonError('invalid_input', 'at least one zone is required'), headers)
  }
  if (!ALERT_LEVELS.includes(request.level as (typeof ALERT_LEVELS)[number])) {
    return withHeaders(jsonError('invalid_input', `level must be 0-4`), headers)
  }

  // Zones must actually exist: a packet naming zone Z99 would be trusted by
  // every device that receives it, and could never be matched to a map.
  const { data: zones } = await admin.from('zones').select('id').in('id', request.zones)
  const found = new Set((zones ?? []).map((z: { id: string }) => z.id))
  const missing = request.zones.filter((id) => !found.has(id))
  if (missing.length > 0) {
    return withHeaders(
      jsonError('invalid_input', `unknown zone(s): ${missing.join(', ')}`),
      headers,
    )
  }

  // --- 4. Sign --------------------------------------------------------------
  const kid = Deno.env.get('ALERT_SIGNING_KEY_ID') ?? 'k1'
  const privateJwkRaw = Deno.env.get('ALERT_SIGNING_PRIVATE_JWK')

  if (!privateJwkRaw) {
    return withHeaders(
      jsonError('internal', 'signing key is not configured on the server'),
      headers,
    )
  }

  let privateJwk: JsonWebKey
  try {
    privateJwk = JSON.parse(privateJwkRaw) as JsonWebKey
  } catch {
    return withHeaders(jsonError('internal', 'signing key secret is malformed'), headers)
  }

  const nowMin = Math.floor(Date.now() / 60_000)
  const expiresMin = nowMin + request.durationMin

  // Atomic seq allocation: two authorities issuing at the same moment must not
  // mint the same seq, or clients could reorder alerts.
  const { data: seq, error: seqError } = await admin.rpc('next_alert_seq', {
    p_hazard: request.hazard,
  })
  if (seqError || typeof seq !== 'number') {
    return withHeaders(jsonError('internal', 'could not allocate alert sequence'), headers)
  }

  let packet: string
  try {
    packet = await signPacket(privateJwk, {
      kid,
      hazard: request.hazard,
      level: request.level as (typeof ALERT_LEVELS)[number],
      zones: request.zones,
      issuedMin: nowMin,
      expiresMin,
      seq,
      mode: request.isDrill ? 'D' : 'L',
    })
  } catch (error) {
    // Never include the error object: a WebCrypto failure can quote key input.
    console.error('[sign-alert] signing failed', error instanceof Error ? error.name : 'unknown')
    return withHeaders(jsonError('internal', 'signing failed'), headers)
  }

  // --- 5. Persist -----------------------------------------------------------
  const { error: insertError } = await admin.from('alerts').insert({
    hazard: request.hazard,
    level: request.level,
    zone_ids: request.zones,
    packet,
    seq,
    is_drill: request.isDrill,
    expires_at: new Date(expiresMin * 60_000).toISOString(),
    created_by: userId,
    text_en: { note: request.note ?? '' },
  })

  if (insertError) {
    console.error('[sign-alert] insert failed', insertError.code)
    return withHeaders(jsonError('internal', 'could not store alert'), headers)
  }

  const appUrl = Deno.env.get('APP_URL') ?? ''
  return withHeaders(
    jsonOk({
      packet,
      seq,
      kid,
      mode: request.isDrill ? 'D' : 'L',
      shareUrl: appUrl ? `${appUrl.replace(/\/$/, '')}/#/a/${packet}` : `/#/a/${packet}`,
      expiresAt: new Date(expiresMin * 60_000).toISOString(),
      length: packet.length,
    }),
    headers,
  )
})

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}
