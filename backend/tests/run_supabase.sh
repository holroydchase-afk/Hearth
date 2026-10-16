#!/usr/bin/env bash
# S16: the SQL suites on a REAL local Supabase stack (`supabase start`), not the auth stub.
# Each suite gets a fresh `supabase db reset` (all migrations + seed.sql, applied by the CLI).
# Usage (from backend/): supabase start && tests/run_supabase.sh
# Env: SUPABASE_CLI (default: npx --yes supabase@2.121.0)
#      SUPABASE_TEST_DB_URL (default: the local stack's superuser, like tests/run.sh uses locally)
set -euo pipefail
cd "$(dirname "$0")/.."
SB=${SUPABASE_CLI:-npx --yes supabase@2.121.0}
DB_URL=${SUPABASE_TEST_DB_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres}
STATUS=0
for suite in tests/rls_test.sql tests/api_test.sql tests/notify_test.sql tests/setup_test.sql tests/reply_test.sql; do
  echo "== $suite (fresh db reset)" >&2
  $SB db reset --local >&2
  psql "$DB_URL" -X -q -f "$suite" || STATUS=1
done
exit $STATUS
