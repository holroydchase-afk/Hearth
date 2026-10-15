#!/usr/bin/env bash
# Contract tests against the backend's real PostgREST harness. Restarts it (fresh DB) each run,
# because the S10 rate-limit test locks one user out for 10 minutes.
set -euo pipefail
cd "$(dirname "$0")/.."
BACKEND=../backend/tests/integration
J=$(mktemp)
bash "$BACKEND/start.sh" > "$J"
trap 'bash "$BACKEND/stop.sh" >/dev/null 2>&1 || true; rm -f "$J"' EXIT
get() { python3 -c "import json,sys;d=json.load(open('$J'));print(json.dumps(d$1) if isinstance(d$1,(dict,list)) else d$1)"; }
HEARTH_API_URL=$(get "['url']") HEARTH_ANON_KEY=$(get "['anonKey']") HEARTH_SERVICE_KEY=$(get "['serviceRoleKey']") \
HEARTH_USERS_JSON=$(get "['users']") npx jest --ci src/api/contract -t SupabaseApi --verbose "$@"
