#!/usr/bin/env bash
# QA gate runner for the nest repo (MVP1 gates Q01..Q22)
# Usage: bash scripts/qa-gate.sh [--skip-db] [--skip-e2e] [label]
set -uo pipefail
cd "$(dirname "$0")/.."

LABEL="${1:-unnamed-gate}"
LOG="output/qa-gate-${LABEL}.log"
mkdir -p output
: > "$LOG"

echo "== QA GATE [$LABEL] ==" | tee -a "$LOG"
echo "revision: $(git rev-parse --short HEAD 2>/dev/null || echo unknown) | $(date -u +%FT%TZ)" | tee -a "$LOG"

run() {
  local name="$1"; shift
  echo "--- $name ---" | tee -a "$LOG"
  "$@" >> "$LOG" 2>&1
  local code=$?
  if [ $code -eq 0 ]; then echo "PASS: $name" | tee -a "$LOG"; else echo "FAIL($code): $name" | tee -a "$LOG"; fi
  return $code
}

PASS=0; FAIL=0
for step in \
  "git-diff:git status --porcelain" \
  ; do :; done

run lint npm run lint || FAIL=$((FAIL+1))
# Clean Next.js generated cache before typecheck: a previous gate's `build`
# leaves dashboard/.next behind, and a stale duplicate *.d.ts pair causes
# TS6200/TS2300. This is the documented environment recovery step.
rm -rf dashboard/.next
run typecheck npm run typecheck || FAIL=$((FAIL+1))
run unit npm run test:unit || FAIL=$((FAIL+1))
run frontend npm run test:frontend || FAIL=$((FAIL+1))
run integration npm run test:integration || FAIL=$((FAIL+1))
if [[ "${SKIP_DB:-}" != "1" ]]; then
  run database npm run test:database || FAIL=$((FAIL+1))
fi
run build npm run build || FAIL=$((FAIL+1))
if [[ "${SKIP_E2E:-}" != "1" ]] && [[ -f playwright.config.ts ]]; then
  run e2e npm run test:e2e || FAIL=$((FAIL+1))
fi

echo "== RESULT [$LABEL]: failures=$FAIL ==" | tee -a "$LOG"
[ "$FAIL" -eq 0 ]
