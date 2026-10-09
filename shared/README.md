# `shared/` — pure TypeScript used by BOTH the client and Supabase Edge Functions

Anything in this directory may be imported by:

- the browser bundle (`src/`), **and**
- a Deno runtime (Supabase Edge Functions in `supabase/functions/`)

## Hard constraints

Because this code runs in two very different runtimes:

1. **No browser APIs.** No `window`, `document`, `localStorage`, `crypto.subtle`.
   Use the WebCrypto **global** `crypto`, which exists in both runtimes.
2. **No `src/` imports.** The dependency graph must never point back into the app.
3. **No npm dependencies.** Deno resolves imports differently; keep it to native
   Web APIs so both runtimes agree.
4. **Pure and deterministic.** These are the units under test (engineering rule 4).

## Planned modules

| Path | Milestone | Purpose |
| --- | --- | --- |
| `packet/types.ts` | M4 | Hazard codes, severity levels, zone ids, expiry, issuer, signature envelope |
| `packet/codec.ts` | M4 | Compact encode/decode that fits one SMS and one QR code |
| `packet/verify.ts` | M4 | ECDSA P-256 verification against bundled public keys |
| `keys/registry.ts` | M4 | Key ids → public keys, with key rotation support |
| `trust/score.ts` | M9 | Deterministic community-report confidence scoring |
| `intent/classify.ts` | M10 | Offline intent routing (emergency / shelter / medical / phrase / unknown) |

Added in **M4** alongside the packet codec. `shared/types/` and `shared/trust/`
directories exist now and are filled in M4/M9/M10.