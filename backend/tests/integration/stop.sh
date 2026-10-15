#!/usr/bin/env bash
# Stop the harness started by start.sh. Drops the harness DB unless --keep-db.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
STATE="$HERE/.state"
DB=${HARNESS_DB:-hearth_it}
if [[ -f "$STATE/postgrest.pid" ]]; then
  pid=$(cat "$STATE/postgrest.pid")
  if kill "$pid" 2>/dev/null; then
    for _ in $(seq 1 25); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    echo "[harness] stopped PostgREST (pid $pid)" >&2
  fi
  rm -f "$STATE/postgrest.pid"
fi
if [[ "${1:-}" != "--keep-db" ]]; then
  dropdb --if-exists "$DB" >&2 && echo "[harness] dropped $DB" >&2
  rm -f "$STATE/harness.json"
fi
exit 0
