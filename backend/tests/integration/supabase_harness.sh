#!/usr/bin/env bash
# Same JSON as start.sh, for a running `supabase start` stack (used by CI):
#   {url: <REST_URL> (= <API_URL>/rest/v1, through Kong), anonKey: ANON_KEY,
#    serviceRoleKey: SERVICE_ROLE_KEY, users: {name: {id, jwt}}}  -- user JWTs signed with JWT_SECRET.
# Usage (from backend/): tests/integration/supabase_harness.sh > /tmp/harness.json
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE/../.."
SB=${SUPABASE_CLI:-npx --yes supabase@2.121.0}
status=$($SB status -o json)
get() { python3 -I -c 'import json,sys; print(json.loads(sys.argv[1]).get(sys.argv[2], ""))' "$status" "$1"; }
DB_URL=$(get DB_URL)
REST_URL=$(get REST_URL)
[[ -n "$REST_URL" ]] || REST_URL="$(get API_URL)/rest/v1"
users=$(psql "$DB_URL" -X -At -F ' ' -c "select id, split_part(email, '@', 1) from auth.users order by email")
URL="$REST_URL" JWT_SECRET="$(get JWT_SECRET)" ANON_KEY="$(get ANON_KEY)" SERVICE_ROLE_KEY="$(get SERVICE_ROLE_KEY)" \
  USERS="$users" python3 -I "$HERE/mint_keys.py"
