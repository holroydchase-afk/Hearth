#!/usr/bin/env bash
# Scale test for get_feed and get_timeline (0010). Builds a ~1M-post fixture in a separate DB, then runs bench.sql.
# Usage: tests/perf/run.sh            (needs local Postgres 15+ superuser; ~2-4 min, ~2 GB disk)
#        KEEP=1 tests/perf/run.sh     (reuse an existing fixture DB, only re-run the benchmark)
# Fails (exit 1) if a get_feed p95 is 30 ms or more, or a get_timeline p95 is 5 ms or more.
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
# get_feed p95 < 30 ms; get_timeline (0010) p95 < 5 ms
awk -F'|' '/ first page| deep page/ && NF>=7 { gsub(/ /,"",$5); lim = ($1 ~ /timeline/) ? 5 : 30; if ($5+0 >= lim) bad=1 } END { exit bad }' "$OUT" \
  && echo "PERF OK: every get_feed p95 < 30 ms, every get_timeline p95 < 5 ms" || { echo "PERF FAIL: a p95 is over its target"; exit 1; }
