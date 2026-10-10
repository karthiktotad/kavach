import { describe, expect, it } from 'vitest'
import { extractPlaceholders } from '../src/lib/packTypes'

/**
 * Guards on machine-translated pack files.
 *
 * The translator sends strings to Gemini and writes the response back. Two
 * failure modes matter for safety:
 *
 *  1. A placeholder (`{zone}`) lost in translation → the alert renders with a
 *     literal `{zone}` in the user's language.
 *  2. A *structural* value overwritten by the model — a decision-tree `next`
 *     pointer translated into Tamil — which silently breaks a first-aid flow.
 *
 * These run against any `<locale>.json` files that exist, so they are a no-op
 * until `npm run pack:translate` has been run, then they check every locale.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PACK_DIR = join(process.cwd(), 'public', 'pack')

type Json = Record<string, unknown>

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function localesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(join(PACK_DIR, dir)))
      .filter((f) => f.endsWith('.json') && f !== 'en.json')
      .map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}

/** Walk every string in a structure, yielding its path and value. */
function walkStrings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]]
  if (Array.isArray(node)) return node.flatMap((item, i) => walkStrings(item, `${path}[${i}]`))
  if (node && typeof node === 'object') {
    return Object.entries(node as Json).flatMap(([key, value]) =>
      walkStrings(value, path ? `${path}.${key}` : key),
    )
  }
  return []
}

describe('translated pack files', () => {
  it('preserves every placeholder the English source uses', async () => {
    for (const dir of ['templates', 'phrases', 'kb']) {
      const source = await readJson<Json>(join(PACK_DIR, dir, 'en.json'))
      if (!source) continue

      for (const locale of await localesIn(dir)) {
        const translated = await readJson<Json>(join(PACK_DIR, dir, `${locale}.json`))
        if (!translated) continue

        const sourcePaths = walkStrings(source)
        const translatedByPath = new Map(walkStrings(translated))

        for (const [path, value] of sourcePaths) {
          const expected = extractPlaceholders(value)
          if (expected.length === 0) continue

          const got = translatedByPath.get(path)
          expect(got, `${dir}/${locale}.json lost the path ${path}`).toBeDefined()
          // Compare as a set: word order may legitimately change, but a
          // placeholder must never be dropped or invented.
          expect(
            [...extractPlaceholders(got as string)].sort(),
            `${dir}/${locale}.json @ ${path} lost a placeholder (${value} -> ${got})`,
          ).toEqual([...expected].sort())
        }
      }
    }
  })

  it('never overwrites structural ids such as decision-tree pointers', async () => {
    for (const locale of await localesIn('kb')) {
      const source = await readJson<Json>(join(PACK_DIR, 'kb', 'en.json'))
      const translated = await readJson<Json>(join(PACK_DIR, 'kb', `${locale}.json`))
      if (!source || !translated) continue

      // A `next` value must still point at a real node id in the same file.
      const ids = new Set((translated['trees'] as Array<{ id: string }>).map((t) => t.id))
      for (const tree of translated['trees'] as Array<{
        id: string
        options: Array<{ next: string | null }>
      }>) {
        for (const option of tree.options) {
          if (option.next === null) continue
          expect(
            ids.has(option.next),
            `kb/${locale}.json: tree "${tree.id}" points at missing node "${option.next}"`,
          ).toBe(true)
        }
      }

      // Chunk ids must be preserved too — MiniSearch and the UI key off them.
      expect((translated['chunks'] as Array<{ id: string }>).map((c) => c.id)).toEqual(
        (source['chunks'] as Array<{ id: string }>).map((c) => c.id),
      )
    }
  })

  it('keeps the same number of items as the English source', async () => {
    for (const dir of ['templates', 'phrases', 'kb']) {
      const source = await readJson<Json>(join(PACK_DIR, dir, 'en.json'))
      if (!source) continue

      for (const locale of await localesIn(dir)) {
        const translated = await readJson<Json>(join(PACK_DIR, dir, `${locale}.json`))
        if (!translated) continue

        for (const key of ['chunks', 'trees', 'templates', 'phrases', 'categories']) {
          const a = source[key]
          const b = translated[key]
          if (!Array.isArray(a) || !Array.isArray(b)) continue
          expect(b.length, `${dir}/${locale}.json has a different number of ${key}`).toBe(a.length)
        }
      }
    }
  })

  it('marks every translated file as machine-translated and unreviewed', async () => {
    for (const dir of ['templates', 'phrases', 'kb']) {
      for (const locale of await localesIn(dir)) {
        const translated = await readJson<Json>(join(PACK_DIR, dir, `${locale}.json`))
        const meta = translated?.['_meta'] as Json | undefined
        expect(meta, `${dir}/${locale}.json is missing _meta`).toBeTruthy()
        expect(meta?.['machineTranslated'], `${dir}/${locale}.json must be flagged`).toBe(true)
        expect(meta?.['reviewed'], `${dir}/${locale}.json must be marked unreviewed`).toBe(false)
      }
    }
  })

  it('actually translated something (guards against a silent English copy)', async () => {
    const locales = await localesIn('templates')
    if (locales.length === 0) return // nothing translated yet
    for (const locale of locales) {
      const translated = await readJson<Json>(join(PACK_DIR, 'templates', `${locale}.json`))
      const source = await readJson<Json>(join(PACK_DIR, 'templates', 'en.json'))
      const a = new Set(walkStrings(source).map(([, v]) => v))
      const b = walkStrings(translated).map(([, v]) => v)
      const unchanged = b.filter((v) => a.has(v)).length
      // Latin-script locales will still share many tokens; just require that
      // something changed rather than every string being copied verbatim.
      expect(unchanged, `templates/${locale}.json looks like an untranslated copy`).toBeLessThan(
        b.length,
      )
    }
  })
})