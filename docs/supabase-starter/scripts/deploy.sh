#!/usr/bin/env bash
# One-command deploy to a hosted Supabase project, with only a personal access token: no Docker,
# no database password, no `supabase link`. From Hearth's backend/scripts/deploy.sh.
#   SUPABASE_PROJECT_REF=<ref> bash scripts/deploy.sh --dry-run   # print every step, change nothing
#   SUPABASE_PROJECT_REF=<ref> bash scripts/deploy.sh             # do it
# Needs SUPABASE_ACCESS_TOKEN as an environment secret (never in chat or git), and
# supabase/functions/.env filled from .env.example when functions have secrets.
# 1. Migrations go through the Management API (POST /v1/projects/{ref}/database/query), each in
#    one transaction, recorded in supabase_migrations.schema_migrations, the table `db push` uses.
# 2. Function secrets come from the env file; SUPABASE_* names are refused (Supabase injects them).
# 3. Every folder in supabase/functions/ except _shared is deployed, bundled by Supabase (--use-api).
#    DEPLOY_NO_VERIFY_JWT="a b" deploys those without the JWT check (webhooks, cron targets).
# Never loads seed data and never runs tests (they reset the database). Product extras (cron jobs,
# auth email templates) go after step 3; Hearth's deploy.sh shows both.
set -euo pipefail
cd "${PROJECT_DIR:-$(dirname "$0")/..}"

DRY=0; [[ ${1:-} == --dry-run ]] && DRY=1
die() { echo "deploy: $*" >&2; exit 1; }
REF=${SUPABASE_PROJECT_REF:-}; [[ -n $REF ]] || die "set SUPABASE_PROJECT_REF (Project Settings > General > Project ID)"
CLI=${SUPABASE_CLI:-npx --yes supabase@2.121.0}
API=https://api.supabase.com/v1/projects/$REF/database/query
ENV_FILE=${DEPLOY_ENV_FILE:-supabase/functions/.env}
NO_JWT=" ${DEPLOY_NO_VERIFY_JWT:-} "

run() { if (( DRY )); then echo "+ $*"; else "$@"; fi; }
# SQL on stdin through the Management API; prints the JSON rows. The token stays in a header.
sql() {
  local out
  if out=$(python3 -I -c 'import json, sys; sys.stdout.write(json.dumps({"query": sys.stdin.read()}))' |
    curl -sS --fail-with-body -X POST "$API" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @-); then
    echo "$out"
  else echo "deploy: API said: $out" >&2; return 1; fi
}

# ---- preflight (never prints secret values) ----
[[ -n ${SUPABASE_ACCESS_TOKEN:-} ]] || (( DRY )) || die "missing SUPABASE_ACCESS_TOKEN (add it as an environment secret)"
if [[ -f $ENV_FILE ]] && grep -Eq '^SUPABASE_' "$ENV_FILE"; then
  die "$ENV_FILE must not contain SUPABASE_* keys (Supabase injects them; never store service_role here)"
fi

echo "== 1/3 migrations via POST $API"
TRACK="create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);"
if (( DRY )); then APPLIED=""
else APPLIED=$( { echo "$TRACK"; echo "select version from supabase_migrations.schema_migrations;"; } | sql |
  python3 -I -c 'import json, sys; print(" ".join(r["version"] for r in json.load(sys.stdin)))'); fi
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql); v=${base%%_*}; name=${base#*_}
  if [[ " $APPLIED " == *" $v "* ]]; then echo "   $base.sql already applied"; continue; fi
  if (( DRY )); then echo "+ POST $API ($base.sql, $(wc -c < "$f") bytes, one transaction)"; continue; fi
  echo "   applying $base.sql"
  { echo "begin;"; cat "$f"; echo; echo ";"
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$name');"
    echo "commit;"; } | sql >/dev/null || die "migration $base.sql failed (rolled back)"
done

echo "== 2/3 function secrets"
if [[ -f $ENV_FILE ]]; then run $CLI secrets set --project-ref "$REF" --env-file "$ENV_FILE"; else echo "   no $ENV_FILE, skipped"; fi

echo "== 3/3 edge functions (bundled by Supabase, no Docker)"
for d in supabase/functions/*/; do
  fn=$(basename "$d"); [[ $fn == _* ]] && continue
  if [[ $NO_JWT == *" $fn "* ]]; then run $CLI functions deploy "$fn" --project-ref "$REF" --no-verify-jwt --use-api
  else run $CLI functions deploy "$fn" --project-ref "$REF" --use-api; fi
done

echo "deploy: done. Check it with: bash scripts/smoke-check.sh"
