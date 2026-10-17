#!/usr/bin/env bash
# family-setup.sql v2 (SPEC-GROUPS section 8 step 3; privacy review item 14). Written first (qa-tdd, Oct 17).
# v2 re-seeds Chase's family into section 2's shape (Everyone; Chase's side and Mom's side; households;
# the two events), placing people by the name the family uses (display_name). It changes access, so:
#   * by default it is a DRY RUN: it changes nothing and prints, for each person, the posts they would gain and lose:
#       DRY RUN: nothing was changed
#       Gammy: gains 0 posts, loses 1 post
#   * only `-v apply=yes` applies it (after Chase's yes and a backup), and its report must match what happened.
# Contract this test proposes (app-engineer/staff-pm may change it; change this test first):
#   psql -v chase_email=... -v space_name='Our kids' [-v apply=yes] -f backend/scripts/family-setup-v2.sql
set -uo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-hearth_test}_v2
SCRIPT=scripts/family-setup-v2.sql
PASS=0; FAIL=0
ok() { if [ "$1" = 0 ]; then PASS=$((PASS+1)); echo "ok      $2"; else FAIL=$((FAIL+1)); echo "NOT OK  $2"; fi; }
q() { psql -d "$DB" -X -q -t -A -c "$1" 2>/dev/null; }

dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
files=(-f tests/supabase_stub.sql)
for m in supabase/migrations/*.sql; do files+=(-f "$m"); done
psql -d "$DB" -v ON_ERROR_STOP=1 -q "${files[@]}" -f supabase/seed.sql >/dev/null 2>&1

# Hosted-like state: v1 setup (milestone 1/2), then relatives in the v1 groups and some posts.
psql -d "$DB" -X -q >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-0000000000e1', 'chase@example.com', '{"display_name":"Chase"}'),
  ('e0000000-0000-0000-0000-0000000000e2', 'mom@example.com', '{"display_name":"Mom"}'),
  ('e0000000-0000-0000-0000-0000000000e3', 'gammy@example.com', '{"display_name":"Gammy"}'),
  ('e0000000-0000-0000-0000-0000000000e4', 'grandaddy@example.com', '{"display_name":"Grandaddy"}'),
  ('e0000000-0000-0000-0000-0000000000e5', 'grandmomma@example.com', '{"display_name":"Grandmomma"}'),
  ('e0000000-0000-0000-0000-0000000000e6', 'memaw@example.com', '{"display_name":"Memaw"}'),
  ('e0000000-0000-0000-0000-0000000000e7', 'pawpaw@example.com', '{"display_name":"Pawpaw"}'),
  ('e0000000-0000-0000-0000-0000000000e8', 'granny@example.com', '{"display_name":"Granny"}'),
  ('e0000000-0000-0000-0000-0000000000e9', 'tester@example.com', '{"display_name":"Test viewer"}');
SQL
psql -d "$DB" -X -q -v chase_email=chase@example.com -v space_name='Our kids' -f scripts/family-setup.sql >/dev/null 2>&1
psql -d "$DB" -X -q >/dev/null 2>&1 <<'SQL'
reset role;
create schema t;
create function t.space() returns uuid language sql stable as $$ select id from public.spaces where name = 'Our kids' $$;
create function t.circle(p text) returns uuid language sql stable as $$ select id from public.circles where space_id = t.space() and name = p $$;
insert into public.space_members (space_id, user_id, role, invited_by)
select t.space(), id, case when email like 'mom%' then 'adult' else 'viewer' end::public.member_role, 'e0000000-0000-0000-0000-0000000000e1'
from auth.users where email in ('mom@example.com', 'gammy@example.com', 'grandaddy@example.com', 'grandmomma@example.com',
                                'memaw@example.com', 'pawpaw@example.com', 'granny@example.com', 'tester@example.com');
insert into public.circle_members (circle_id, user_id)
select t.circle(g), u.id from (values
  ('Everyone', 'mom'), ('Everyone', 'gammy'), ('Everyone', 'grandaddy'), ('Everyone', 'grandmomma'),
  ('Everyone', 'memaw'), ('Everyone', 'pawpaw'), ('Everyone', 'granny'),
  ('Chase''s mom''s side', 'gammy'), ('Chase''s dad''s side', 'grandaddy'), ('Chase''s dad''s side', 'grandmomma'),
  ('Mom''s mom''s side', 'memaw'), ('Mom''s dad''s side', 'pawpaw'), ('Mom''s dad''s side', 'granny'),
  ('Test viewer', 'tester')) x(g, who)
join auth.users u on u.email = x.who || '@example.com'
on conflict do nothing;
create function t.post(p_caption text, p_group text) returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.posts (id, space_id, author_id, caption) values (v, t.space(), 'e0000000-0000-0000-0000-0000000000e1', p_caption);
  insert into public.post_audiences (post_id, circle_id) values (v, t.circle(p_group));
  insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key, width, height, byte_size, thumb_byte_size, exif_stripped)
  values (v, t.space(), 'e0000000-0000-0000-0000-0000000000e1', 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true);
  update public.media_items set upload_status = 'ready' where post_id = v;
  update public.posts set status = 'published' where id = v;
end $$;
select t.post('pumpkins', 'Everyone'); select t.post('soccer', 'Everyone');
select t.post('for Gammy', 'Chase''s mom''s side'); select t.post('for Pawpaw and Granny', 'Mom''s dad''s side');
select t.post('for the tester', 'Test viewer');
-- who sees what, before
create table t.access (phase text, user_id uuid, post_id uuid);
create function t.snap(p_phase text) returns void language plpgsql as $$
declare u record;
begin
  delete from t.access where phase = p_phase;
  for u in select user_id from public.space_members where space_id = t.space() loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into t.access select p_phase, u.user_id, p.id from public.posts p
    where p.space_id = t.space() and p.status = 'published' and p.deleted_at is null and public.can_view_post(p.id);
  end loop;
end $$;
select t.snap('before');
-- everything v2 could touch, as one fingerprint
create function t.fingerprint() returns text language plpgsql as $$
declare v text; extra text := '';
begin
  select md5(string_agg(x, '|' order by x)) into v from (
    select 'c' || id || name || coalesce(deleted_at::text, '') as x from public.circles where space_id = t.space()
    union all select 'm' || circle_id || user_id from public.circle_members
    union all select 's' || space_id || user_id || role from public.space_members
    union all select 'a' || post_id || circle_id from public.post_audiences
    union all select 'i' || id from public.invites) z;
  if to_regclass('public.circle_links') is not null then
    execute 'select coalesce(md5(string_agg(parent_id::text || child_id::text, ''|'' order by parent_id, child_id)), '''') from public.circle_links' into extra;
    v := v || extra;
  end if;
  if to_regclass('public.circle_people') is not null then
    execute 'select coalesce(md5(string_agg(circle_id::text || user_id::text, ''|'' order by circle_id, user_id)), '''') from public.circle_people' into extra;
    v := v || extra;
  end if;
  return v;
end $$;
SQL
before=$(q "select t.fingerprint()")

# 1. dry run (the default)
test -f "$SCRIPT"; ok $? "setup v2: backend/scripts/family-setup-v2.sql exists"
out=$(psql -d "$DB" -X -q -v chase_email=chase@example.com -v space_name='Our kids' -f "$SCRIPT" 2>&1); rc=$?
ok $rc "setup v2 dry run: runs without error"
after=$(q "select t.fingerprint()")
[ -n "$before" ] && [ "$before" = "$after" ]; ok $? "setup v2 dry run: changes nothing (groups, members, placements, links, audiences, invites identical)"
echo "$out" | grep -q "^DRY RUN: nothing was changed"; ok $? "setup v2 dry run: says \"DRY RUN: nothing was changed\""
missing=0
for name in Mom Gammy Grandaddy Grandmomma Memaw Pawpaw Granny "Test viewer"; do
  echo "$out" | grep -Eq "^${name}: gains [0-9]+ posts?, loses [0-9]+ posts?$" || { missing=1; echo "        no report line for $name"; }
done
ok $missing "setup v2 dry run: one \"<name>: gains N posts, loses M posts\" line for every member of the family"

# 2. apply: the report must match what actually changed
out2=$(psql -d "$DB" -X -q -v chase_email=chase@example.com -v space_name='Our kids' -v apply=yes -f "$SCRIPT" 2>&1); rc=$?
ok $rc "setup v2 apply=yes: runs without error"
q "select t.snap('after')" >/dev/null
mismatch=0
while IFS='|' read -r name gained lost; do
  [ -z "$name" ] && continue
  line=$(echo "$out" | grep -E "^${name}: gains" | head -1)
  want="${name}: gains ${gained} post$([ "$gained" = 1 ] || echo s), loses ${lost} post$([ "$lost" = 1 ] || echo s)"
  [ "$line" = "$want" ] || { mismatch=1; echo "        $name: reported '${line}', actual '${want}'"; }
done < <(q "select pr.display_name,
                   (select count(*) from t.access a where a.phase = 'after'  and a.user_id = sm.user_id
                      and not exists (select 1 from t.access b where b.phase = 'before' and b.user_id = a.user_id and b.post_id = a.post_id)),
                   (select count(*) from t.access b where b.phase = 'before' and b.user_id = sm.user_id
                      and not exists (select 1 from t.access a where a.phase = 'after' and a.user_id = b.user_id and a.post_id = b.post_id))
            from public.space_members sm join public.profiles pr on pr.id = sm.user_id
            where sm.space_id = t.space() and sm.role <> 'owner'")
[ -n "$out" ] && [ $mismatch = 0 ]; ok $? "setup v2: the dry-run report equals each person's real posts gained and lost after apply"
[ "$(q "select count(*) from public.circles where space_id = t.space() and kind = 'everyone'")" = 1 ]; ok $? "setup v2 apply: one Everyone"
[ "$(q "select string_agg(name, ',' order by name) from public.circles where space_id = t.space() and kind = 'group' and deleted_at is null")" = "Chase's side,Mom's side" ]
ok $? "setup v2 apply: the set groups are Chase's side and Mom's side (legacy groups retired)"
[ "$(q "select count(*) from public.circle_people cp join public.circles h on h.id = cp.circle_id join public.profiles p on p.id = cp.user_id
        join public.circle_links l on l.child_id = h.id join public.circles g on g.id = l.parent_id
        where h.name = 'Gammy''s house' and p.display_name = 'Gammy' and g.name = 'Chase''s side'")" = 1 ]
ok $? "setup v2 apply: Gammy is placed in Gammy's house, under Chase's side"
[ "$(q "select count(*) from public.circle_people cp join public.circles h on h.id = cp.circle_id join public.profiles p on p.id = cp.user_id
        where h.name = 'Pawpaw and Granny''s house' and p.display_name in ('Pawpaw', 'Granny')")" = 2 ]
ok $? "setup v2 apply: Pawpaw and Granny share one house"
[ "$(q "select count(*) from public.circles where space_id = t.space() and kind = 'event' and name in ('Charleston trip', 'Birthday at Gigi''s')")" = 2 ]
ok $? "setup v2 apply: the Charleston trip and Birthday at Gigi's events exist"
echo "$out" | grep -q "^Test viewer: " && echo "$out2$out" | grep -qi "not placed"; ok $? "setup v2: a person it can't place by name (Test viewer) is reported as not placed, not silently dropped"
n1=$(q "select count(*) from public.circles where space_id = t.space()")
psql -d "$DB" -X -q -v chase_email=chase@example.com -v space_name='Our kids' -v apply=yes -f "$SCRIPT" >/dev/null 2>&1
n2=$(q "select count(*) from public.circles where space_id = t.space()")
[ -n "$n1" ] && [ "$n1" = "$n2" ]; ok $? "setup v2: applying twice adds nothing (safe to re-run)"

dropdb --if-exists "$DB" 2>/dev/null
echo
echo "SETUP V2 RESULT: $PASS passed, $FAIL failed"
[ $FAIL = 0 ]
