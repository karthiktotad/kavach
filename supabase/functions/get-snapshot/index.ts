/**
 * get-snapshot — the endpoint clients actually call.
 *
 * Never returns raw API data. It returns the *computed* snapshot, plus its age,
 * so the client can show "last updated 12 min ago" rather than pretending.
 *
 * Lazy refresh: if the snapshot is older than 10 minutes this kicks off an
 * ingestion and serves the current (stale) data immediately. That is why the
 * product does not depend on a cron job being configured — which in turn means
 * the demo works on a fresh project with nothing scheduled.
 *
 * Deliberately non-blocking: the tourist is waiting, and stale data labelled as
 * stale beats a spinner.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handleOptions, jsonError, jsonOk } from '../_shared/http.ts'

/** Older than this and we try to refresh in the background. */
const STALE_AFTER_MS = 10 * 60_000
/** Hard ceiling on the background refresh, so a hung upstream cannot pile up. */
const REFRESH_TIMEOUT_MS = 25_000

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const headers = corsHeaders(req.headers.get('origin'))

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: rows, error } = await admin
    .from('risk_snapshots')
    .select('zone_id, level, reason, inputs, sources, fresh, computed_at')

  if (error) {
    return withHeaders(jsonError('internal', 'could not read snapshot'), headers)
  }

  const zones = rows ?? []
  const oldest = zones.reduce<number>(
    (min, row) => Math.min(min, new Date(row.computed_at).getTime()),
    Number.POSITIVE_INFINITY,
  )
  const ageMs = Number.isFinite(oldest) ? Date.now() - oldest : null
  const stale = ageMs === null || ageMs > STALE_AFTER_MS

  let refreshStarted = false
  if (stale && shouldRefresh()) {
    refreshStarted = true
    // Deliberately not awaited: the caller gets data now.
    void triggerIngest(admin).catch((e) => console.error('[get-snapshot] refresh failed', e))
  }

  return withHeaders(
    jsonOk({
      zones: zones.map((row) => ({
        zoneId: row.zone_id,
        level: row.level,
        reason: row.reason,
        sources: row.sources ?? [],
        // "Every source answered" AND recent.
        complete: row.fresh && !stale,
        computedAt: row.computed_at,
      })),
      computedAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
      ageMs,
      stale,
      refreshStarted,
    }),
    headers,
  )
})

/**
 * Rate-limit the lazy refresh so a fleet of clients cannot turn every page load
 * into a burst of upstream API calls. In-memory is enough: each function
 * instance is its own island, which bounds it further.
 */
let lastRefreshAt = 0
function shouldRefresh(): boolean {
  if (Date.now() - lastRefreshAt < 60_000) return false
  lastRefreshAt = Date.now()
  return true
}

async function triggerIngest(admin: ReturnType<typeof createClient>): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-risk`
  const secret = Deno.env.get('INGEST_SECRET')
  if (!secret) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kavach-secret': secret },
      body: '{}',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
    // `admin` is accepted so the caller reads as symmetric with other handlers;
    // it is unused because ingest runs over HTTP with its own service auth.
    void admin
  }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}
