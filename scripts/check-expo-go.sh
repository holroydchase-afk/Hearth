#!/usr/bin/env bash
# EXPO-4: the app's Expo SDK must be the one the App Store's Expo Go runs. iPhone Expo Go opens only
# the newest SDK and can't be downgraded, so an app on an older SDK won't open on anyone's phone
# (post mortem: docs/eng/LESSONS.md, Oct 18 2026). Asks Expo's public versions API; reads no secrets.
#   bash scripts/check-expo-go.sh
# EXPO_VERSIONS_FILE=<saved json> skips the network (tests).
set -uo pipefail
cd "$(dirname "$0")/.."
URL=${EXPO_VERSIONS_URL:-https://api.expo.dev/v2/versions}
if [[ -n ${EXPO_VERSIONS_FILE:-} ]]; then JSON=$(cat "$EXPO_VERSIONS_FILE")
elif ! JSON=$(curl -sS --fail --max-time 20 "$URL" 2>/dev/null); then
  echo "Expo Go check: could not reach $URL, so we can't tell whether Expo Go still runs our SDK." >&2; exit 1
fi
APP=$(python3 -I -c "import json,re; print(re.search(r'(\d+)\.', json.load(open('app/package.json'))['dependencies']['expo']).group(1))")
GO=$(printf '%s' "$JSON" | python3 -I -c "import json,sys; v=json.load(sys.stdin).get('expoGoSdkVersion') or ''; print(v.split('.')[0])" 2>/dev/null)
if [[ -z $GO ]]; then echo "Expo Go check: Expo's answer has no expoGoSdkVersion; check expo.dev/go by hand." >&2; exit 1; fi
if [[ $APP != "$GO" ]]; then
  echo "Expo Go check FAILED: the app is on SDK $APP, but the App Store's Expo Go runs only SDK $GO." >&2
  echo "  Nobody can open this build in Expo Go. Upgrade: cd app && npx expo install expo@^$GO.0.0 && npx expo install --fix" >&2
  exit 1
fi
echo "Expo Go check OK: the app and the App Store's Expo Go are both on SDK $APP"
