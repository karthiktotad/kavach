/**
 * Generates public/pack/manifest.json — the index the client downloads first.
 *
 *   node scripts/build-pack-manifest.ts
 *
 * The manifest tells the app (M3) which files make up the pack, how big each
 * one is, and a SHA-256 per file. M3 uses it to (a) download in the right order,
 * (b) verify integrity, and (c) decide whether an update is worth the data.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { PILOT_REGION } from '../src/config/region.ts'
import { PACK_VERSION, type PackManifest } from '../src/lib/packTypes.ts'
import { BUILT_AT, PACK_DIR, formatBytes, info, sha256, step, warn, writePackFile } from './_lib.ts'

/**
 * Files that are part of the *pack* and must be listed.
 * `README.md` is documentation, not data, so it is excluded.
 */
const INCLUDE = /\.(json|geojson)$/

async function listPackFiles(): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (entry.name === 'manifest.json') continue // never list itself
      if (INCLUDE.test(entry.name)) out.push(relative(PACK_DIR, full))
    }
  }

  await walk(PACK_DIR)
  return out.sort()
}

async function main(): Promise<void> {
  step('build-pack-manifest — index the content pack')

  const files = await listPackFiles()
  if (files.length === 0) {
    warn('no pack files found. Run the other build steps first.')
  }

  const entries = []
  let totalBytes = 0

  for (const path of files) {
    const full = join(PACK_DIR, path)
    const contents = await readFile(full)
    const bytes = (await stat(full)).size
    totalBytes += bytes
    entries.push({ path, bytes, sha256: sha256(contents.toString('utf8')) })
    info(
      `${path.padEnd(28)} ${formatBytes(bytes).padStart(10)}  ${entries[entries.length - 1]!.sha256.slice(0, 12)}…`,
    )
  }

  const manifest: PackManifest = {
    version: `${PACK_VERSION}+${BUILT_AT.replace(/[-:]/g, '').replace('Z', 'Z')}`,
    builtAt: BUILT_AT,
    regionId: PILOT_REGION.id,
    totalBytes,
    files: entries,
  }

  await writePackFile('manifest.json', manifest)

  info('')
  info(`pack version : ${manifest.version}`)
  info(`files        : ${entries.length}`)
  info(`total size   : ${formatBytes(totalBytes)}`)
  info(`manifest     : public/pack/manifest.json`)
}

await main()
