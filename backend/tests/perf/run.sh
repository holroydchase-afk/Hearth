#!/usr/bin/env bash
# Scale test for get_feed. Builds a ~1M-post fixture in a separate DB, then runs bench.sql.
# Usage: tests/perf/run.sh            (needs local Postgres 15+ superuser; ~2-4 min, ~2 GB disk)
#        KEEP=1 tests/perf/run.sh     (reuse an existing fixture DB, only re-run the benchmark)
# Fails (exit 1) if any scenario's p95 is 30 ms or more.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${PERF_DB:-hearth_perf}
OUT=tests/perf/last-run.txt
if [[ "${KEEP:-0}" != 1 ]]; then
  dropdb --if-exists "$DB"
  createdb "$DB"
  files=(-f tests/supabase_stub.sql)
  for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
  psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}"
  start=$(date +%s)
  psql -d "$DB" -X -q -f tests/perf/generate.sql
  echo "fixture built in $(( $(date +%s) - start )) s"
fi
psql -d "$DB" -X -f tests/perf/bench.sql 2>&1 | tee "$OUT"
awk -F'|' '/ first page| deep page/ && NF>=7 { gsub(/ /,"",$5); if ($5+0 >= 30) bad=1 } END { exit bad }' "$OUT" \
  && echo "PERF OK: every p95 < 30 ms" || { echo "PERF FAIL: a p95 is >= 30 ms"; exit 1; }
