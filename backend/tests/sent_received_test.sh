#!/usr/bin/env bash
# QA-3 (milestone 1 gate, "0 lost"): scripts/sent-vs-received.sh compares the posts a sender shared against
# the posts a receiver (account B) can actually see, through the Management API with only
# SUPABASE_ACCESS_TOKEN, like family-setup.sh. "Received" is checked AS THE RECEIVER through RLS, so it
# counts what B's Photos can show, not what the database holds. It prints ids, counts and times only:
# never a caption, email, URL or key.
# curl is stubbed (same stub as setup_api_test.sh): the stub runs the API's SQL with psql on a local db.
#   bash tests/sent_received_test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok() { if [ "$1" = 0 ]; then PASS=$((PASS+1)); echo "ok      $2"; else FAIL=$((FAIL+1)); echo "NOT OK  $2"; fi; }

DB=${DB:-hearth_test}_sent_received
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
files=(-f tests/supabase_stub.sql)
for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}" -f supabase/seed.sql >/dev/null 2>&1
DBC="dbname=$DB"
q() { psql "$DBC" -X -q -t -A -c "$1" 2>/dev/null; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/log"
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
printf '#!/usr/bin/env bash\necho "psql was called" >> "$STUB_LOG/psql"; exit 1\n' > "$T/bin/psql"
chmod +x "$T/bin/psql"
REAL_PSQL=$(command -v psql)
TOKEN=sbp_sent_received_test_token_do_not_print
run() { env -u SUPABASE_DB_URL PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_DB="$DBC" REAL_PSQL="$REAL_PSQL" SUPABASE_ACCESS_TOKEN=$TOKEN \
          bash scripts/sent-vs-received.sh "$@" 2>&1; }

# Seed: Alex (poster) shares 12 posts to Everyone on Oct 19-20; Grandma Rivera (account B) is in Everyone.
# One post's audience is then switched to a group she isn't in: it was "sent" but never "received".
# One more post is stuck as a draft (Alex tapped Share; it never finished): reported, not counted as sent.
q "do \$\$
declare v uuid; i int;
begin
  for i in 1..12 loop
    v := ('f0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.posts (id, space_id, author_id, caption, taken_at)
    values (v, '22222222-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'SECRET CAPTION ' || i, now());
    insert into public.post_audiences (post_id, circle_id) values (v, '33333333-0000-0000-0000-0000000000a0');
    insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                    width, height, byte_size, thumb_byte_size, exif_stripped)
    values (v, '22222222-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 0, 'photo', 'image/jpeg',
            'media/secret-key-' || i, 'thumb/secret-key-' || i, 100, 100, 1000, 100, true);
    update public.media_items set upload_status = 'ready' where post_id = v;
    update public.posts set status = 'published' where id = v;
    update public.posts set published_at = '2026-10-19 12:00Z'::timestamptz + (i || ' hours')::interval where id = v;
  end loop;
  -- T9: seed.sql's own posts are dated now(), so from Oct 19, 2026 on they fell inside the --since window
  -- (sent 15, not 12). Pin them to an old date so the test reads the same on any day.
  update public.posts set published_at = '2020-01-01 12:00Z', created_at = '2020-01-01 12:00Z'
   where id::text not like 'f0000000-%';
  update public.post_audiences set circle_id = '33333333-0000-0000-0000-0000000000a2'
   where post_id = 'f0000000-0000-0000-0000-000000000007';
  insert into public.posts (id, space_id, author_id, caption, status, created_at)
  values ('f0000000-0000-0000-0000-000000000099', '22222222-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'SECRET CAPTION draft', 'draft', '2026-10-20 09:00Z');
end \$\$" >/dev/null
[ "$(q "select count(*) from public.posts where id::text like 'f0000000-%' and status = 'published'")" = 12 ]
ok $? "QA-3 setup: 12 published posts and 1 draft seeded"

# ---- preflight ----
test -f scripts/sent-vs-received.sh; ok $? "QA-3: backend/scripts/sent-vs-received.sh exists"
out=$(env -u SUPABASE_ACCESS_TOKEN PATH="$T/bin:$PATH" STUB_LOG="$T/log" bash scripts/sent-vs-received.sh \
      --sender-email alex@example.com --receiver-email grandma.rivera@example.com 2>&1); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q "SUPABASE_ACCESS_TOKEN"; ok $? "QA-3: without SUPABASE_ACCESS_TOKEN it stops and names the secret"
out=$(run --sender-email alex@example.com); rc=$?
[ $rc != 0 ] && echo "$out" | grep -q -- "--receiver-email"; ok $? "QA-3: without --receiver-email it stops and says what's missing"
out=$(run --sender-email nobody@example.com --receiver-email grandma.rivera@example.com); rc=$?
[ $rc != 0 ] && echo "$out" | grep -qi "no account"; ok $? "QA-3: an unknown email stops with \"no account\""

# ---- one post lost ----
before=$(q "select md5(string_agg(id::text || status || coalesce(published_at::text, ''), '|' order by id)) from public.posts")
: > "$T/log/requests"
out=$(run --sender-email alex@example.com --receiver-email grandma.rivera@example.com --since 2026-10-19); rc=$?
echo "$out" | sed 's/^/        | /'
[ $rc != 0 ]; ok $? "QA-3: exits non-zero when anything is lost"
echo "$out" | grep -q "^RESULT: sent 12, received 11, lost 1$"; ok $? "QA-3: reports \"sent 12, received 11, lost 1\""
echo "$out" | grep -q "^Missing: f0000000-0000-0000-0000-000000000007 "; ok $? "QA-3: names the missing post's id"
[ "$(echo "$out" | grep -c '^Missing:')" = 1 ]; ok $? "QA-3: lists only the missing post"
echo "$out" | grep -q "^Not finished sending: 1 "; ok $? "QA-3: counts the stuck draft separately (tapped Share, never published)"
! echo "$out" | grep -qiE "SECRET|caption|https?:|@example\.com|secret-key"; ok $? "QA-3: prints no caption, email, URL or storage key"
! echo "$out" | grep -q "$TOKEN"; ok $? "QA-3: the token is never printed"
n=$(grep -c '^https://' "$T/log/requests"); [ "$n" = 1 ]; ok $? "QA-3: one Management API request (got $n)"
grep -q "Authorization: Bearer $TOKEN" "$T/log/requests"; ok $? "QA-3: the token goes in the Authorization header"
[ ! -f "$T/log/psql" ]; ok $? "QA-3: psql is never called"
[ "$before" = "$(q "select md5(string_agg(id::text || status || coalesce(published_at::text, ''), '|' order by id)) from public.posts")" ]
ok $? "QA-3: changes nothing (read only)"
grep -q "set_config('role', 'authenticated'" "$T/log/requests"; ok $? "QA-3: the received side runs as the authenticated role (RLS applies)"

# ---- filter to the audience account B should get ----
out=$(run --sender-email alex@example.com --receiver-email grandma.rivera@example.com --since 2026-10-19 --audience Everyone); rc=$?
ok $rc "QA-3: exits 0 when nothing is lost"
echo "$out" | grep -q "^RESULT: sent 11, received 11, lost 0$"; ok $? "QA-3: --audience Everyone counts only posts shared to Everyone (sent 11, received 11, lost 0)"

# ---- a post whose photo never finished uploading is not "received" ----
q "update public.media_items set upload_status = 'pending' where post_id = 'f0000000-0000-0000-0000-000000000003'" >/dev/null
if [ "$(q "select upload_status from public.media_items where post_id = 'f0000000-0000-0000-0000-000000000003'")" = pending ]; then
  out=$(run --sender-email alex@example.com --receiver-email grandma.rivera@example.com --since 2026-10-19 --audience Everyone)
  echo "$out" | grep -q "^Missing: f0000000-0000-0000-0000-000000000003 .*photo"; ok $? "QA-3: a visible post with a photo not ready counts as missing, and says so"
else
  ok 0 "QA-3: (a published post's photo can't go back to pending; the database guards it)"
fi

dropdb --if-exists "$DB" 2>/dev/null
echo
echo "SENT-RECEIVED RESULT: $PASS passed, $FAIL failed"
[ $FAIL = 0 ]
