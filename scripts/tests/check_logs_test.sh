#!/usr/bin/env bash
# PRIV-2: tests for scripts/check-logs.mjs (never log keys, URLs, captions; CLAUDE.md rule 2).
set -u
cd "$(dirname "$0")/../.."
pass=0; fail=0
ok()  { echo "ok      $1"; pass=$((pass+1)); }
bad() { echo "NOT OK  $1"; fail=$((fail+1)); }
F=scripts/tests/fixtures/logs
for f in key url caption message object stringify multiline; do
  out=$(node scripts/check-logs.mjs "$F/bad/$f.ts"); rc=$?
  [ $rc -ne 0 ] && echo "$out" | grep -q "bad/$f.ts:" && ok "PRIV-2 flags a bad log call ($f)" || bad "PRIV-2 flags a bad log call ($f)  [rc=$rc: $out]"
done
out=$(node scripts/check-logs.mjs "$F/good"); rc=$?
[ $rc -eq 0 ] && ok "PRIV-2 passes safe log calls (fixed words, e.name, URL-cut message)" || bad "PRIV-2 passes safe log calls  [$out]"
out=$(node scripts/check-logs.mjs); rc=$?
[ $rc -eq 0 ] && ok "PRIV-2 app/src and the edge functions log no keys, URLs, captions or raw errors" || bad "PRIV-2 app/src and the edge functions log no keys, URLs, captions or raw errors  [$out]"
echo; echo "LOG CHECK RESULT: $pass passed, $fail failed"
[ $fail -eq 0 ]
