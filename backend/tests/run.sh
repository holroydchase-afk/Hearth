#!/usr/bin/env bash
# Local test run. For each suite: fresh DB -> Supabase stubs -> every migration (in order) -> seed -> suite.
#   tests/rls_test.sql  privacy rules (110+)
#   tests/api_test.sql  API.md contract: RPCs, error codes, idempotency, rate limits
#   tests/timeline_test.sql  get_timeline / get_timeline_years (BETA-TIME-2..4, migration 0010)
#   tests/groups_test.sql    groups, households, events, roles, share history (SPEC-GROUPS, migration 0011)
#   tests/timeline_future_test.sql  capture dates after the share date (BETA-TIME-2/4)
#   tests/privacy_audit_test.sql  PRIV-1: no raw IP addresses kept (migration 0012)
#   tests/aud16/  BETA-AUD-16: snapshot on 0001-0010, apply 0011+, diff (0011 must change nobody's access)
# Usage: tests/run.sh   (needs a local Postgres 15+; PGUSER must be a superuser)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-hearth_test}
STATUS=0
for suite in tests/rls_test.sql tests/api_test.sql tests/notify_test.sql tests/setup_test.sql tests/reply_test.sql tests/timeline_test.sql \
             tests/groups_test.sql tests/timeline_future_test.sql tests/privacy_audit_test.sql; do
  dropdb --if-exists "$DB"
  createdb "$DB"
  files=(-f tests/supabase_stub.sql)
  for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
  files+=(-f supabase/seed.sql)
  psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}"
  psql -d "$DB" -X -q -f "$suite" || STATUS=1
done

# BETA-AUD-16: who-sees-what snapshot before 0011, then 0011 and later, then the diff.
dropdb --if-exists "$DB"
createdb "$DB"
early=(-f tests/supabase_stub.sql); late=()
for m in supabase/migrations/*.sql; do
  n=$(basename "$m" | cut -c1-4)
  if [ "$((10#$n))" -le 10 ]; then early+=(-f "$m"); else late+=(-f "$m"); fi
done
early+=(-f supabase/seed.sql -f tests/aud16/before.sql)
psql -d "$DB" -v ON_ERROR_STOP=1 -q "${early[@]}"
if [ ${#late[@]} -gt 0 ]; then psql -d "$DB" -v ON_ERROR_STOP=1 -q "${late[@]}"; fi
psql -d "$DB" -X -q -f tests/aud16/after.sql || STATUS=1

# family-setup v2 dry run (SPEC-GROUPS section 8 step 3, privacy item 14)
bash tests/setup_v2_test.sh || STATUS=1
# one-command family setup through the Management API (SETUP-API; curl stubbed, SQL real)
bash tests/setup_api_test.sh || STATUS=1
# QA-3 sent vs received, read only, through the Management API (curl stubbed, SQL real)
bash tests/sent_received_test.sh || STATUS=1
# D1 read-only hosted smoke check (curl stubbed, SQL real and read-only)
bash tests/smoke_check_test.sh || STATUS=1
exit $STATUS
