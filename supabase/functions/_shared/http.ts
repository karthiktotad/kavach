/**
 * Shared helpers for Kavach Edge Functions (Deno).
 *
 * Import paths here are RELATIVE to the repo root because the Supabase CLI
 * bundles each function directory independently — a shared folder outside the
 * function directory is not uploaded. That is why the real logic lives in
 * `shared/` at the repo root and is copied in at deploy time by
 * `scripts/sync-shared.ts` (see docs/BACKEND.md).
 */

/** Origins allowed to call the API from a browser. */
export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://*.supabase.co',
  'https://*.vercel.app',
  'https://*.pages.dev',
] as const

export interface CorsHeaders {
  readonly [key: string]: string
}

/**
 * CORS headers, echoing the caller's origin when it is allowed.
 *
 * `*` is deliberately NOT used: these endpoints take anonymous writes, so the
 * origin check is part of the abuse story, not just a browser nicety.
 */
export function corsHeaders(origin: string | null): CorsHeaders {
  const allowed =
    origin !== null && ALLOWED_ORIGINS.some((pattern) => matchesOrigin(origin, pattern))

  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-kavach-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** `*` matches one DNS label only, so `evil.vercel.app` cannot ride a `*.vercel.app` rule. */
function matchesOrigin(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')
  return new RegExp(`^${escaped}$`).test(origin)
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/**
 * One error shape for the whole API, so the client never has to guess.
 *
 * `code` is stable and machine-readable; `message` is for the developer. The
 * client maps `code` onto a localised string, so never put user-facing text in
 * `message`.
 */
export interface ApiError {
  readonly code:
    | 'bad_request'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'rate_limited'
    | 'invalid_input'
    | 'internal'
    | 'not_implemented'
  readonly message: string
  readonly details?: unknown
}

const STATUS: Record<ApiError['code'], number> = {
  bad_request: 400,
  invalid_input: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  not_implemented: 501,
  internal: 500,
}

export function jsonError(code: ApiError['code'], message: string, details?: unknown): Response {
  const body: ApiError = details === undefined ? { code, message } : { code, message, details }
  return new Response(JSON.stringify(body), {
    status: STATUS[code],
    headers: { 'Content-Type': 'application/json', ...corsHeaders(headersOrigin()) },
  })
}

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(headersOrigin()),
    },
  })
}

/** Read the Origin header for the current request. */
function headersOrigin(): string | null {
  try {
    return Deno.env.get('REQUEST_ORIGIN') ?? null
  } catch {
    return null
  }
}

/** Handle the CORS preflight. Every function calls this first. */
export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

/**
 * Read and parse a JSON body, tolerating an empty or malformed one.
 *
 * `zod` validates the shape afterwards; this only gets us to a value without
 * throwing an unhandled exception.
 */
export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text()
    if (text.length === 0) return {}
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Small schema validation
// ---------------------------------------------------------------------------

/**
 * Minimal validator — enough for these endpoints, and it keeps the dependency
 * surface at zero.
 *
 * Deno Edge Functions fetch npm packages by URL (`npm:zod@3`), which works but
 * adds a network dependency at cold start. The rules here cover everything the
 * four functions need: required strings with bounds, enums, numbers with
 * ranges, booleans and string arrays. If a payload grows a nested object,
 * swap this for zod — the call sites do not change shape.
 */
type Validator<T> = (value: unknown, path: string) => { ok: true; value: T } | { ok: false; error: string }

export const v = {
  string(opts: { min?: number; max?: number; pattern?: RegExp } = {}): Validator<string> {
    return (value, path) => {
      if (typeof value !== 'string') return { ok: false, error: `${path} must be a string` }
      if (opts.min !== undefined && value.length < opts.min) {
        return { ok: false, error: `${path} must be at least ${opts.min} characters` }
      }
      if (opts.max !== undefined && value.length > opts.max) {
        return { ok: false, error: `${path} must be at most ${opts.max} characters` }
      }
      if (opts.pattern && !opts.pattern.test(value)) {
        return { ok: false, error: `${path} has an invalid format` }
      }
      return { ok: true, value }
    }
  },

  enum<T extends string>(allowed: readonly T[]): Validator<T> {
    return (value, path) => {
      if (typeof value !== 'string' || !allowed.includes(value as T)) {
        return { ok: false, error: `${path} must be one of: ${allowed.join(', ')}` }
      }
      return { ok: true, value: value as T }
    }
  },

  number(opts: { min?: number; max?: number; int?: boolean } = {}): Validator<number> {
    return (value, path) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `${path} must be a number` }
      }
      if (opts.int && !Number.isInteger(value)) return { ok: false, error: `${path} must be an integer` }
      if (opts.min !== undefined && value < opts.min) {
        return { ok: false, error: `${path} must be >= ${opts.min}` }
      }
      if (opts.max !== undefined && value > opts.max) {
        return { ok: false, error: `${path} must be <= ${opts.max}` }
      }
      return { ok: true, value }
    }
  },

  boolean(): Validator<boolean> {
    return (value, path) =>
      typeof value === 'boolean'
        ? { ok: true, value }
        : { ok: false, error: `${path} must be a boolean` }
  },

  stringArray(opts: { max?: number; pattern?: RegExp } = {}): Validator<string[]> {
    return (value, path) => {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return { ok: false, error: `${path} must be an array of strings` }
      }
      const list = value as string[]
      if (opts.max !== undefined && list.length > opts.max) {
        return { ok: false, error: `${path} must have at most ${opts.max} items` }
      }
      if (opts.pattern && list.some((item) => !opts.pattern!.test(item))) {
        return { ok: false, error: `${path} contains an invalid value` }
      }
      return { ok: true, value: list }
    }
  },

  optional<T>(inner: Validator<T>): Validator<T | undefined> {
    return (value, path) => {
      if (value === undefined || value === null) return { ok: true, value: undefined }
      return inner(value, path)
    }
  },
}

/** Collect several field results into one typed object, or one error. */
export function parseObject<T extends Record<string, unknown>>(
  source: unknown,
  shape: { [K in keyof T]: Validator<NonNullable<T[K]>> },
): { ok: true; value: T } | { ok: false; error: string } {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return { ok: false, error: 'body must be a JSON object' }
  }
  const input = source as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const errors: string[] = []

  for (const [key, validate] of Object.entries(shape)) {
    const result = validate(input[key], key)
    if (result.ok) out[key] = result.value
    else errors.push(result.error)
  }

  return errors.length > 0
    ? { ok: false, error: errors.join('; ') }
    : { ok: true, value: out as T }
}