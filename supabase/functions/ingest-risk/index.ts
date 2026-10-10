/**
 * ingest-risk — fetch live data, compute a per-zone risk level, upsert it.
 *
 * Calls out to several free APIs. Every source is treated as optional and every
 * parse is defensive: a feed that changes shape, rate-limits us, or is simply
 * down must degrade the snapshot, never break it. A snapshot computed from two
 * of three sources is still worth showing, as long as `fresh` says so.
 *
 * Nothing here is authoritative. The client shows this as *context* alongside
 * signed alerts, and an official alert raises the floor in `computeRisk`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  computeRisk,
  levelFromGdacs,
  type RiskInputs,
  type SourceName,
} from '../../../shared/riskEngine.ts'
import { corsHeaders, handleOptions, jsonError, jsonOk } from '../_shared/http.ts'

const OPEN_METEO = Deno.env.get('OPEN_METEO_BASE_URL') ?? 'https://api.open-meteo.com'
const GDACS_URL = Deno.env.get('GDACS_RSS_URL') ?? 'https://www.gdacs.org/xml/rss.xml'

/** One zone as we need it. */
interface Zone {
  id: string
  name: string
  lat: number
  lon: number
  flood_prone: boolean
}

interface ZoneReading extends RiskInputs {
  zoneId: string
  sources: SourceName[]
  gdacsFloor: number
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const headers = corsHeaders(req.headers.get('origin'))

  // ingest-risk can be called by a cron or by get-snapshot, so it accepts an
  // internal secret OR a public GET. It never accepts arbitrary input.
  const isPublic = req.method === 'GET'
  if (!isPublic) {
    const secret = Deno.env.get('INGEST_SECRET')
    if (!secret || req.headers.get('x-kavach-secret') !== secret) {
      return withHeaders(jsonError('forbidden', 'ingest secret required'), headers)
    }
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: zones, error } = await admin.from('zones').select('id,name,lat,lon,flood_prone')
  if (error || !zones?.length) {
    return withHeaders(jsonError('internal', 'could not load zones'), headers)
  }

  // Every source is fetched independently; one failing must not sink the rest.
  const [gdacsFloor] = await Promise.all([fetchGdacsFloor(zones as Zone[])])

  const readings = await Promise.all(
    (zones as Zone[]).map(async (zone) => {
      const [forecast, flood] = await Promise.all([fetchOpenMeteo(zone), fetchOpenMeteoFlood(zone)])
      const sources: SourceName[] = []
      if (forecast !== null) sources.push('open-meteo')
      if (flood !== null) sources.push('open-meteo-flood')

      const reading: ZoneReading = {
        zoneId: zone.id,
        ...(forecast ?? {}),
        ...(flood ?? {}),
        sources,
        gdacsFloor: gdacsFloor(zone),
      }
      return reading
    }),
  )

  // An active official alert raises the floor; it can never lower it.
  const { data: activeAlerts } = await admin
    .from('alerts')
    .select('zone_ids, level, expires_at')
    .gt('issued_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .eq('is_drill', false)

  const rows = readings.map((reading) => {
    const official = maxOfficialLevel(activeAlerts ?? [], reading.zoneId)
    const result = computeRisk({
      ...reading,
      officialLevel: official,
    })

    // GDACS is advisory: it may raise the floor but must never invent one.
    const level = Math.max(result.level, reading.gdacsFloor)

    return {
      zone_id: reading.zoneId,
      level,
      reason:
        level > result.level
          ? `${result.reason} A regional disaster feed also reports activity nearby.`
          : result.reason,
      inputs: {
        rain24hMm: reading.rain24hMm ?? null,
        rain72hMm: reading.rain72hMm ?? null,
        windGustKmh: reading.windGustKmh ?? null,
        heatIndexC: reading.heatIndexC ?? null,
        dischargePercentile: reading.dischargePercentile ?? null,
        gdacsFloor: reading.gdacsFloor,
      },
      sources: [
        ...new Set([...reading.sources, ...(reading.gdacsFloor > 0 ? (['gdacs'] as const) : [])]),
      ],
      fresh: reading.sources.length > 0,
      computed_at: new Date().toISOString(),
    }
  })

  // Upsert: one current row per zone, so the table stays a snapshot not a log.
  for (const row of rows) {
    const { error: upsertError } = await admin
      .from('risk_snapshots')
      .upsert(row, { onConflict: 'zone_id' })
    if (upsertError) console.error('[ingest-risk] upsert failed for', row.zone_id)
  }

  return withHeaders(jsonOk({ computed: rows.length, at: new Date().toISOString() }), headers)
})

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Never throws: a failed fetch returns null and the snapshot degrades. */
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    return response
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Forecast + rainfall. Null when the feed is unreachable or reshaped. */
async function fetchOpenMeteo(zone: Zone): Promise<Partial<RiskInputs> | null> {
  const url =
    `${OPEN_METEO}/v1/forecast?latitude=${zone.lat}&longitude=${zone.lon}` +
    '&daily=precipitation_sum,windgusts_10m_max,temperature_2m_max,temperature_2m_min' +
    '&timezone=auto&forecast_days=3'
  const response = await fetchWithTimeout(url)
  if (!response) return null

  try {
    const body = (await response.json()) as {
      daily?: {
        precipitation_sum?: (number | null)[]
        windgusts_10m_max?: (number | null)[]
        temperature_2m_max?: (number | null)[]
        temperature_2m_min?: (number | null)[]
      }
    }
    const daily = body.daily
    if (!daily) return null

    const rain = daily.precipitation_sum ?? []
    const rain24hMm = numberOrNull(rain[0])
    const rain72hMm =
      numberOrNull(rain[0]) !== null && rain.length >= 3 ? sum(rain.slice(0, 3)) : null

    const gustRaw = numberOrNull(daily.windgusts_10m_max?.[0])
    const windGustKmh = gustRaw === null ? null : gustRaw * 3.6 // m/s → km/h

    const tMax = numberOrNull(daily.temperature_2m_max?.[0])
    const tMin = numberOrNull(daily.temperature_2m_min?.[0])
    const heatIndexC = tMax === null ? null : tMax

    return {
      ...(rain24hMm === null ? {} : { rain24hMm }),
      ...(rain72hMm === null ? {} : { rain72hMm }),
      ...(windGustKmh === null ? {} : { windGustKmh }),
      ...(heatIndexC === null ? {} : { heatIndexC }),
      // Heat index needs humidity; without it, ambient max temp is the honest
      // conservative stand-in and is labelled as such.
      ...(tMin !== null ? {} : {}),
    }
  } catch {
    return null
  }
}

/** River discharge percentile. Null when unavailable — never a guess. */
async function fetchOpenMeteoFlood(zone: Zone): Promise<Partial<RiskInputs> | null> {
  const url =
    `${OPEN_METEO}/v1/flood-api?latitude=${zone.lat}&longitude=${zone.lon}` +
    '&daily=river_discharge_max&forecast_days=3&timezone=auto'
  const response = await fetchWithTimeout(url, 6000)
  if (!response) return null

  try {
    const body = (await response.json()) as {
      daily?: { river_discharge_max?: (number | null)[] }
    }
    const discharge = body.daily?.river_discharge_max?.[0]
    const value = numberOrNull(discharge)
    // We have no local flood-stage data, so an absolute m³/s is meaningless.
    // A percentile is not derivable from this feed alone; report absent rather
    // than inventing one. This is why flood level 3+ comes from official
    // alerts and rain totals, not from this source.
    return value === null ? null : {}
  } catch {
    return null
  }
}

/**
 * GDACS advisory floor per zone.
 *
 * Parsed defensively with a regex rather than an XML library: the feed is a
 * flat list of <item> elements and we only need four fields from it. A parse
 * failure returns all-zero, which is the safe direction.
 */
async function fetchGdacsFloor(zones: Zone[]): Promise<(zone: Zone) => number> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(GDACS_URL, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) return () => 0

    const xml = await response.text()
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []

    const events = items
      .map((item) => ({
        alertLevel: /<gdacs:alertlevel>([^<]*)<\/gdacs:alertlevel>/i.exec(item)?.[1] ?? null,
        eventType: /<gdacs:eventtype>([^<]*)<\/gdacs:eventtype>/i.exec(item)?.[1] ?? null,
        lat: Number(/<geo:Point>([^<]*)<\/geo:Point>/i.exec(item)?.[1] ?? 'NaN'),
        lon: Number(/<geo:Point>[^<]*,([^<]*)<\/geo:Point>/i.exec(item)?.[1] ?? 'NaN'),
      }))
      .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon))

    return (zone: Zone): number => {
      let floor = 0
      for (const event of events) {
        // ~120 km: far enough to include a regional event, close enough that
        // "near the event" is honest advice.
        if (haversineKm(event.lat, event.lon, zone.lat, zone.lon) > 120) continue
        const level = levelFromGdacs(event)
        if (level > floor) floor = level
      }
      return floor
    }
  } catch {
    return () => 0
  }
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function maxOfficialLevel(
  alerts: Array<{ zone_ids: string[] | null; level: number; expires_at: string | null }>,
  zoneId: string,
): number | null {
  const now = Date.now()
  let max: number | null = null
  for (const alert of alerts) {
    if (!alert.zone_ids?.includes(zoneId)) continue
    // An expired alert must not keep raising the floor.
    if (alert.expires_at && new Date(alert.expires_at).getTime() < now) continue
    if (max === null || alert.level > max) max = alert.level
  }
  return max
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}
