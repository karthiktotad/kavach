#!/usr/bin/env bash
# Type-check the Supabase Edge Functions with Deno, the runtime that will
# actually execute them.
#
# Why this is separate from `npm run typecheck`: the functions use Deno globals
# (Deno.env, Deno.serve) and Deno-flavoured imports. Type-checking them with the
# Node config required a hand-written stub of supabase-js that produced false
# errors, which is worse than no check: it looks authoritative and is not.
#
# Deno is not installed in the hackathon environment, so this script exits with
# an explanation rather than silently passing.
set -euo pipefail

if ! command -v deno >/dev/null 2>&1; then
  cat <<'EOF'
Deno is not installed, so the Edge Functions could NOT be type-checked.

  This matters: supabase/functions/ is excluded from `npm run typecheck`, so
  nothing else covers these files. Supabase's runtime type-checks on deploy and
  will refuse a broken function — but you get the error at deploy time rather
  than before.

To check locally:

  # macOS / Linux
  curl -fsSL https://deno.land/install.sh | sh
  # or: brew install deno

  npm run typecheck:fn
EOF
  exit 2
fi

echo "▸ deno check supabase/functions/*/index.ts"
# --no-lock: we do not want a deno.lock in the repo, and the npm: specifiers are
# resolved at deploy time by Supabase.
deno check --no-lock supabase/functions/*/index.ts

echo
echo "✓ Edge Functions type-check clean under Deno"