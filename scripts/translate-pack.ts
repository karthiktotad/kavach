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
import { PACK_DIR, fail, info, step, warn } from './_lib.ts'

const MODEL = 'gemini-2.0-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Strings per request. Large enough to be efficient, small enough to retry. */
const BATCH_SIZE = 20
/** Max retries per batch before the run is declared failed. */
const MAX_BATCH_RETRIES = 3

const args = process.argv.slice(2)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const onlyLocale = args.find((a) => a.startsWith('--locale='))?.split('=')[1]

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
      out[key] = key === 'id' ? value : applyUnits(value, translations, childPath)
    }
    return out
  }
  return source
}

// ---------------------------------------------------------------------------
// Gemini calls
// ---------------------------------------------------------------------------

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
    throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no text')

  const parsed = JSON.parse(text) as unknown
  const list = Array.isArray(parsed) ? parsed : (parsed as Json)['translations']
  if (!Array.isArray(list))
    throw new Error(`Gemini returned no translations array (got ${text.slice(0, 200)})`)
  if (list.length !== count)
    throw new Error(`Gemini returned ${list.length} items, expected ${count}`)

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
 * Retries once on a placeholder mismatch with a stricter reminder.
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
  } catch (error) {
    if (attempt + 1 >= MAX_BATCH_RETRIES) throw error
    warn(`batch retry ${attempt + 1}: ${String(error)}`)
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
        '  This script translates the pack with the Gemini free tier.\n' +
        '  Set the key in your shell (it is never stored in the repo):\n\n' +
        '    export GEMINI_API_KEY="your-gemini-key"\n' +
        '    node scripts/translate-pack.ts\n\n' +
        '  Get a free key at https://aistudio.google.com/app/apikey\n\n' +
        '  Note: translated output is machineTranslated:true and reviewed:false.\n' +
        '  It must be reviewed before shipping safety-critical text (TODO_VERIFY.md).',
    )
  }

  const requested = onlyLocale?.split('=')[1]
  const locales: Locale[] =
    requested && (SUPPORTED_LOCALES as readonly string[]).includes(requested)
      ? [requested as Locale]
      : SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)

  if (locales.length === 0) fail(`no valid target locale (got "${onlyLocale}")`)

  info(`model: ${MODEL}`)
  info(`target locales: ${locales.join(', ')}`)
  info(`mode: ${dryRun ? 'DRY RUN (writes nothing)' : force ? 'FORCE' : 'incremental'}`)
  info('key is read from GEMINI_API_KEY and never printed')

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

await main()
