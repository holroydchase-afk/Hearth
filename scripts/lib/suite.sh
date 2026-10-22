# QA-ALL-1 (RR-13): run suites, remember which failed or were skipped, report at the end.
# Source it, then: suite_reset; suite NAME CMD...; suite_skip NAME WHY; suite_report (returns non-zero on any failure).
suite_reset() { SUITE_PASSED=(); SUITE_FAILED=(); SUITE_SKIPPED=(); }
suite() {
  local name=$1; shift
  if "$@"; then SUITE_PASSED+=("$name"); else SUITE_FAILED+=("$name"); fi
}
suite_skip() { SUITE_SKIPPED+=("$1 ($2)"); }
suite_report() {
  local s
  for s in "${SUITE_FAILED[@]+"${SUITE_FAILED[@]}"}"; do echo "FAILED: $s"; done
  for s in "${SUITE_SKIPPED[@]+"${SUITE_SKIPPED[@]}"}"; do echo "SKIPPED: $s"; done
  echo "SUITES: ${#SUITE_PASSED[@]} passed, ${#SUITE_FAILED[@]} failed, ${#SUITE_SKIPPED[@]} skipped"
  (( ${#SUITE_FAILED[@]} == 0 ))
}
