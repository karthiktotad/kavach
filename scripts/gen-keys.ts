/**
 * ECDSA P-256 Authority Keypair Generator.
 *
 * Generates an ECDSA P-256 keypair using standard WebCrypto:
 *  - Writes the PUBLIC key JWK to src/config/authorityKeys.json
 *  - Prints the PRIVATE key JWK to stdout only (never saved to repo)
 *
 * Usage:
 *   node scripts/gen-keys.ts [--kid k1]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function generateKeypair(kid = 'k1'): Promise<void> {
  const crypto = globalThis.crypto
  if (!crypto || !crypto.subtle) {
    throw new Error('WebCrypto subtle is required')
  }

  console.log(`[gen-keys] Generating ECDSA P-256 keypair for kid="${kid}"...`)

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify'],
  )

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  // Attach kid metadata
  ;(publicJwk as Record<string, unknown>).kid = kid
  ;(privateJwk as Record<string, unknown>).kid = kid

  // 1. Read or initialize public key registry
  const keysPath = join(process.cwd(), 'src', 'config', 'authorityKeys.json')
  let registry: Record<string, JsonWebKey>
  try {
    const raw = await readFile(keysPath, 'utf8')
    registry = JSON.parse(raw) as Record<string, JsonWebKey>
  } catch {
    registry = {}
  }

  registry[kid] = publicJwk
  await writeFile(keysPath, JSON.stringify(registry, null, 2) + '\n', 'utf8')
  console.log(`[gen-keys] ✓ Public key written to src/config/authorityKeys.json`)

  // 2. Output private key JWK with instructions
  console.log('\n======================= AUTHORITY PRIVATE KEY =======================')
  console.log('CRITICAL: Do NOT commit this key or paste it into client code.')
  console.log('Save this in Supabase secrets for Edge Functions (e.g. issue-alert):\n')
  console.log(JSON.stringify(privateJwk))
  console.log('\nTo set in Supabase CLI:')
  console.log(`supabase secrets set PACKET_SIGNING_PRIVATE_KEY_JWK='${JSON.stringify(privateJwk)}'`)
  console.log(`supabase secrets set PACKET_SIGNING_KEY_ID='${kid}'`)
  console.log('=====================================================================\n')
}

// Parse CLI args
const args = process.argv.slice(2)
let kid = 'k1'
const kidIdx = args.indexOf('--kid')
if (kidIdx !== -1 && args[kidIdx + 1]) {
  kid = args[kidIdx + 1]!
}

void generateKeypair(kid)
