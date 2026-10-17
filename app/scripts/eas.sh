#!/usr/bin/env bash
# EAS CLI with the Hearth environment's Expo token (EXPO-1). The environment stores it as
# EXPO_ACCESS_TOKEN, the name the notify function reads; EAS CLI reads EXPO_TOKEN, so map it.
#   npm run eas -- whoami        npm run eas -- build --profile preview
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_TOKEN=${EXPO_TOKEN:-${EXPO_ACCESS_TOKEN:-}}
[[ -n $EXPO_TOKEN ]] || { echo "eas: missing EXPO_ACCESS_TOKEN (add it as an environment secret)" >&2; exit 1; }
exec ${EAS_CLI:-npx --yes eas-cli@25.1.1} "$@"
