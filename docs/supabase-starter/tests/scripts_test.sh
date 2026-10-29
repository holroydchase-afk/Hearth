#!/usr/bin/env bash
# STARTER-DEPLOY and STARTER-SMOKE: the starter's deploy.sh and smoke-check.sh, run against a
# made-up project folder. curl and the Supabase CLI are stubbed, so nothing leaves the machine.
# smoke-check's SQL runs for real on a throwaway local database in a read-only transaction.
#   bash docs/supabase-starter/tests/scripts_test.sh     (needs a local Postgres 15+ and python3)
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
check() { if (eval "$2"); then echo "ok   - $1"; PASS=$((PASS + 1)); else echo "FAIL - $1"; FAIL=$((FAIL + 1)); fi; }

T=$(mktemp -d); DB=starter_smoke_$$
trap 'rm -rf "$T"; dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT
P=$T/project; mkdir -p "$P/supabase/migrations" "$P/supabase/functions/"{_shared,hello,hook} "$T/bin" "$T/log"
echo "create table public.notes (id int primary key); alter table public.notes enable row level security;" > "$P/supabase/migrations/0001_notes.sql"
echo "create table public.tags (id int primary key);" > "$P/supabase/migrations/0002_tags.sql"
printf 'RESEND_API_KEY=\nAPP_ORIGIN=\nOPTIONAL_THING=\n' > "$P/supabase/functions/.env.example"
echo 'RESEND_API_KEY=x' > "$P/supabase/functions/.env"
TOKEN=sbp_test_token_do_not_print; SECRET=SECRETVALUE_do_not_print

# Stub curl: logs every call. database/query: the "applied" list answers 0001, smoke-check's
# SQL runs on the local db read-only (rows as JSON, like the API), everything else answers []. GET /functions and
# /secrets answer from fixture files.
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
url=""; method=GET; data=""
while (( $# )); do
  case $1 in -X) method=$2; shift ;; -H) shift ;; --data-binary) data=$2; shift ;; http*) url=$1 ;; esac; shift
done
[[ $data == @- ]] && data=$(cat)
[[ $url == */database/query ]] && data=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin)["query"])' <<< "$data")
n=$(ls "$STUB_LOG" | wc -l); printf '%s %s\n%s' "$method" "$url" "$data" > "$STUB_LOG/$(printf %03d "$n")"
if [[ -n ${STUB_FAIL_ON:-} && $data == *"$STUB_FAIL_ON"* ]]; then echo '{"message":"ERROR: 42P01: relation \"stub_missing\" does not exist"}'; exit 22; fi
case $url in
  */functions) cat "$STUB_FIX/functions.json" ;;
  */secrets) cat "$STUB_FIX/secrets.json" ;;
  */database/query)
    if [[ $data == *"smoke-check"* ]]; then PGOPTIONS='-c default_transaction_read_only=on' psql -X -q -t -A -d "$STUB_DB" -c "select coalesce(json_agg(q), '[]') from ($data
) q"
    elif [[ $data == *"select version"* ]]; then echo '[{"version":"0001"}]'
    else echo '[]'; fi ;;
  *) echo '[]' ;;
esac
STUB
printf '#!/usr/bin/env bash\necho "$*" >> "$STUB_CLI"\n' > "$T/bin/fakecli"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_CLI="$T/cli" STUB_FIX="$T" STUB_DB="$DB" SUPABASE_CLI=fakecli PROJECT_DIR="$P"

# ---------- deploy.sh ----------
OUT=$(env -u SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF=abc123 bash "$here/scripts/deploy.sh" --dry-run 2>&1); RC=$?
check "STARTER-DEPLOY-1 dry run needs no token and calls nothing" '(( RC == 0 )) && [[ -z $(ls "$T/log") && ! -e $T/cli ]]'
check "STARTER-DEPLOY-1 dry run lists every migration and function" \
  '[[ $OUT == *0001_notes.sql* && $OUT == *0002_tags.sql* && $OUT == *"deploy hello"* && $OUT == *"deploy hook"* ]]'
OUT=$(env -u SUPABASE_PROJECT_REF SUPABASE_ACCESS_TOKEN=$TOKEN bash "$here/scripts/deploy.sh" 2>&1); RC=$?
check "STARTER-DEPLOY-2 refuses without SUPABASE_PROJECT_REF (no Hearth default)" '(( RC != 0 )) && [[ $OUT == *SUPABASE_PROJECT_REF* ]]'

OUT=$(SUPABASE_PROJECT_REF=abc123 SUPABASE_ACCESS_TOKEN=$TOKEN DEPLOY_NO_VERIFY_JWT=hook bash "$here/scripts/deploy.sh" 2>&1); RC=$?
check "STARTER-DEPLOY-3 deploys with only the token" '(( RC == 0 ))' || echo "$OUT" | sed 's/^/     /'
check "STARTER-DEPLOY-3 skips the applied migration, applies and records the rest in one transaction" \
  '! grep -q "values ('"'"'0001'"'"'" "$T"/log/* && f=$(grep -l "values ('"'"'0002'"'"'" "$T"/log/*) && grep -q "^begin;" $f && grep -q "^commit;" $f'
check "STARTER-DEPLOY-3 every SQL call goes to this project's database/query" \
  '! grep -h "^POST" "$T"/log/* | grep -vq "^POST https://api.supabase.com/v1/projects/abc123/database/query$"'
check "STARTER-DEPLOY-3 deploys every function folder but _shared, server-side" \
  'grep -q "functions deploy hello --project-ref abc123 --use-api$" "$T/cli" && grep -q "functions deploy hook .*--no-verify-jwt" "$T/cli" && ! grep -q _shared "$T/cli"'
check "STARTER-DEPLOY-3 sets function secrets from the env file" 'grep -q "secrets set --project-ref abc123 --env-file" "$T/cli"'
check "STARTER-DEPLOY-3 never prints the token" '[[ $OUT != *$TOKEN* ]]'

echo 'SUPABASE_SERVICE_ROLE_KEY=x' >> "$P/supabase/functions/.env"
OUT=$(SUPABASE_PROJECT_REF=abc123 SUPABASE_ACCESS_TOKEN=$TOKEN bash "$here/scripts/deploy.sh" 2>&1); RC=$?
check "STARTER-DEPLOY-4 refuses SUPABASE_* keys in the env file" '(( RC != 0 )) && [[ $OUT == *"must not contain SUPABASE_"* ]]'
echo 'RESEND_API_KEY=x' > "$P/supabase/functions/.env"

rm -rf "$T/log" "$T/cli"; mkdir -p "$T/log"
OUT=$(SUPABASE_PROJECT_REF=abc123 SUPABASE_ACCESS_TOKEN=$TOKEN STUB_FAIL_ON="values ('0002'" bash "$here/scripts/deploy.sh" 2>&1); RC=$?
check "STARTER-DEPLOY-5 a rejected migration stops before functions, naming the file and the error" \
  '(( RC != 0 )) && [[ ! -e $T/cli && $OUT == *0002_tags.sql* && $OUT == *stub_missing* && $OUT != *$TOKEN* ]]'

# ---------- smoke-check.sh ----------
rm -rf "$T/log"; mkdir -p "$T/log"
createdb "$DB" && psql -X -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version) values ('0001'), ('0002');
create table public.notes (id int primary key); alter table public.notes enable row level security;
create table public.tags (id int primary key); alter table public.tags enable row level security;
create schema cron; create table cron.job (jobname text, active boolean default true);
insert into cron.job (jobname) values ('nightly');
SQL
secrets() { python3 -I -c 'import json, sys; print(json.dumps([{"name": n, "value": sys.argv[1]} for n in sys.argv[2:]]))' "$SECRET" "$@" > "$T/secrets.json"; }
secrets RESEND_API_KEY APP_ORIGIN SUPABASE_URL
echo '[{"slug":"hello","status":"ACTIVE"},{"slug":"hook","status":"ACTIVE"}]' > "$T/functions.json"
smoke() { SUPABASE_PROJECT_REF=abc123 SUPABASE_ACCESS_TOKEN=$TOKEN SMOKE_OPTIONAL_SECRETS=OPTIONAL_THING SMOKE_CRON_JOBS=nightly bash "$here/scripts/smoke-check.sh" 2>&1; }

OUT=$(smoke); RC=$?
check "STARTER-SMOKE-1 all green passes" '(( RC == 0 ))' || echo "$OUT" | sed 's/^/     /'
check "STARTER-SMOKE-1 reports migrations, RLS, functions, secrets and cron" \
  '[[ $OUT == *"all 2 migrations applied"* && $OUT == *"RLS is on"* && $OUT == *"hello is active"* && $OUT == *"all 2 function secrets"* && $OUT == *"cron job nightly"* ]]'
check "STARTER-SMOKE-1 never prints a secret value or the token" '[[ $OUT != *$SECRET* && $OUT != *$TOKEN* ]]'
check "STARTER-SMOKE-1 only reads (POST is database/query, the rest GET)" \
  '! head -qn1 "$T"/log/* | grep -v "^GET " | grep -vq "^POST .*/database/query$"'

psql -X -q -d "$DB" -c "alter table public.tags disable row level security; delete from supabase_migrations.schema_migrations where version = '0002'; update cron.job set active = false" >/dev/null
secrets RESEND_API_KEY
echo '[{"slug":"hello","status":"ACTIVE"}]' > "$T/functions.json"
OUT=$(smoke); RC=$?
check "STARTER-SMOKE-2 fails and names each problem" \
  '(( RC == 1 )) && [[ $OUT == *"not applied on hosted: 0002"* && $OUT == *"RLS is off on: tags"* && $OUT == *"hook is not deployed"* && $OUT == *"not set: APP_ORIGIN"* && $OUT == *"nightly is missing or paused"* ]]'
check "STARTER-SMOKE-2 an optional secret is not required" '[[ $OUT != *OPTIONAL_THING* ]]'

echo "starter scripts: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
