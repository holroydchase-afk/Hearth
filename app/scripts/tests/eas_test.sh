#!/usr/bin/env bash
# EXPO-1: app/scripts/eas.sh runs the EAS CLI with only EXPO_ACCESS_TOKEN set (the name the
# Hearth environment and the notify function use). EAS CLI itself reads EXPO_TOKEN, so the
# wrapper maps it. The CLI is stubbed; nothing leaves the machine and no token is printed.
#   bash app/scripts/tests/eas_test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
ok()  { echo "ok   - $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
check() { if (eval "$2"); then ok "$1"; else bad "$1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Stub CLI: records which token it saw (as a label, never the value) and its arguments.
cat > "$T/eas" <<'STUB'
#!/usr/bin/env bash
echo "token=${EXPO_TOKEN:+set}${EXPO_TOKEN:-unset} args=$*" > "$STUB_OUT"
STUB
chmod +x "$T/eas"
run() { env -u EXPO_TOKEN -u EXPO_ACCESS_TOKEN STUB_OUT="$T/out" EAS_CLI="$T/eas" "$@" bash scripts/eas.sh whoami; }

check "EXPO-1: script exists" "[[ -f scripts/eas.sh ]]"

run EXPO_ACCESS_TOKEN=tok-a >/dev/null 2>&1
check "EXPO-1: EXPO_ACCESS_TOKEN alone reaches the CLI as EXPO_TOKEN" "grep -q '^token=settok-a args=whoami$' '$T/out'"

rm -f "$T/out"; run EXPO_ACCESS_TOKEN=tok-a EXPO_TOKEN=tok-b >/dev/null 2>&1
check "EXPO-1: an explicit EXPO_TOKEN wins" "grep -q '^token=settok-b ' '$T/out'"

rm -f "$T/out"; run >"$T/err" 2>&1; rc=$?
check "EXPO-1: no token fails with a clear message and never calls the CLI" "(( rc != 0 )) && [[ ! -f '$T/out' ]] && grep -q EXPO_ACCESS_TOKEN '$T/err'"

check "EXPO-1: npm run eas uses the wrapper" "grep -q '\"eas\": \"bash scripts/eas.sh\"' package.json"

check "EXPO-2: app.json links the Expo project (eas init) and adds no permissions" "python3 -I -c \"import json,sys; e=json.load(open('app.json'))['expo']; sys.exit(not (e.get('extra',{}).get('eas',{}).get('projectId')=='676e8cec-57a6-472f-9086-9a9318eaf556' and e.get('owner')=='thefreighttrains-team' and 'permissions' not in e['android']))\""

# NAME-1: store builds lock the app ID (family.hearth.app) forever, so `build` and `submit` refuse until
# Chase has recorded "**Name final:** yes" in docs/product/ACCOUNTS.md. Everything else runs as before.
cp ../docs/product/ACCOUNTS.md "$T/accounts.bak"
check "NAME-1: ACCOUNTS.md records the name as not final yet" "grep -q '^\*\*Name final:\*\* no' ../docs/product/ACCOUNTS.md"
for cmd in build submit; do
  rm -f "$T/out"; env -u EXPO_TOKEN STUB_OUT="$T/out" EAS_CLI="$T/eas" EXPO_ACCESS_TOKEN=tok-a bash scripts/eas.sh $cmd --profile preview >"$T/err" 2>&1; rc=$?
  check "NAME-1: eas $cmd refuses while the name isn't final, says why, and never calls the CLI" "(( rc != 0 )) && [[ ! -f '$T/out' ]] && grep -q 'Name final' '$T/err' && grep -q 'family.hearth.app' '$T/err'"
done
rm -f "$T/out"; env -u EXPO_TOKEN STUB_OUT="$T/out" EAS_CLI="$T/eas" EXPO_ACCESS_TOKEN=tok-a bash scripts/eas.sh update --branch x >/dev/null 2>&1
check "NAME-1: other EAS commands still run" "grep -q 'args=update --branch x' '$T/out'"
sed -i 's/^\*\*Name final:\*\* no.*/**Name final:** yes/' ../docs/product/ACCOUNTS.md
rm -f "$T/out"; env -u EXPO_TOKEN STUB_OUT="$T/out" EAS_CLI="$T/eas" EXPO_ACCESS_TOKEN=tok-a bash scripts/eas.sh build --profile preview >/dev/null 2>&1
check "NAME-1: once the name is final, eas build runs" "grep -q 'args=build --profile preview' '$T/out'"
cp "$T/accounts.bak" ../docs/product/ACCOUNTS.md

echo "eas: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
