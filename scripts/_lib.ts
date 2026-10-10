/**
 * Shared helpers for the content-pack build scripts.
 *
 * Node runs these directly via native type stripping (`node scripts/x.ts`), so
 * this file may only use erasable TypeScript — no enums, no namespaces, no
 * parameter properties (enforced by `erasableSyntaxOnly` in tsconfig).
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACK_VERSION, type PackMeta } from '../src/lib/packTypes.ts'

/** Repo root, resolved from this file rather than `process.cwd()`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the pack is written, and where the browser will read it from. */
export const PACK_DIR = join(REPO_ROOT, 'public', 'pack')

/** Raw OSM responses are cached here so reruns never re-hit Overpass. */
export const OSM_CACHE_DIR = join(REPO_ROOT, '.cache', 'osm')

/** Public URL prefix the app fetches from. */
export const PACK_URL_PREFIX = '/pack'

/** Build timestamp, ISO 8601, second precision (stable across a single run). */
export const BUILT_AT = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

export function packMeta(overrides: Partial<PackMeta> = {}): PackMeta {
  return {
    packVersion: PACK_VERSION,
    builtAt: BUILT_AT,
    machineTranslated: false,
    reviewed: false,
    ...overrides,
  }
}

/**
 * JSON writer that keeps objects readable WITHOUT exploding numeric arrays.
 *
 * `JSON.stringify(value, null, 2)` puts every array element on its own line, so
 * a 15 000-edge road graph spent most of its bytes on indentation. This
 * serializer keeps arrays of primitives and arrays of tuples inline, and only
 * breaks objects across lines — which is where humans actually look.
 *
 *   {
 *     "nodes": [
 *       [0, 12.6208, 80.1945],
 *       [1, 12.6209, 80.1947]
 *     ],
 *     "regionId": "in-tn-mamallapuram"
 *   }
 */
export function stringifyJson(value: unknown, indent = 2): string {
  const pad = ' '.repeat(indent)

  const isPrimitive = (v: unknown): v is string | number | boolean | null =>
    v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

  const render = (v: unknown, depth: number): string => {
    if (isPrimitive(v)) return JSON.stringify(v)
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]'
      // Inline when every element is a primitive or a short tuple.
      const allInline = v.every(
        (item) => isPrimitive(item) || (Array.isArray(item) && item.every(isPrimitive)),
      )
      if (allInline) return `[${v.map((item) => render(item, depth + 1)).join(', ')}]`
      const inner = v.map((item) => pad.repeat(depth + 1) + render(item, depth + 1))
      return `[\n${inner.join(',\n')}\n${pad.repeat(depth)}]`
    }
    const entries = Object.entries(v as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    )
    if (entries.length === 0) return '{}'
    const inner = entries.map(
      ([key, item]) => `${pad.repeat(depth + 1)}${JSON.stringify(key)}: ${render(item, depth + 1)}`,
    )
    return `{\n${inner.join(',\n')}\n${pad.repeat(depth)}}`
  }

  return render(value, 0)
}

/** Write JSON with stable 2-space indentation and a trailing newline. */
export async function writePackFile(relPath: string, data: unknown): Promise<string> {
  const full = join(PACK_DIR, relPath)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, `${stringifyJson(data)}\n`, 'utf8')
  return full
}

export async function readPackFile<T>(relPath: string): Promise<T> {
  const full = join(PACK_DIR, relPath)
  return JSON.parse(await readFile(full, 'utf8')) as T
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Relative POSIX path used in manifest entries, e.g. `kb/en.json`. */
export function toPosix(p: string): string {
  return p.split('\\').join('/')
}

/** Human-readable byte size for console output. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

/**
 * Polite HTTP fetch with a hard timeout.
 *
 * Overpass is a free community service: one request, generous but bounded
 * timeout, and a real User-Agent so operators can identify us. We never retry
 * in a loop and never fire concurrent queries.
 */
export async function politeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 180_000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        // Overpass returns 406 without an identifying User-Agent.
        'User-Agent': 'Kavach/0.2 (hackathon prototype; contact: dev@kavach.example)',
        Accept: 'application/json',
        ...(rest.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Exit with a readable message instead of a stack trace. */
export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** Console banner so multi-step output is readable. */
export function step(title: string): void {
  console.log(`\n▸ ${title}`)
}

export function info(message: string): void {
  console.log(`  ${message}`)
}

export function warn(message: string): void {
  console.warn(`  ! ${message}`)
}
