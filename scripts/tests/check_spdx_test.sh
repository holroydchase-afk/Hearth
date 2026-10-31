#!/usr/bin/env bash
# LIC-1..3: tests for scripts/check-spdx.sh (every Hearth source file says AGPL-3.0-or-later; DEC-44).
set -u
cd "$(dirname "$0")/../.."
pass=0; fail=0
ok()  { echo "ok      $1"; pass=$((pass+1)); }
bad() { echo "NOT OK  $1"; fail=$((fail+1)); }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
printf '// SPDX-License-Identifier: AGPL-3.0-or-later\n// Copyright (C) 2026 Chase Holroyd\nexport const a = 1;\n' > "$T/good.ts"
printf 'export const b = 2;\n' > "$T/bad.tsx"
out=$(bash scripts/check-spdx.sh "$T"); rc=$?
[ $rc -ne 0 ] && echo "$out" | grep -q 'bad.tsx' && ! echo "$out" | grep -q 'good.ts' && ok "LIC-1 flags a source file with no SPDX header, passes one with it" || bad "LIC-1 flags a missing header  [rc=$rc: $out]"
out=$(bash scripts/check-spdx.sh); rc=$?
[ $rc -eq 0 ] && ok "LIC-2 every file in app/src, the edge functions and packages/messenger has the AGPL-3.0-or-later header" || bad "LIC-2 headers on every source file  [$(echo "$out" | head -5)]"
lic=$(node -p "require('./app/package.json').license" 2>/dev/null)
[ "$lic" = "AGPL-3.0-or-later" ] && ok "LIC-3 app/package.json says AGPL-3.0-or-later" || bad "LIC-3 app/package.json license is '$lic'"
echo; echo "SPDX CHECK RESULT: $pass passed, $fail failed"
[ $fail -eq 0 ]
