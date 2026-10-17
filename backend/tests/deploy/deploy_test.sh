#!/usr/bin/env bash
# DEPLOY-1: deploy.sh runs migrations and the cron step through the Supabase Management API
# (POST /v1/projects/{ref}/database/query) with only SUPABASE_ACCESS_TOKEN: no `db push`,
# no psql, no SUPABASE_DB_PASSWORD or SUPABASE_DB_URL. Curl and the CLI are stubbed; nothing
# leaves the machine.
#   bash tests/deploy/deploy_test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
ok()  { echo "ok   - $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
check() { if (eval "$2"); then ok "$1"; else bad "$1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
# Stub curl: logs method, URL and body (decoded SQL for database/query); answers the "already applied" query with 0001 only.
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
url=""; method=GET; data=""; fwb=0
while (( $# )); do
  case $1 in
    --fail-with-body) fwb=1 ;;
    -X) method=$2; shift ;;
    -H) shift ;;
    --data-binary) data=$2; shift ;;
    http*) url=$1 ;;
  esac; shift
done
[[ $data == @- ]] && data=$(cat)
# Log the SQL itself for database/query calls (the body is {"query": "..."}).
[[ $url == */database/query ]] && data=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin)["query"])' <<< "$data")
n=$(ls "$STUB_LOG" | wc -l)
printf '%s %s\n%s' "$method" "$url" "$data" > "$STUB_LOG/$(printf %03d "$n")"
# STUB_FAIL_ON: answer a matching query like the API rejecting bad SQL (HTTP 400; curl exits 22).
if [[ -n ${STUB_FAIL_ON:-} && $data == *"$STUB_FAIL_ON"* ]]; then
  (( fwb )) && echo '{"message":"ERROR: 42P01: relation \"stub_missing\" does not exist"}'
  exit 22
fi
if [[ $data == *schema_migrations* && $data == *"select version"* ]]; then echo '[{"version":"0001"}]'; else echo '[]'; fi
STUB
printf '#!/usr/bin/env bash\necho "$*" >> "$STUB_CLI"\n' > "$T/bin/fakecli"
printf '#!/usr/bin/env bash\necho psql >> "$STUB_CLI"; exit 1\n' > "$T/bin/psql"
chmod +x "$T/bin/"*
mkdir -p "$T/log"; echo 'RESEND_API_KEY=x' > "$T/env"
TOKEN=sbp_test_token_do_not_print

# ---- dry run, no secrets at all ----
DRY_OUT=$(env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_DB_PASSWORD -u SUPABASE_DB_URL \
  PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_CLI="$T/cli" bash scripts/deploy.sh --dry-run 2>&1); DRY_RC=$?
check "DEPLOY-1 dry run exits 0 without any secrets" '(( DRY_RC == 0 ))'
check "DEPLOY-1 dry run uses no db push" '[[ $DRY_OUT != *"db push"* ]]'
check "DEPLOY-1 dry run uses no psql" '[[ $DRY_OUT != *psql* ]]'
check "DEPLOY-1 dry run sends migrations and cron to database/query" \
  '(( $(grep -c "api.supabase.com/v1/projects/.*/database/query" <<< "$DRY_OUT") >= 2 ))'
check "DEPLOY-1 dry run lists every migration" \
  'for f in supabase/migrations/*.sql; do [[ $DRY_OUT == *"$(basename "$f")"* ]] || exit 1; done'
check "DEPLOY-1 dry run calls nothing" '[[ -z $(ls "$T/log") && ! -e $T/cli ]]'

# ---- real run against stubs: token only ----
OUT=$(env -u SUPABASE_DB_PASSWORD -u SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN=$TOKEN \
  PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_CLI="$T/cli" SUPABASE_CLI=fakecli \
  DEPLOY_ENV_FILE="$T/env" bash scripts/deploy.sh 2>&1); RC=$?
ALL=$(cat "$T"/log/* 2>/dev/null)
check "DEPLOY-1 deploy succeeds with only SUPABASE_ACCESS_TOKEN" '(( RC == 0 ))' || echo "$OUT" | sed 's/^/     /'
check "DEPLOY-1 never calls psql" '! grep -q psql "$T/cli" 2>/dev/null'
check "DEPLOY-1 never calls db push or link" '! grep -Eq "db push|^link" "$T/cli" 2>/dev/null'
check "DEPLOY-1 still deploys both functions" \
  'grep -q "functions deploy sign-media" "$T/cli" && grep -q "functions deploy notify" "$T/cli"'
check "DEPLOY-1 every SQL call is a POST to database/query" \
  '! grep -h "^POST\|^PATCH\|^GET" "$T"/log/* | grep -v "/config/auth" | grep -vq "^POST https://api.supabase.com/v1/projects/[a-z0-9]*/database/query$"'
check "DEPLOY-1 skips a migration already applied (0001)" \
  '! grep -q "schema_migrations (version, name) values ('"'"'0001'"'"'" "$T"/log/*'
check "DEPLOY-1 applies each pending migration and records it" \
  'for v in 0002 0003 0004 0005 0006 0007 0008 0009; do grep -lq "insert into supabase_migrations.schema_migrations.*$v" "$T"/log/* || exit 1; done'
check "DEPLOY-1 each migration runs in one transaction" \
  'for f in $(grep -l "insert into supabase_migrations.schema_migrations" "$T"/log/*); do grep -q "^begin;" "$f" && grep -q "^commit;" "$f" || exit 1; done'
check "DEPLOY-1 cron step goes through the API" 'grep -q "cron.schedule(.hearth-notify" <<< "$ALL"'
check "DEPLOY-1 never prints the token" '[[ $OUT != *$TOKEN* ]]'
check "DEPLOY-2 function deploys bundle server-side (--use-api, no Docker)" \
  '(( $(grep -c "functions deploy .*--use-api" "$T/cli") == 2 ))'

# ---- a migration the API rejects: stop, and say why ----
rm -rf "$T/log" "$T/cli"; mkdir -p "$T/log"
FOUT=$(env -u SUPABASE_DB_PASSWORD -u SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN=$TOKEN \
  PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_CLI="$T/cli" SUPABASE_CLI=fakecli STUB_FAIL_ON="values ('0003'" \
  DEPLOY_ENV_FILE="$T/env" bash scripts/deploy.sh 2>&1); FRC=$?
check "DEPLOY-3 a rejected migration stops the deploy" '(( FRC != 0 )) && [[ ! -e $T/cli ]]'
check "DEPLOY-3 a rejected migration names the file and shows the API error" \
  '[[ $FOUT == *0003_notifications.sql* && $FOUT == *"stub_missing"* ]]'
check "DEPLOY-3 a rejected migration never prints the token" '[[ $FOUT != *$TOKEN* ]]'

echo "deploy: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
