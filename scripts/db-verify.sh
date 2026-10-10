#!/usr/bin/env bash
# Runs the Kavach migrations and the RLS security tests against a real Postgres.
#
# Why this exists
# ---------------
# "The migration applied without error" is NOT evidence that the security model
# is correct. RLS has two independent gates — privileges and policies — and a
# schema can apply cleanly while granting a client far more than intended. These
# tests assert what a *hostile* client can actually do: forge an alert, promote
# itself to authority, deanonymise a reporter, or flood the outbox.
#
# This caught two real defects that a syntax check never would have:
#   * grants were inherited from Supabase's undocumented default privileges, so
#     the model was invisible in the repo
#   * next_alert_seq() derived the counter from max(alerts.seq), which reuses a
#     seq the moment an expired alert is pruned — and the client orders alerts by
#     seq, so a stale packet could outrank a current one
#
# Usage
# -----
#   npm run db:verify
#
# Needs a local Postgres server (initdb/pg_ctl on PATH, or set PGBIN). Uses a
# throwaway cluster in a temp directory on port 55432; nothing touches your real
# databases. Set KEEP_PG=1 to leave the cluster running for poking at it.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${KAVACH_DB_VERIFY_DIR:-${TMPDIR:-/tmp}/kavach-db-verify}"
PORT="${KAVACH_DB_VERIFY_PORT:-55432}"

# ---------------------------------------------------------------------------
# Locate the server binaries. psql alone is not enough — we need initdb/pg_ctl.
# ---------------------------------------------------------------------------
find_pgbin() {
  if [[ -n "${PGBIN:-}" && -x "${PGBIN}/initdb" ]]; then
    echo "$PGBIN"; return
  fi
  local candidate
  for candidate in \
    /Library/PostgreSQL/*/bin \
    /opt/homebrew/opt/postgresql*/bin \
    /usr/local/opt/postgresql*/bin \
    /usr/lib/postgresql/*/bin
  do
    [[ -x "$candidate/initdb" ]] && { echo "$candidate"; return; }
  done
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"; return
  fi
  echo ""
}

PGBIN="$(find_pgbin)"
if [[ -z "$PGBIN" ]]; then
  cat <<'EOF'
Could not find a local PostgreSQL SERVER (initdb/pg_ctl), so the migrations and
the RLS security tests could NOT be run.

  Install one, then re-run `npm run db:verify`:
    macOS           brew install postgresql@18
    Debian/Ubuntu   sudo apt-get install postgresql
    or set PGBIN=/path/to/postgresql/bin

These tests are worth the install: they are the only thing that verifies a
leaked anon key cannot forge an official alert.
EOF
  exit 2
fi

export PATH="$PGBIN:$PATH"

# ---------------------------------------------------------------------------
# Throwaway cluster
# ---------------------------------------------------------------------------
if [[ -d "$WORK/pgdata" ]]; then
  pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
fi
mkdir -p "$WORK/sock"

echo "▸ initdb  →  $WORK/pgdata"
initdb -D "$WORK/pgdata" -U postgres --auth=trust -E UTF8 >"$WORK/initdb.log" 2>&1

echo "▸ start   →  port $PORT"
pg_ctl -D "$WORK/pgdata" \
  -o "-p $PORT -k $WORK/sock -c listen_addresses='' -c wal_level=logical" \
  -l "$WORK/pg.log" -w start >/dev/null

cleanup() {
  if [[ "${KEEP_PG:-0}" == "1" ]]; then
    echo
    echo "KEEP_PG=1 — cluster left running:"
    echo "  psql -h $WORK/sock -p $PORT -U postgres -d kavach"
    return
  fi
  pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

createdb -h "$WORK/sock" -p "$PORT" -U postgres kavach

run_sql() {
  psql -h "$WORK/sock" -p "$PORT" -U postgres -d kavach \
    -v ON_ERROR_STOP=1 -q -f "$1"
}

# ---------------------------------------------------------------------------
# Apply, in order, exactly as `supabase db push` would
# ---------------------------------------------------------------------------
echo "▸ shim"
run_sql "$REPO/supabase/verify/00-supabase-shim.sql"

for f in 0001_init.sql 0002_rls.sql 0003_realtime.sql; do
  printf "▸ %-24s" "$f"
  run_sql "$REPO/supabase/migrations/$f" && echo "ok" || { echo "FAILED"; exit 1; }
done

printf "▸ %-24s" "seed.sql"
run_sql "$REPO/supabase/seed.sql" && echo "ok" || { echo "FAILED"; exit 1; }

# ---------------------------------------------------------------------------
# Idempotency: `supabase db push` is never re-run, but `db reset` is, and a
# hand-applied migration should not explode on a second run.
# ---------------------------------------------------------------------------
echo
echo "▸ re-applying migrations (idempotency check)"
for f in 0001_init.sql 0002_rls.sql 0003_realtime.sql; do
  printf "  %-24s" "$f"
  run_sql "$REPO/supabase/migrations/$f" >/dev/null 2>"$WORK/idem.txt" \
    && echo "ok" || { echo "NOT IDEMPOTENT"; sed 's/^/    /' "$WORK/idem.txt"; exit 1; }
done
printf "  %-24s" "seed.sql"
run_sql "$REPO/supabase/seed.sql" >/dev/null 2>&1 && echo "ok" || { echo "FAILED"; exit 1; }

echo
echo "══════════════════════════════════════════════════════════════════"
echo " RLS security tests"
echo "══════════════════════════════════════════════════════════════════"

if ! psql -h "$WORK/sock" -p "$PORT" -U postgres -d kavach \
      -q -f "$REPO/supabase/verify/01-security-tests.sql" 2>&1 \
    | grep -E "NOTICE|ERROR" \
    | sed -e 's/^psql:[^ ]* //' -e 's/^ *NOTICE: *//' -e 's/^ *ERROR: */ERROR: /'
then
  echo "security tests did not run"
  exit 1
fi

# A FAIL raises an exception, which -v ON_ERROR_STOP turns into a non-zero exit.
psql -h "$WORK/sock" -p "$PORT" -U postgres -d kavach \
  -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/verify/01-security-tests.sql" >/dev/null 2>&1

echo
echo "✓ migrations apply cleanly, are idempotent, and every RLS assertion holds"