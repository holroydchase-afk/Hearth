#!/usr/bin/env bash
# D1 / QA-2: scripts/smoke-check.sh is a READ-ONLY check of the hosted project, for the milestone 1 gate's
# "auto criteria green 3x" line (Claude's pick for D1: CI's runs on a real Supabase stack, plus this check on
# hosted, so nothing hosted is wiped). Through the Management API with only SUPABASE_ACCESS_TOKEN: every local
# migration is applied, RLS is on for every public table, the cron jobs exist, both edge functions are active,
# and every function secret is set. It prints secret NAMES only, never values.
# curl is stubbed: database/query runs on a local db inside a READ-ONLY transaction (a write fails the test);
# the functions and secrets endpoints answer from fixture files.
#   bash tests/smoke_check_test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok() { if [ "$1" = 0 ]; then PASS=$((PASS+1)); echo "ok      $2"; else FAIL=$((FAIL+1)); echo "NOT OK  $2"; fi; }

DB=${DB:-hearth_test}_smoke
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
files=(-f tests/supabase_stub.sql)
for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}" >/dev/null 2>&1
DBC="dbname=$DB"
q() { psql "$DBC" -X -q -t -A -c "$1" 2>/dev/null; }
# What deploy.sh leaves behind on hosted: the migrations table and the two cron jobs.
q "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
   create schema if not exists cron; create table cron.job (jobid serial, jobname text, schedule text, command text, active boolean default true);
   insert into cron.job (jobname, schedule, command) values ('hearth-notify', '* * * * *', 'x'), ('hearth-purge-client-errors', '17 4 * * *', 'x');" >/dev/null
for m in supabase/migrations/*.sql; do b=$(basename "$m" .sql); q "insert into supabase_migrations.schema_migrations (version, name) values ('${b%%_*}', '${b#*_}')" >/dev/null; done

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/log"
SECRET_VALUE=SECRETVALUE_do_not_print_123
write_secrets() {  # names... -> fixture, each with the same fake value (the API returns digests; still never print)
  python3 -I -c 'import json, sys; print(json.dumps([{"name": n, "value": sys.argv[1]} for n in sys.argv[2:]]))' "$SECRET_VALUE" "$@" > "$T/secrets.json"
}
ALL_SECRETS=(B2_ENDPOINT B2_REGION B2_BUCKET B2_KEY_ID B2_APP_KEY MEDIA_KEK ALLOWED_ORIGINS RESEND_API_KEY RESEND_FROM NOTIFY_CRON_SECRET
             SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL)
write_secrets "${ALL_SECRETS[@]}"
echo '[{"slug":"sign-media","name":"sign-media","status":"ACTIVE","version":3},{"slug":"notify","name":"notify","status":"ACTIVE","version":3}]' > "$T/functions.json"

cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
url=""; data=""; headers=""; method=GET
while (( $# )); do
  case $1 in
    -H) headers+="$2"$'\n'; shift ;;
    --data-binary) data=$2; method=POST; shift ;;
    -X) method=$2; shift ;;
    http*) url=$1 ;;
  esac; shift
done
[[ $data == @- ]] && data=$(cat)
printf '%s %s\n%s\n%s\n' "$method" "$url" "$headers" "$data" >> "$STUB_LOG/requests"
case "$method $url" in
  "POST https://api.supabase.com/v1/projects/"*/database/query)
    sql=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin)["query"])' <<< "$data")
    if out=$(PGOPTIONS='-c default_transaction_read_only=on' "$REAL_PSQL" "$STUB_DB" -X -q -t -A -F $'\t' -v ON_ERROR_STOP=1 -c "$sql" 2>"$STUB_LOG/err"); then
      python3 -I -c '
import json, sys
rows = [l.split("\t") for l in sys.stdin.read().splitlines() if l]
print(json.dumps([{"check": r[0], "ok": r[1] == "t", "detail": r[2] if len(r) > 2 else ""} for r in rows]))' <<< "$out"
    else
      echo "write or error: $(cat "$STUB_LOG/err")" >> "$STUB_LOG/sqlerr"
      python3 -I -c 'import json, sys; print(json.dumps({"message": sys.stdin.read().strip()}))' < "$STUB_LOG/err"; exit 22
    fi ;;
  "GET https://api.supabase.com/v1/projects/"*/functions) cat "$STUB_FIX/functions.json" ;;
  "GET https://api.supabase.com/v1/projects/"*/secrets) cat "$STUB_FIX/secrets.json" ;;
  *) echo '{"message":"unexpected request"}'; echo "unexpected: $method $url" >> "$STUB_LOG/unexpected"; exit 22 ;;
esac
STUB
chmod +x "$T/bin/curl"
printf '#!/usr/bin/env bash\necho "psql was called" >> "$STUB_LOG/psql"; exit 1\n' > "$T/bin/psql"
chmod +x "$T/bin/psql"
REAL_PSQL=$(command -v psql)
TOKEN=sbp_smoke_test_token_do_not_print
run() { env -u SUPABASE_DB_URL PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_FIX="$T" STUB_DB="$DBC" REAL_PSQL="$REAL_PSQL" SUPABASE_ACCESS_TOKEN=$TOKEN \
          bash scripts/smoke-check.sh "$@" 2>&1; }
fingerprint() { q "select md5(string_agg(x, '|' order by x)) from (select version x from supabase_migrations.schema_migrations
                   union all select jobname from cron.job union all select relname || relrowsecurity from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') z"; }

# ---- preflight ----
test -f scripts/smoke-check.sh; ok $? "D1 smoke: backend/scripts/smoke-check.sh exists"
out=$(env -u SUPABASE_ACCESS_TOKEN PATH="$T/bin:$PATH" STUB_LOG="$T/log" bash scripts/smoke-check.sh 2>&1); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "SUPABASE_ACCESS_TOKEN"; ok $? "D1 smoke: without SUPABASE_ACCESS_TOKEN it stops and names the secret"

# ---- all good ----
before=$(fingerprint)
: > "$T/log/requests"
out=$(run); rc=$?
echo "$out" | sed 's/^/        | /'
ok $rc "D1 smoke: a healthy project passes (exit 0)"
echo "$out" | grep -q "^SMOKE RESULT: [0-9]* ok, 0 failed"; ok $? "D1 smoke: ends with \"SMOKE RESULT: N ok, 0 failed\""
n=$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')
echo "$out" | grep -q "^ok  *all $n migrations applied"; ok $? "D1 smoke: says all $n local migrations are applied"
! echo "$out" | grep -q "$SECRET_VALUE"; ok $? "D1 smoke: never prints a secret value"
! echo "$out" | grep -q "$TOKEN"; ok $? "D1 smoke: never prints the token"
[ ! -s "$T/log/sqlerr" ]; ok $? "D1 smoke: its SQL runs inside a read-only transaction (no write attempted)"
! grep -qE '^(PATCH|DELETE|PUT) ' "$T/log/requests" && ! grep -qE '^POST ' <(grep -E '^POST ' "$T/log/requests" | grep -v '/database/query'); ok $? "D1 smoke: only GETs and the read-only query call"
grep -q "Authorization: Bearer $TOKEN" "$T/log/requests"; ok $? "D1 smoke: the token goes in the Authorization header"
[ ! -f "$T/log/psql" ] && [ ! -f "$T/log/unexpected" ]; ok $? "D1 smoke: no psql, no unexpected endpoint"
[ "$before" = "$(fingerprint)" ]; ok $? "D1 smoke: changes nothing"

# ---- each kind of problem fails and names what's wrong ----
q "delete from supabase_migrations.schema_migrations where version = (select max(version) from supabase_migrations.schema_migrations)" >/dev/null
last=$(basename "$(ls supabase/migrations/*.sql | tail -1)" .sql)
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*${last%%_*}"; ok $? "D1 smoke: a migration not applied on hosted fails and names it (${last%%_*})"
q "insert into supabase_migrations.schema_migrations (version, name) values ('${last%%_*}', '${last#*_}')" >/dev/null

q "create table public.smoke_no_rls (id int)" >/dev/null
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*smoke_no_rls"; ok $? "D1 smoke: a public table without RLS fails and names it"
q "drop table public.smoke_no_rls" >/dev/null

q "delete from cron.job where jobname = 'hearth-notify'" >/dev/null
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*hearth-notify"; ok $? "D1 smoke: a missing cron job fails and names it"
q "insert into cron.job (jobname, schedule, command) values ('hearth-notify', '* * * * *', 'x')" >/dev/null

echo '[{"slug":"notify","name":"notify","status":"ACTIVE","version":3}]' > "$T/functions.json"
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*sign-media"; ok $? "D1 smoke: a missing edge function fails and names it"
echo '[{"slug":"sign-media","status":"ACTIVE"},{"slug":"notify","status":"THROTTLED"}]' > "$T/functions.json"
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*notify"; ok $? "D1 smoke: an edge function that isn't ACTIVE fails"
echo '[{"slug":"sign-media","status":"ACTIVE"},{"slug":"notify","status":"ACTIVE"}]' > "$T/functions.json"

write_secrets $(printf '%s\n' "${ALL_SECRETS[@]}" | grep -v '^MEDIA_KEK$')
out=$(run); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "^FAIL.*MEDIA_KEK"; ok $? "D1 smoke: a missing function secret fails and names it (MEDIA_KEK)"
! echo "$out" | grep -q "$SECRET_VALUE"; ok $? "D1 smoke: ... and still prints no secret value"

write_secrets "${ALL_SECRETS[@]}" HEARTH_KEYS_PENDING
out=$(run); rc=$?
[ $rc = 0 ] && echo "$out" | grep -q "^warn.*HEARTH_KEYS_PENDING"; ok $? "D1 smoke: the leftover placeholder secret is a warning to clean up, not a failure"

# Supabase Auth's own audit log (auth.audit_log_entries) can hold IP addresses inside our database (PRIV-1 gap)
out=$(run); echo "$out" | grep -q "^ok .*no IP addresses in Supabase Auth's audit log"; ok $? "PRIV-1 smoke: no auth audit table (or no IPs in it) reads as ok"
q "create table if not exists auth.audit_log_entries (instance_id uuid, id uuid, payload json, created_at timestamptz, ip_address varchar(64) not null default '');
   insert into auth.audit_log_entries (id, ip_address, created_at) values (gen_random_uuid(), '203.0.113.5', now()), (gen_random_uuid(), '', now())" >/dev/null
out=$(run); rc=$?
[ $rc = 0 ] && echo "$out" | grep -q "^warn .*1 row.* IP address"; ok $? "PRIV-1 smoke: IP addresses in Supabase Auth's audit log are a warning with a count"
! echo "$out" | grep -q "203.0.113.5"; ok $? "PRIV-1 smoke: ... and the address itself is never printed"

dropdb --if-exists "$DB" 2>/dev/null
echo
echo "SMOKE CHECK TEST RESULT: $PASS passed, $FAIL failed"
[ $FAIL = 0 ]
