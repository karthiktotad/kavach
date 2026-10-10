/**
 * Minimal ambient types so `tsc` can parse-check the Edge Functions locally.
 *
 * Deno is NOT installed in the hackathon environment, so `deno check` cannot be
 * run here. This file gives the TypeScript compiler just enough of the Deno
 * surface (env access, the serve signature) to catch syntax and type errors.
 *
 * ⚠️ This is a best-effort check, NOT a Deno compatibility proof. Before
 * deploying, run the real thing:
 *
 *     npx supabase functions serve
 *     deno check supabase/functions/…/index.ts
 *
 * See docs/BACKEND.md § "Verifying Deno compatibility".
 */

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined
    set(key: string, value: string): void
    delete(key: string): void
    toObject(): Record<string, string>
  }

  const env: Env

  function serve(handler: (req: Request) => Response | Promise<Response>): void
  function serve(options: unknown, handler: (req: Request) => Response | Promise<Response>): void

  function readTextFile(path: string | URL): Promise<string>
  function exit(code?: number): never
}

/**
 * Supabase injects these automatically. Declared here so the functions type-check
 * without pulling the full edge-runtime types.
 */
declare module 'jsr:@supabase/supabase-js@2' {
  export function createClient(
    url: string,
    key: string,
    options?: unknown,
  ): {
    auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> }
    from(table: string): {
      select(columns?: string): {
        eq(
          column: string,
          value: unknown,
        ): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>
          single(): Promise<{ data: unknown; error: unknown }>
          limit(n: number): Promise<{ data: unknown; error: unknown }>
        }
        in(column: string, values: readonly unknown[]): Promise<{ data: unknown; error: unknown }>
        order(
          column: string,
          opts?: { ascending?: boolean },
        ): {
          limit(n: number): Promise<{ data: unknown; error: unknown }>
        }
        order(
          column: string,
          opts?: { ascending?: boolean },
        ): Promise<{ data: unknown; error: unknown }>
      }
      insert(
        values: unknown,
      ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>
      upsert(
        values: unknown,
        opts?: { onConflict?: string },
      ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>
      update(values: unknown): {
        eq(column: string, value: unknown): Promise<{ data: unknown; error: unknown }>
      }
      rpc(fn: string, args?: unknown): Promise<{ data: unknown; error: unknown }>
    }
  }
}
