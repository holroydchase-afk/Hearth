#!/usr/bin/env bash
# EXPO-4: the app's Expo SDK is the one the App Store's Expo Go runs (post mortem, Oct 18 2026:
# Hearth was built on SDK 54 while iPhone Expo Go ran only SDK 57, and nothing checked until Chase
# opened it on his phone). Uses saved copies of api.expo.dev/v2/versions; no network.
#   bash scripts/tests/check_expo_go_test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
ok()  { echo "ok   - $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
check() { if (eval "$2"); then ok "$1"; else bad "$1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
APP_MAJOR=$(python3 -I -c "import json,re; print(re.search(r'(\d+)\.', json.load(open('app/package.json'))['dependencies']['expo']).group(1))")
echo "{\"expoGoSdkVersion\": \"$APP_MAJOR.0.0\"}" > "$T/same.json"
echo "{\"expoGoSdkVersion\": \"$((APP_MAJOR + 1)).0.0\"}" > "$T/newer.json"
echo '{"sdkVersions": {}}' > "$T/missing.json"

check "EXPO-4: script exists" "[[ -f scripts/check-expo-go.sh ]]"

EXPO_VERSIONS_FILE="$T/same.json" bash scripts/check-expo-go.sh >"$T/out" 2>&1; rc=$?
check "EXPO-4: passes when Expo Go runs the app's SDK" "(( rc == 0 )) && grep -q \"SDK $APP_MAJOR\" '$T/out'"

EXPO_VERSIONS_FILE="$T/newer.json" bash scripts/check-expo-go.sh >"$T/out" 2>&1; rc=$?
check "EXPO-4: fails when Expo Go has moved on, naming both versions" "(( rc != 0 )) && grep -q \"SDK $APP_MAJOR\" '$T/out' && grep -q \"SDK $((APP_MAJOR + 1))\" '$T/out'"

EXPO_VERSIONS_FILE="$T/missing.json" bash scripts/check-expo-go.sh >"$T/out" 2>&1; rc=$?
check "EXPO-4: fails closed when Expo's answer has no Expo Go version" "(( rc != 0 ))"

EXPO_VERSIONS_URL="http://127.0.0.1:9/nothing" bash scripts/check-expo-go.sh >"$T/out" 2>&1; rc=$?
check "EXPO-4: fails closed with a clear message when Expo can't be reached" "(( rc != 0 )) && grep -qi 'could not' '$T/out'"

check "EXPO-4: CI runs the live check" "grep -q 'scripts/check-expo-go.sh' .github/workflows/ci.yml"
check "EXPO-4: test-all.sh runs the live check" "grep -q 'scripts/check-expo-go.sh' test-all.sh"

echo "# $PASS passed, $FAIL failed"
(( FAIL == 0 ))
