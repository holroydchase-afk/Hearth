#!/usr/bin/env bash
# TDPM-1: tests for scripts/check-persona-checks.sh (CLAUDE.md rule 9, docs/product/PERSONA-CHECK.md).
# Fixtures are written to a temp dir, so the real decisions never affect this test.
set -u
cd "$(dirname "$0")/../.."
pass=0; fail=0
ok()  { echo "ok      $1"; pass=$((pass+1)); }
bad() { echo "NOT OK  $1"; fail=$((fail+1)); }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

# A two-persona roster in the same format as PERSONA-CHECK.md.
cat > "$T/personas.md" <<'P'
<!-- personas:start -->
- PA: Posting parent
- LG: Least-savvy grandparent
<!-- personas:end -->
P

decision() { # $1 = file name, rest = table rows and extra lines
  local f="$T/d/$1"; shift; mkdir -p "$T/d"
  { echo "# Decision: fixture"; echo; echo "| Persona | Green/Red | Why |"; echo "|---|---|---|"
    for line in "$@"; do echo "$line"; done; } > "$f"
}
run() { rm -rf "$T/d"; mkdir -p "$T/d"; "$@"; out=$(bash scripts/check-persona-checks.sh "$T/d" "$T/personas.md" 2>&1); rc=$?; }

expect_pass() { [ $rc -eq 0 ] && ok "$1" || bad "$1  [rc=$rc: $out]"; }
expect_fail() { [ $rc -ne 0 ] && echo "$out" | grep -q "$2" && ok "$1" || bad "$1  [rc=$rc: $out]"; }

run decision ok.md "| PA Posting parent | Green | Shares faster |" "| LG Least-savvy grandparent | Green | Nothing new to learn |"
expect_pass "TDPM-1 all personas Green passes"

run decision red-ok.md "| PA | Green | Fine |" "| LG | Red | Emoji picker is too much |" "" "Resolution: LG mitigation: heart stays the one-tap default"
expect_pass "TDPM-1 a Red with a Resolution line passes"

run decision override.md "| PA | Green | Fine |" "| LG | Red | Too much |" "" "Resolution: LG Chase override (Oct 19): worth it"
expect_pass "TDPM-1 a Red with a Chase override passes"

run decision missing.md "| PA | Green | Fine |"
expect_fail "TDPM-1 a missing persona row fails" "missing.md: no row for LG"

run decision maybe.md "| PA | Green | Fine |" "| LG | Amber | Not sure |"
expect_fail "TDPM-1 a value other than Green/Red fails" "maybe.md: LG has 'Amber'"

run decision red.md "| PA | Green | Fine |" "| LG | Red | Too much |"
expect_fail "TDPM-1 a Red without a Resolution line fails" "red.md: LG is Red with no 'Resolution: LG"

run decision vague.md "| PA | Green | Fine |" "| LG | Red | Too much |" "" "Resolution: LG we will see"
expect_fail "TDPM-1 a Resolution that is neither mitigation nor Chase override fails" "vague.md: LG is Red with no 'Resolution: LG"

run decision long.md "| PA | Green | one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen |" "| LG | Green | Fine |"
expect_fail "TDPM-1 a Why over 15 words fails" "long.md: PA why is 16 words"

run decision empty.md "| PA | Green |  |" "| LG | Green | Fine |"
expect_fail "TDPM-1 an empty Why fails" "empty.md: PA has no why"

run decision dup.md "| PA | Green | Fine |" "| PA | Red | Hmm |" "| LG | Green | Fine |"
expect_fail "TDPM-1 a duplicate persona row fails" "dup.md: PA appears twice"

run decision stranger.md "| PA | Green | Fine |" "| LG | Green | Fine |" "| XX | Green | Who? |"
expect_fail "TDPM-1 an unknown persona fails" "stranger.md: unknown persona 'XX'"

run bash -c "printf '# Decision\n\nNo table here.\n' > '$T/d/notable.md'"
expect_fail "TDPM-1 a decision with no persona table fails" "notable.md: no '| Persona | Green/Red | Why |' table"

run true
expect_fail "TDPM-1 an empty decisions folder fails" "no decision files"

out=$(bash scripts/check-persona-checks.sh 2>&1); rc=$?
[ $rc -eq 0 ] && ok "TDPM-1 every decision in docs/product/decisions/ has a full persona check" || bad "TDPM-1 every decision in docs/product/decisions/ has a full persona check  [$out]"

echo; echo "PERSONA CHECK RESULT: $pass passed, $fail failed"
[ $fail -eq 0 ]
