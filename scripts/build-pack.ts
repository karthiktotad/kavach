/**
 * Runs the content-pack build in order.
 *
 *   npm run pack:build                 # fetch from Overpass (uses cache)
 *   npm run pack:build -- --offline    # sample data only, no network
 *   npm run pack:build -- --refresh    # ignore cache, re-query Overpass
 *   npm run pack:build -- --manifest-only   # just re-index existing files
 *
 * `npm run pack:build -- --offline` is the escape hatch that keeps the
 * hackathon unblocked when Overpass is down: it writes clearly-marked sample
 * files instead of real data, and the UI refuses to present samples as real.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT, fail, info, step } from './_lib.ts'

const STEPS = [
  { title: 'places', script: 'fetch-osm.ts' },
  { title: 'roads', script: 'build-road-graph.ts' },
  { title: 'manifest', script: 'build-pack-manifest.ts' },
] as const

const args = process.argv.slice(2)
const manifestOnly = args.includes('--manifest-only')

function run(script: string, extra: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts', script), ...extra], {
      stdio: 'inherit',
      cwd: REPO_ROOT,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} exited with code ${code}`))
    })
  })
}

async function main(): Promise<void> {
  step('build-pack — content pack pipeline')

  const passthrough = args.filter((a) => a === '--offline' || a === '--refresh')

  if (manifestOnly) {
    info('--manifest-only: re-indexing existing files, skipping fetch')
    await run('build-pack-manifest.ts', [])
    return
  }

  if (passthrough.length > 0) info(`passing through: ${passthrough.join(' ')}`)

  for (const { title, script } of STEPS) {
    await run(script, passthrough)
    info(`✓ ${title}`)
  }

  info('')
  info('pack build complete — see public/pack/manifest.json for the file index')
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
