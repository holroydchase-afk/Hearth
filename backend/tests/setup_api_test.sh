#!/usr/bin/env bash
# SETUP-API: scripts/family-setup.sh sets up Chase's family in the 0011 shape through the Supabase
# Management API (POST /v1/projects/{ref}/database/query) with only SUPABASE_ACCESS_TOKEN: no psql, no
# SUPABASE_DB_URL. It runs AS CHASE through the same RPCs and RLS the app uses, and refuses once anyone
# else has joined (then it could change who sees what; that's family-setup-v2.sql's dry run).
# curl is stubbed: the stub runs the API's SQL with psql against a local test database, so the SQL is real.
#   bash tests/setup_api_test.sh            (fresh local db, like tests/run.sh)
#   SETUP_TEST_DB_URL=postgresql://... bash tests/setup_api_test.sh   (an already-reset db, e.g. supabase start)
set -uo pipefail
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok() { if [ "$1" = 0 ]; then PASS=$((PASS+1)); echo "ok      $2"; else FAIL=$((FAIL+1)); echo "NOT OK  $2"; fi; }

if [ -n "${SETUP_TEST_DB_URL:-}" ]; then
  DBC=$SETUP_TEST_DB_URL
else
  DB=${DB:-hearth_test}_setup_api
  dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
  files=(-f tests/supabase_stub.sql)
  for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
  psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}" -f supabase/seed.sql >/dev/null 2>&1
  DBC="dbname=$DB"
fi
q() { psql "$DBC" -X -q -t -A -c "$1" 2>/dev/null; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/log"
# Stub curl: like the Management API, runs the posted SQL (one request) and answers with the last
# statement's rows as JSON, or HTTP 400 {"message": "..."} (curl exit 22) on an error. Logs every request.
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
url=""; data=""; headers=""
while (( $# )); do
  case $1 in
    -H) headers+="$2"$'\n'; shift ;;
    --data-binary) data=$2; shift ;;
    -X) shift ;;
    http*) url=$1 ;;
  esac; shift
done
[[ $data == @- ]] && data=$(cat)
printf '%s\n%s\n%s' "$url" "$headers" "$data" >> "$STUB_LOG/requests"
[[ $url == https://api.supabase.com/v1/projects/*/database/query ]] || { echo '{"message":"unexpected url"}'; exit 22; }
sql=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin)["query"])' <<< "$data")
if out=$("$REAL_PSQL" "$STUB_DB" -X -q -t -A -v ON_ERROR_STOP=1 -c "$sql" 2>"$STUB_LOG/err"); then
  python3 -I -c 'import json, sys; print(json.dumps([{"line": l} for l in sys.stdin.read().splitlines() if l]))' <<< "$out"
else
  python3 -I -c 'import json, sys; print(json.dumps({"message": sys.stdin.read().strip()}))' < "$STUB_LOG/err"; exit 22
fi
STUB
chmod +x "$T/bin/curl"
# The script itself must never need psql: a psql on its PATH only logs and fails.
printf '#!/usr/bin/env bash\necho "psql was called" >> "$STUB_LOG/psql"; exit 1\n' > "$T/bin/psql"
chmod +x "$T/bin/psql"
REAL_PSQL=$(command -v psql)
TOKEN=sbp_setup_test_token_do_not_print
setup() { env -u SUPABASE_DB_URL PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_DB="$DBC" REAL_PSQL="$REAL_PSQL" SUPABASE_ACCESS_TOKEN=$TOKEN \
            bash scripts/family-setup.sh "$@" 2>&1; }
fingerprint() { q "select md5(coalesce(string_agg(x, '|' order by x), '')) from (
  select 'c' || id || name || coalesce(deleted_at::text, '') x from public.circles
  union all select 's' || id from public.spaces union all select 'i' || id from public.invites
  union all select 'l' || parent_id || child_id from public.circle_links) z"; }

# ---- 0. preflight ----
test -f scripts/family-setup.sh; ok $? "SETUP-API: backend/scripts/family-setup.sh exists"
out=$(env -u SUPABASE_ACCESS_TOKEN PATH="$T/bin:$PATH" STUB_LOG="$T/log" bash scripts/family-setup.sh \
      --chase-email chase@example.com --space-name 'Our kids' 2>&1); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "SUPABASE_ACCESS_TOKEN"; ok $? "SETUP-API: without SUPABASE_ACCESS_TOKEN it stops and names the secret"
out=$(setup --space-name 'Our kids'); rc=$?
[ $rc != 0 ] && echo "$out" | grep -qi "chase-email"; ok $? "SETUP-API: without --chase-email it stops and says what's missing"

# ---- 1. Chase hasn't signed in yet ----
before=$(fingerprint)
out=$(setup --chase-email chase@example.com --space-name 'Our kids'); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "sign in once in the app"; ok $? "SETUP-API: before Chase has an account it says \"sign in once in the app\" and fails"
[ "$before" = "$(fingerprint)" ]; ok $? "SETUP-API: ... and changes nothing"

q "insert into auth.users (id, email, raw_user_meta_data) values
   ('e0000000-0000-0000-0000-0000000000e1', 'Chase@Example.com', '{\"display_name\":\"Chase\"}'),
   ('e0000000-0000-0000-0000-0000000000e2', 'tester@example.com', '{\"display_name\":\"Test viewer\"}'),
   ('e0000000-0000-0000-0000-0000000000e3', 'mom@example.com', '{\"display_name\":\"Mom\"}')" >/dev/null

# ---- 2. fresh setup ----
: > "$T/log/requests"
out=$(setup --chase-email chase@example.com --space-name "Chase's kids" --mom-email mom@example.com); rc=$?
ok $rc "SETUP-API: fresh setup runs without error"
echo "$out" | sed 's/^/        | /'
SPACE=$(q "select id from public.spaces where name = 'Chase''s kids'")
[ -n "$SPACE" ] && [ "$(q "select count(*) from public.space_members where space_id = '$SPACE' and role = 'owner' and user_id = 'e0000000-0000-0000-0000-0000000000e1'")" = 1 ]
ok $? "SETUP-API: Chase owns one family, named as given (an apostrophe in the name is kept, not a SQL error)"
[ "$(q "select count(*) from public.circles where space_id = '$SPACE' and kind = 'everyone'")" = 1 ]; ok $? "SETUP-API: one Everyone"
[ "$(q "select string_agg(name, ',' order by name) from public.circles where space_id = '$SPACE' and kind = 'group'")" = "Chase's side,Mom's side" ]
ok $? "SETUP-API: the set groups are Chase's side and Mom's side (no v1 groups to retire later)"
[ "$(q "select string_agg(name, ',' order by name) from public.circles where space_id = '$SPACE' and kind = 'household'")" = \
  "Gammy's house,Gigi and Bebar's house,Grandaddy and Grandmomma's house,Great-Grandma's house,Memaw's house,Pawpaw and Granny's house,Test house" ]
ok $? "SETUP-API: the family's houses (SPEC-GROUPS section 2) plus a Test house for account B"
[ "$(q "select string_agg(name, ',' order by name) from public.circles where space_id = '$SPACE' and kind = 'event'")" = "Birthday at Gigi's,Charleston trip" ]
ok $? "SETUP-API: the Charleston trip and Birthday at Gigi's events"
[ "$(q "select count(*) from public.circle_links l join public.circles g on g.id = l.parent_id join public.circles h on h.id = l.child_id
        where g.space_id = '$SPACE' and g.name = 'Chase''s side' and h.name in ('Gammy''s house', 'Grandaddy and Grandmomma''s house', 'Gigi and Bebar''s house')")" = 3 ]
ok $? "SETUP-API: Chase's parents' houses sit under Chase's side"
[ "$(q "select count(*) from public.circle_links l join public.circles h on h.id = l.child_id where h.space_id = '$SPACE' and h.name = 'Test house'")" = 0 ]
ok $? "SETUP-API: the Test house is under no group or event (account B sees only Everyone and Test house posts)"
[ "$(q "select count(*) from public.circles where space_id = '$SPACE' and created_by is distinct from 'e0000000-0000-0000-0000-0000000000e1'")" = 0 ]
ok $? "SETUP-API: everything is made as Chase (through the app's RPCs, not as the database owner)"
code=$(echo "$out" | sed -n 's/^Test viewer invite (account B): code \([A-Z0-9]\{10\}\).*/\1/p' | head -1)
[ -n "$code" ]; ok $? "SETUP-API: prints the test viewer's 10-letter invite code"
echo "$out" | grep -q "^Mom's poster invite: code [A-Z0-9]\{10\}"; ok $? "SETUP-API: prints Mom's poster invite code when --mom-email is given"
[ "$(q "select role || ':' || coalesce(target_email, '') from public.invites where space_id = '$SPACE' and role = 'adult'")" = "adult:mom@example.com" ]
ok $? "SETUP-API: Mom's invite is a poster (adult) invite for her email"
[ "$(q "select string_agg(c.name || ':' || i.history, ',' order by c.name) from public.invites i join public.invite_circles ic on ic.invite_id = i.id join public.circles c on c.id = ic.circle_id
        where i.space_id = '$SPACE' and i.role = 'viewer'")" = "Everyone:all,Test house:all" ]
ok $? "SETUP-API / PRIV-G2: the test viewer's invite names Everyone and the Test house (a new invite adds Everyone only if named) and says \"all past photos\""
echo "$out" | grep -q "is ready"; ok $? "SETUP-API: says the family is ready"

# the token stays in a header; only the Management API is called; no psql, no database URL
n=$(grep -c '^https://' "$T/log/requests"); [ "$n" = 1 ]; ok $? "SETUP-API: one Management API request (got $n)"
grep -q "Authorization: Bearer $TOKEN" "$T/log/requests"; ok $? "SETUP-API: the token goes in the Authorization header"
! echo "$out" | grep -q "$TOKEN"; ok $? "SETUP-API: the token is never printed"
[ ! -f "$T/log/psql" ]; ok $? "SETUP-API: psql is never called"

# ---- 3. safe to re-run before anyone joins ----
n1=$(q "select count(*) from public.circles where space_id = '$SPACE'")
out=$(setup --chase-email chase@example.com --space-name "Chase's kids"); rc=$?
ok $rc "SETUP-API: re-running runs without error"
[ "$n1" = "$(q "select count(*) from public.circles where space_id = '$SPACE'")" ] && [ "$(q "select count(*) from public.spaces where name = 'Chase''s kids'")" = 1 ]
ok $? "SETUP-API: re-running adds no family, group, house or event"
echo "$out" | grep -q "^Test viewer invite (account B): code [A-Z0-9]\{10\}"; ok $? "SETUP-API: re-running prints a fresh test viewer code"
! echo "$out" | grep -q "^Mom's"; ok $? "SETUP-API: no Mom invite unless --mom-email is given"

# ---- 4. account B joins with the code and sees only what it should (BETA-AUD-1 in the 0011 shape) ----
q "select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000e2', false);
   set role authenticated; select public.redeem_invite(p_code => '$code')" >/dev/null
[ "$(q "select count(*) from public.circle_people cp join public.circles h on h.id = cp.circle_id
        where h.name = 'Test house' and cp.user_id = 'e0000000-0000-0000-0000-0000000000e2'")" = 1 ]
ok $? "SETUP-API: account B's code places it in the Test house"
q "insert into public.posts (id, space_id, author_id, caption, status) values
     ('f0000000-0000-0000-0000-0000000000f1', '$SPACE', 'e0000000-0000-0000-0000-0000000000e1', 'test', 'draft'),
     ('f0000000-0000-0000-0000-0000000000f2', '$SPACE', 'e0000000-0000-0000-0000-0000000000e1', 'gammy', 'draft');
   insert into public.post_audiences (post_id, circle_id) values
     ('f0000000-0000-0000-0000-0000000000f1', (select id from public.circles where space_id = '$SPACE' and name = 'Test house')),
     ('f0000000-0000-0000-0000-0000000000f2', (select id from public.circles where space_id = '$SPACE' and name = 'Gammy''s house'));
   insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key, width, height, byte_size, thumb_byte_size, exif_stripped)
   select id, space_id, author_id, 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true from public.posts where space_id = '$SPACE';
   update public.media_items set upload_status = 'ready' where space_id = '$SPACE';
   update public.posts set status = 'published' where space_id = '$SPACE'" >/dev/null
sees() { q "select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000e2', false);
            set role authenticated; select public.can_view_post('$1')" | tail -1; }
[ "$(sees f0000000-0000-0000-0000-0000000000f1)" = t ] && [ "$(sees f0000000-0000-0000-0000-0000000000f2)" = f ]
ok $? "SETUP-API: account B sees a Test house post and not a Gammy's house post"

# ---- 5. once anyone else has joined, it refuses and changes nothing ----
before=$(fingerprint)
out=$(setup --chase-email chase@example.com --space-name "Chase's kids"); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "family-setup-v2.sql"; ok $? "SETUP-API: once someone else has joined, it stops and points to family-setup-v2.sql's dry run"
[ "$before" = "$(fingerprint)" ]; ok $? "SETUP-API: ... and changes nothing (no new invite either)"

# ---- 6. --print-sql shows the request and sends nothing ----
: > "$T/log/requests"
out=$(env -u SUPABASE_ACCESS_TOKEN PATH="$T/bin:$PATH" STUB_LOG="$T/log" bash scripts/family-setup.sh --print-sql \
      --chase-email "x'); drop table public.posts; --@example.com" --space-name 'Our kids' 2>&1); rc=$?
ok $rc "SETUP-API: --print-sql works without the token"
[ ! -s "$T/log/requests" ]; ok $? "SETUP-API: --print-sql sends nothing"
echo "$out" | grep -qF "'x''); drop table public.posts; --@example.com'"; ok $? "SETUP-API: values are SQL-quoted (a quote in an email can't end the string)"

[ -z "${SETUP_TEST_DB_URL:-}" ] && dropdb --if-exists "$DB" 2>/dev/null
echo
echo "SETUP API RESULT: $PASS passed, $FAIL failed"
[ $FAIL = 0 ]
