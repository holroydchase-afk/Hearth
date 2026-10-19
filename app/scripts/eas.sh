#!/usr/bin/env bash
# EAS CLI with the Hearth environment's Expo token (EXPO-1). The environment stores it as
# EXPO_ACCESS_TOKEN, the name the notify function reads; EAS CLI reads EXPO_TOKEN, so map it.
#   npm run eas -- whoami        npm run eas -- build --profile preview
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_TOKEN=${EXPO_TOKEN:-${EXPO_ACCESS_TOKEN:-}}
[[ -n $EXPO_TOKEN ]] || { echo "eas: missing EXPO_ACCESS_TOKEN (add it as an environment secret)" >&2; exit 1; }
# NAME-1: a store build locks the app ID (family.hearth.app) forever. Refuse until Chase has made the name final
# in docs/product/ACCOUNTS.md ("**Name final:** yes"). Other commands (whoami, update, init) run as before.
if [[ ${1:-} == build || ${1:-} == submit ]] && ! grep -q '^\*\*Name final:\*\* yes' ../docs/product/ACCOUNTS.md; then
  echo "eas: not running '$1'. A store build locks the app ID family.hearth.app forever, and the name isn't final." >&2
  echo "     When Chase decides the name, set '**Name final:** yes' in docs/product/ACCOUNTS.md, then run this again." >&2
  exit 1
fi
# EXPO-4: an update Expo Go can't open helps nobody (post mortem, docs/eng/LESSONS.md). Check first.
if [[ ${1:-} == update ]]; then bash ../scripts/check-expo-go.sh || exit 1; fi
exec ${EAS_CLI:-npx --yes eas-cli@25.1.1} "$@"
