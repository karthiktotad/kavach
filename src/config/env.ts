/**
 * Environment access.
 *
 * Engineering rule 2: nothing here may ever hold a secret. Anything prefixed
 * with `VITE_` is inlined into the client bundle at build time. The packet
 * signing private key lives only in Supabase secrets (see .env.example).
 */

/** Read a Vite env var, returning `undefined` when unset. Never throws. */
function env(key: string): string | undefined {
  // `import.meta.env` is statically replaced by Vite, so this is tree-shaken.
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return value === undefined || value === '' ? undefined : value
}

export const envConfig = {
  /** Public base URL. Used to build SMS share links. */
  appUrl: env('VITE_APP_URL'),

  supabaseUrl: env('VITE_SUPABASE_URL'),
  supabaseAnonKey: env('VITE_SUPABASE_ANON_KEY'),

  /** Path to the preloaded offline content pack. */
  packUrl: env('VITE_PACK_URL') ?? '/pack/pack.json',

  /**
   * Optional map tile source. OPTIONAL BY DESIGN: when unset or unreachable,
   * Kavach falls back to the bundled content-pack geometry. The app must never
   * block on tiles.
   */
  mapTileUrl: env('VITE_MAP_TILE_URL'),
  mapTileAttribution: env('VITE_MAP_TILE_ATTRIBUTION'),

  /**
   * Feature flag only. The LLM is NEVER called from the browser — this merely
   * controls whether the UI offers the online assistant path. All model calls
   * happen in the Supabase Edge Function `ai-proxy`.
   */
  aiEnabled: (env('VITE_AI_ENABLED') ?? 'true') !== 'false',
} as const

/**
 * True when a real backend is configured. The app stays fully usable when this
 * is false — it runs in "local-only" mode against the bundled content pack,
 * which is what makes the offline demo reliable.
 */
export const isBackendConfigured = Boolean(envConfig.supabaseUrl && envConfig.supabaseAnonKey)

export type EnvConfig = typeof envConfig
