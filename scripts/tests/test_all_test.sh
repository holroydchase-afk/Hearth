#!/usr/bin/env bash
# QA-ALL-1 (RR-13): test-all.sh fails when any suite that ran failed, and says which suites were
# skipped and why (no Postgres, no Deno), instead of passing on Playwright's result alone.
#   bash scripts/tests/test_all_test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
ok()  { echo "ok   - $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
check() { if (eval "$2"); then ok "$1"; else bad "$1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
check "QA-ALL-1: the suite helper exists" "[[ -f scripts/lib/suite.sh ]]"
# shellcheck source=/dev/null
source scripts/lib/suite.sh 2>/dev/null || true

( suite_reset; suite "passing" true; suite "failing" false; suite_skip "deno" "Deno isn't installed"; suite_report ) >"$T/out" 2>&1; rc=$?
check "QA-ALL-1: one failing suite makes the run fail" "(( rc != 0 ))"
check "QA-ALL-1: the failing suite is named" "grep -q 'FAILED: failing' '$T/out'"
check "QA-ALL-1: a skipped suite is named with why" "grep -q \"SKIPPED: deno (Deno isn't installed)\" '$T/out'"

( suite_reset; suite "passing" true; suite_skip "deno" "Deno isn't installed"; suite_report ) >"$T/out" 2>&1; rc=$?
check "QA-ALL-1: skips alone don't fail the run (a sandbox without Deno can still pass)" "(( rc == 0 ))"
check "QA-ALL-1: the summary counts passed and skipped" "grep -q 'SUITES: 1 passed, 0 failed, 1 skipped' '$T/out'"

check "QA-ALL-1: test-all.sh uses the helper" "grep -q 'suite_report' test-all.sh"

echo "TEST-ALL RESULT: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
