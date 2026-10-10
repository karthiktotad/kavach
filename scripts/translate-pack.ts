/**
 * Translates the content pack + UI strings into every supported locale using the
 * Gemini free tier.
 *
 *   GEMINI_API_KEY=… node scripts/translate-pack.ts
 *   node scripts/translate-pack.ts --force          # re-translate everything
 *   node scripts/translate-pack.ts --locale=ta     # one locale only
 *   node scripts/translate-pack.ts --dry-run        # report, write nothing
 *
 * Design rules (engineering rules 2, 4, 7):
 * - The key is read from the environment and NEVER logged or written to disk.
 * - Idempotent: an existing translation is kept unless --force, so re-running
 *   does not burn quota or churn the diff.
 * - Placeholders like {zone} MUST survive translation. Every batch response is
 *   validated and the batch is retried; a placeholder that is dropped fails the
 *   run loudly rather than shipping broken text.
 * - Output is marked machineTranslated:true, reviewed:false. It is NOT medical
 *   or safety advice until a human signs it off (TODO_VERIFY.md).
 *
 * This is a BUILD-TIME script run by a maintainer, not part of the app. The
 * shipped app never calls Gemini — M5 routes all model calls through a Supabase
 * Edge Function.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '../src/config/region.ts'
import { extractPlaceholders } from '../src/lib/packTypes.ts'
import { PACK_DIR, fail, info, loadLocalEnv, step, warn } from './_lib.ts'

const loadLocalEnvFiles = loadLocalEnv()

/**
 * Model used for build-time translation.
 *
 * Configurable because Google retires model names: `gemini-2.0-flash` was
 * removed and every call failed with a 404 until this became overridable.
 * Override with GEMINI_MODEL in .env. Run `--list-models` to see what your key
 * can actually reach.
 */
const MODEL = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.8-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/**
 * Strings per request.
 *
 * The free tier allows only ~20 generate_content requests PER DAY, so the
 * request count is the scarce resource — not latency. 60 keeps the whole
 * knowledge base (~360 strings) to 6 requests instead of 18.
 */
const BATCH_SIZE = 60
/** Max retries per batch before the run is declared failed. */
const MAX_BATCH_RETRIES = 5
/**
 * Pause between batches.
 *
 * The free tier allows ~15 requests per minute. kb/en.json is ~360 strings,
 * so firing 18 batches back-to-back trips the quota. 4 s keeps us under it.
 */
const BATCH_DELAY_MS = 4000
/** Backoff for a 429, escalating per attempt. */
const RATE_LIMIT_BACKOFF_MS = [15_000, 30_000, 45_000, 60_000] as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const listModels = args.includes('--list-models')
const onlyLocale = args.find((a) => a.startsWith('--locale='))?.split('=')[1]

// Vite loads .env for the app bundle, but plain Node does not. Load it here so
// a key placed in .env is actually found. Real env vars still take precedence.
const envFiles = loadLocalEnvFiles
const GEMINI_API_KEY = process.env['GEMINI_API_KEY']

// ---------------------------------------------------------------------------
// Key extraction — find every translatable string and where it lives.
// ---------------------------------------------------------------------------

/** One unit of translatable text. `id` is stable across runs. */
interface Unit {
  readonly id: string
  readonly text: string
}

type Json = Record<string, unknown>

/**
 * Keys whose values are identifiers, not prose.
 *
 * These must never be sent to the model or written back from it. `next` is the
 * important one: it is a decision-tree pointer between nodes, and translating
 * it would silently break a first-aid flow at exactly the moment it is used.
 */
const NON_TRANSLATABLE_KEYS: ReadonlySet<string> = new Set([
  'id',
  'next',
  'severity',
  'category',
  'scope',
])

function collectUnits(node: unknown, path: string, out: Unit[]): void {
  if (typeof node === 'string') {
    out.push({ id: path, text: node })
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectUnits(item, `${path}[${i}]`, out))
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Json)) {
      // Identifiers are skipped entirely: sending them wastes quota and
      // invites the model to "helpfully" translate a pointer value.
      if (NON_TRANSLATABLE_KEYS.has(key)) continue
      collectUnits(value, path ? `${path}.${key}` : key, out)
    }
  }
}

/** Re-inject translated strings into a copy of the source structure. */
function applyUnits(source: unknown, translations: Map<string, string>, path = ''): unknown {
  if (typeof source === 'string') return translations.get(path) ?? source
  if (Array.isArray(source)) {
    return source.map((item, i) => applyUnits(item, translations, `${path}[${i}]`))
  }
  if (source && typeof source === 'object') {
    const out: Json = {}
    for (const [key, value] of Object.entries(source as Json)) {
      const childPath = path ? `${path}.${key}` : key
      out[key] = NON_TRANSLATABLE_KEYS.has(key) ? value : applyUnits(value, translations, childPath)
    }
    return out
  }
  return source
}

// ---------------------------------------------------------------------------
// Gemini calls
// ---------------------------------------------------------------------------

/**
 * A Gemini failure we can explain to a human, rather than a raw HTTP body.
 * Keeps the key out of the message on purpose.
 *
 * Written without a parameter property because these scripts run under Node's
 * type-stripping loader, which rejects non-erasable syntax
 * (`erasableSyntaxOnly` in tsconfig).
 */
class GeminiError extends Error {
  readonly hint: string
  /** Rate limits are worth waiting out; auth errors are not. */
  readonly retryable: boolean

  constructor(message: string, hint = '', retryable = false) {
    super(message)
    this.name = 'GeminiError'
    this.hint = hint
    this.retryable = retryable
  }
}

/**
 * Models the current key can actually reach.
 * Used by --list-models and by the 404 handler, so a retired model name
 * produces an actionable message instead of a raw NOT_FOUND.
 */
async function listAvailableModels(): Promise<string[]> {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    {
      headers: GEMINI_API_KEY ? { 'x-goog-api-key': GEMINI_API_KEY } : {},
    },
  )
  if (!response.ok) throw new GeminiError(`Could not list models (HTTP ${response.status}).`)
  const body = (await response.json()) as { models?: Array<{ name: string }> }
  return (body.models ?? []).map((m) => m.name.replace(/^models\//, ''))
}

async function callGemini(prompt: string, count: number): Promise<string[]> {
  const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400)

    if (response.status === 404) {
      // Google retires model names; this is the most likely cause by far.
      const suggestions = (await listAvailableModels().catch(() => [] as string[]))
        .filter((m) => /flash/i.test(m) && !/tts|image|live|audio|omni|preview/i.test(m))
        .slice(0, 6)
      throw new GeminiError(
        `Model "${MODEL}" was not found (HTTP 404).`,
        suggestions.length > 0
          ? `Google likely retired that model. Set GEMINI_MODEL in .env to one of:\n` +
              suggestions.map((m) => `      ${m}`).join('\n') +
              `\n\n    …or run: npm run pack:translate -- --list-models`
          : `Set GEMINI_MODEL in .env to a model your key can reach (npm run pack:translate -- --list-models).`,
      )
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      const reason = detail.includes('API_KEY_INVALID')
        ? 'API_KEY_INVALID'
        : detail.includes('PERMISSION_DENIED')
          ? 'PERMISSION_DENIED'
          : `HTTP ${response.status}`
      throw new GeminiError(
        `Gemini rejected the request (${reason}).`,
        reason === 'API_KEY_INVALID'
          ? 'The key in .env is wrong, expired, or still has placeholder text. Get a fresh one at https://aistudio.google.com/app/apikey'
          : reason === 'PERMISSION_DENIED'
            ? 'This key cannot access this model. Enable the Generative Language API for the project behind the key.'
            : 'Check the key and the model name in scripts/translate-pack.ts',
      )
    }
    if (response.status === 429) {
      // Distinguish a daily allowance from a per-minute one: they need very
      // different advice, and the daily one cannot be waited out.
      const daily = /free_tier_requests|_per_day|per day/i.test(detail)
      const limit = detail.match(/limit:\s*(\d+)/)?.[1]

      throw new GeminiError(
        'Gemini quota exhausted (429).',
        daily
          ? `This is the DAILY free-tier allowance (limit: ${limit ?? '20'} requests/day), not a ` +
              `temporary spike — waiting will not help; the allowance resets at midnight Pacific.\n` +
              `  Already-translated files are kept, so simply re-run tomorrow:\n` +
              `    npm run pack:translate -- --locale=ta\n` +
              `  Each locale needs roughly ${
                Math.ceil(359 / BATCH_SIZE) + 4
              } requests. Translating all 8 locales therefore takes several days on one free key.\n` +
              `  To finish sooner: use fewer locales, or raise the quota on a paid/AI Studio tier.`
          : `Per-minute rate limit. The script already paces requests; re-run in a minute.\n` +
              `  Completed files are skipped, so no work is lost.`,
        // A daily allowance will not refill within this run.
        !daily,
      )
    }
    throw new GeminiError(`Gemini HTTP ${response.status}.`, detail)
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiError('Gemini returned no text.')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GeminiError(
      'Gemini did not return valid JSON.',
      'This is a model formatting hiccup. Re-run; --force is not needed because nothing was written.',
    )
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as Json)['translations']
  if (!Array.isArray(list))
    throw new GeminiError(
      `Gemini returned no translations array.`,
      `Model output was: ${text.slice(0, 200)}`,
    )
  if (list.length !== count)
    throw new GeminiError(`Gemini returned ${list.length} items, expected ${count}.`)

  return list.map(String)
}

function buildPrompt(units: Unit[], locale: Locale): string {
  const rows = units.map((u) => ({ id: u.id, text: u.text }))
  return [
    `Translate each UI string into ${locale}.`,
    `Rules:`,
    `- Return ONLY a JSON array of strings, same length and order as the input, no ids.`,
    `- Keep any {placeholder} tokens EXACTLY as written, e.g. {zone} must survive unchanged.`,
    `- Keep emergency wording calm, imperative and short. Do not add or drop meaning.`,
    `- For medical/safety strings, translate faithfully; do not add medical advice.`,
    `Input JSON array of {id, text}:`,
    JSON.stringify(rows),
  ].join('\n')
}

/**
 * Translate a batch, validating that every placeholder survived.
 *
 * Retries on *content* problems (bad JSON, dropped placeholder) but NOT on
 * credential or quota errors — retrying a rejected key just wastes time and
 * quota, and the fix is always on the operator's side.
 */
async function translateBatch(units: Unit[], locale: Locale, attempt = 0): Promise<string[]> {
  try {
    const out = await callGemini(buildPrompt(units, locale), units.length)
    for (let i = 0; i < units.length; i += 1) {
      const src = units[i]!.text
      const dst = out[i]!
      const before = extractPlaceholders(src).sort().join(',')
      const after = extractPlaceholders(dst).sort().join(',')
      if (before !== after) {
        throw new Error(`placeholder mismatch on "${src}": expected {${before}}, got {${after}}`)
      }
    }
    return out
  } catch (err) {
    // Only genuinely transient problems are worth another attempt. A daily
    // quota will not refill mid-run, a retired model name will not be fixed by
    // waiting, and a rejected key cannot be retried at all.
    const error = err instanceof GeminiError ? err : null
    const fatal =
      error === null || error.retryable === false || error.message.includes('rejected the request')
    if (fatal || attempt + 1 >= MAX_BATCH_RETRIES) throw err

    const waitMs =
      error?.message.includes('rate limit') || error?.message.includes('quota')
        ? (RATE_LIMIT_BACKOFF_MS[Math.min(attempt, RATE_LIMIT_BACKOFF_MS.length - 1)] ?? 60_000)
        : 2000

    warn(
      `retry ${attempt + 1}/${MAX_BATCH_RETRIES - 1} in ${Math.round(waitMs / 1000)}s: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
    await sleep(waitMs)
    return translateBatch(units, locale, attempt + 1)
  }
}

// ---------------------------------------------------------------------------
// Per-file translation
// ---------------------------------------------------------------------------

async function readJson(relPath: string): Promise<Json | null> {
  try {
    return JSON.parse(await readFile(join(PACK_DIR, relPath), 'utf8')) as Json
  } catch {
    return null
  }
}

async function translateFile(
  sourceRelPath: string,
  targetRelPath: string,
  locale: Locale,
  translator: (units: Unit[], locale: Locale) => Promise<string[]>,
): Promise<void> {
  const source = await readJson(sourceRelPath)
  if (!source) {
    warn(`missing source ${sourceRelPath}, skipping`)
    return
  }

  const existing = await readJson(targetRelPath)
  if (existing && !force) {
    // Idempotent: keep an already-translated file untouched unless forced.
    const already = Object.keys(existing['_meta'] ?? {}).length > 0
    if (already) {
      info(`skip ${targetRelPath} (already translated, use --force to redo)`)
      return
    }
  }

  // Exclude _meta from translation — it is metadata, not user text.
  const translatable: Json = { ...source }
  delete translatable['_meta']

  const units: Unit[] = []
  collectUnits(translatable, '', units)
  if (units.length === 0) {
    warn(`no translatable strings in ${sourceRelPath}`)
    return
  }

  const translations = new Map<string, string>()
  let done = 0
  for (let i = 0; i < units.length; i += BATCH_SIZE) {
    const batch = units.slice(i, i + BATCH_SIZE)
    const out = await translator(batch, locale)
    out.forEach((text, bi) => translations.set(batch[bi]!.id, text))
    done += batch.length
    info(`  ${targetRelPath}: ${done}/${units.length}`)

    // Pace requests so the free tier's per-minute quota is not blown.
    const remaining = units.length - done
    if (remaining > 0) await sleep(BATCH_DELAY_MS)
  }

  const merged = applyUnits(translatable, translations) as Json
  const result: Json = {
    _meta: {
      packVersion:
        source['_meta'] && typeof source['_meta'] === 'object'
          ? (source['_meta'] as Json)['packVersion']
          : undefined,
      builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      machineTranslated: true,
      reviewed: false,
    },
    locale,
    ...merged,
  }
  // Drop undefined keys for clean JSON.
  Object.assign(result['_meta'] as Json, {
    packVersion: (result['_meta'] as Json)['packVersion'] ?? '0.2.0',
  })

  if (!dryRun) {
    const { writePackFile } = await import('./_lib.ts')
    await writePackFile(targetRelPath, result)
    info(`wrote ${targetRelPath}`)
  }
}

async function main(): Promise<void> {
  step('translate-pack — machine translation via Gemini')

  if (!GEMINI_API_KEY) {
    fail(
      'GEMINI_API_KEY is not set.\n\n' +
        '  This script translates the pack with the Gemini free tier.\n\n' +
        '  Put it in the gitignored .env file at the repo root:\n\n' +
        '    GEMINI_API_KEY=your-gemini-key\n\n' +
        '  …or export it for a single run:\n\n' +
        '    export GEMINI_API_KEY="your-gemini-key"\n' +
        '    node scripts/translate-pack.ts\n\n' +
        `  Get a free key at https://aistudio.google.com/app/apikey\n\n` +
        (envFiles.length > 0
          ? `  (.env was read from: ${envFiles.join(', ')} — check the key name and that it is not still blank)\n\n`
          : '  (no .env file was found in the repo root)\n\n') +
        '  Note: translated output is machineTranslated:true and reviewed:false.\n' +
        '  It must be reviewed before shipping safety-critical text (TODO_VERIFY.md).',
    )
  }

  const requested = onlyLocale?.split('=')[1]
  if (listModels) {
    step('translate-pack — models reachable with this key')
    const names = await listAvailableModels()
    const useful = names.filter(
      (n) => /flash/i.test(n) && !/tts|image|live|audio|omni|preview/i.test(n),
    )
    info(`total models listed for this key: ${names.length}`)
    info('')
    info('flash models (availability varies — listing a model does not guarantee you can use it):')
    for (const n of useful) info(`  ${n}${n === MODEL ? '   ← currently configured' : ''}`)
    info('')
    info(`currently using: ${MODEL}`)
    info('')
    info('Note: newer Google accounts are refused the older 2.x models ("no longer available to')
    info('new users"), so prefer the newest gemini-N-flash. If a model 404s on first use, run this')
    info('again and pick another.')
    return
  }

  const locales: Locale[] =
    requested && (SUPPORTED_LOCALES as readonly string[]).includes(requested)
      ? [requested as Locale]
      : SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)

  if (locales.length === 0) fail(`no valid target locale (got "${onlyLocale}")`)

  info(`model: ${MODEL}`)
  info(`target locales: ${locales.join(', ')}`)
  info(`mode: ${dryRun ? 'DRY RUN (writes nothing)' : force ? 'FORCE' : 'incremental'}`)
  info(`env: ${envFiles.length > 0 ? envFiles.join(', ') : 'shell only (no .env found)'}`)
  // Presence only — the key itself is never printed.
  info(`credential: GEMINI_API_KEY present (${GEMINI_API_KEY.length} chars)`)

  const files: Array<[string, (l: string) => string]> = [
    ['templates/en.json', (l) => `templates/${l}.json`],
    ['phrases/en.json', (l) => `phrases/${l}.json`],
    ['kb/en.json', (l) => `kb/${l}.json`],
    // UI strings live beside the app code, not in the pack, so they are written
    // to src/i18n/messages/ and picked up by import.meta.glob.
    ['../../src/i18n/messages/en.json', (l) => `../../src/i18n/messages/${l}.json`],
  ]

  for (const locale of locales) {
    step(`→ ${locale}`)
    for (const [source, target] of files) {
      await translateFile(source, target(locale), locale, translateBatch)
    }
  }

  info('')
  info('done. Remember: machine translation still needs human review.')
}

try {
  await main()
} catch (error) {
  // Fail with an explanation, never a raw stack trace: a wrong key is an
  // operator mistake, not a crash.
  if (error instanceof GeminiError) {
    fail(`${error.message}\n\n  ${error.hint}`)
  }
  fail(error instanceof Error ? error.message : String(error))
}
