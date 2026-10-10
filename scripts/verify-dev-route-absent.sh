#!/usr/bin/env bash
# Proves the dev-only design-system gallery is NOT in the production build.
#
# Why a script and not a line of prose: the point of gating /dev/ui behind
# import.meta.env.DEV is that a reviewer trusts the gate. Trust is cheap to
# check, so make checking the default.
#
# Three independent artefacts must be absent, because any ONE being present is a
# leak: the route path in compiled output, the page's module name, and the
# gallery's own emitted chunk.
#
# Sourcemaps are deliberately NOT scanned. A map lists the SOURCE FILES of dead
# code, so `a.routes.tsx` and its DEV branch appear whether or not anything
# shipped. Grepping maps reports a leak that changes nothing for a user — and
# training people to ignore this script is worse than not having it. What must
# be absent is the compiled artefact.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/dist"

if [[ ! -d "$DIST" ]]; then
  echo "dist/ not found. Run 'npm run build' first." >&2
  exit 2
fi

echo "▸ scanning $DIST for dev-only artefacts"

FAILED=0

scan() {
  local label="$1" pattern="$2"
  local hits
  hits="$(find "$DIST" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
          -exec grep -lF -- "$pattern" {} + 2>/dev/null || true)"
  if [[ -n "$hits" ]]; then
    echo "  LEAK  $label — found '$pattern' in:"
    echo "$hits" | sed 's/^/          /'
    FAILED=1
  else
    echo "  ok    $label — '$pattern' absent from compiled output"
  fi
}

# Note: the locale string "Design system" (dev.ui.title) is NOT checked. It
# lives in en.json and ships with or without the gallery, so it is a locale
# detail, not evidence of a leak.
scan "route path" '/dev/ui'
scan "page chunk" 'DevUiPage'

if find "$DIST" -type f -name '*DevUi*' | grep -q .; then
  echo "  LEAK  gallery chunk — a DevUi chunk was emitted:"
  find "$DIST" -type f -name '*DevUi*' | sed 's/^/          /'
  FAILED=1
else
  echo "  ok    gallery chunk — no DevUi chunk emitted"
fi

echo
if [[ "$FAILED" -ne 0 ]]; then
  echo "✗ /dev/ui IS present in the production build — the DEV guard failed." >&2
  exit 1
fi

echo "✓ /dev/ui is absent from the production build"