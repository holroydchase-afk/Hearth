#!/usr/bin/env bash
# Local test run. For each suite: fresh DB -> Supabase stubs -> every migration (in order) -> seed -> suite.
#   tests/rls_test.sql  privacy rules (110+)
#   tests/api_test.sql  API.md contract: RPCs, error codes, idempotency, rate limits
#   tests/timeline_test.sql  get_timeline / get_timeline_years (BETA-TIME-2..4, migration 0010)
# Usage: tests/run.sh   (needs a local Postgres 15+; PGUSER must be a superuser)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-hearth_test}
STATUS=0
for suite in tests/rls_test.sql tests/api_test.sql tests/notify_test.sql tests/setup_test.sql tests/reply_test.sql tests/timeline_test.sql; do
  dropdb --if-exists "$DB"
  createdb "$DB"
  files=(-f tests/supabase_stub.sql)
  for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
  files+=(-f supabase/seed.sql)
  psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}"
  psql -d "$DB" -X -q -f "$suite" || STATUS=1
done
exit $STATUS
