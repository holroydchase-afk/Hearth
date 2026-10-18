-- Groups v2: plain groups with comment settings, feature flags, event rows (docs/product/SPEC-GROUPS.md v2, Oct 18;
-- migration 0013). Written FIRST (qa-tdd, Oct 18): red until 0013 lands.
-- Covers GRP-2..14, FLAG-1..4 (SQL side), EVT-1. GRP-1 (nothing changes) and the household/event half of GRP-2
-- are in tests/grp1/ (snapshot on 0001-0012, apply 0013+, diff). FLAG-4's sign-media half is
-- supabase/functions/sign-media/index_test.ts ("FLAG-4 ...").
--
-- Fixture: family "Hearth v2 family" (own space), built through the real RPCs as Chase.
--   Parents: Chase (owner, "Dad": his posts are "Dad's post"), Mom (adult).
--   Relatives (all in Everyone unless noted): Meemaw Sue, Auntie Rachel, Aunt Linda, Pop Joe, Neighbor Ann,
--   Cousin Beth, Uncle Ray; Great-aunt Opal is NOT in Everyone (only in Meemaw's).
--   Chase's side     (group, Private):  Pop Joe, Auntie Rachel        (+ Uncle Ray, later: GRP-11)
--   Mom's side  (group, Private):  Meemaw Sue, Auntie Rachel, Aunt Linda
--   Meemaw's         (group, Always shared, set by Chase): Meemaw Sue, Auntie Rachel, Great-aunt Opal
--                                       (+ Cousin Beth, later: GRP-8)
--   Chase's birthday (event, Shared on this group's posts): add_people_from both sides = Joe, Rachel, Sue, Linda
--   Porch            (group, Private, switched in GRP-7): Pop Joe, Aunt Linda
-- Interpretations this suite encodes (staff-pm can change them; then change the test first):
--   * GRP-13: relatives get no comment setting = the column is not readable by app users (42501 on
--     `select comment_mode from circles`); parents read it through an RPC (not specified here).
--   * EVT-1: get_feed / get_timeline rows gain columns event_id (uuid) and event_name (text).
--   * FLAG: feature 'video_posting', capability 'use_video'; feature_on reads the caller from auth.uid().
--     Tables may live in public or private (tests.tbl finds them). A parent writes space_features directly.
--   * FLAG-4 (SQL side): prepare_media_upload refuses a video item with 42501 'video_posting_off' when
--     private.feature_on(space, 'video_posting') is false. sign-media maps it to 403 {error: video_posting_off}.
--   * GRP-14 reply_scope: for a relative who is not the author, reply_scope = 'parents' exactly when every name
--     reply_readers gives is a parent or the post's author.
-- Every call goes through dynamic SQL or a catching helper, so a missing function is a failed test, never an abort.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set space_v '''22222222-0000-0000-0000-0000000000e0'''

-- ---------- people ----------
create table tests.people (k text primary key, id uuid not null, name text not null, role public.member_role not null,
                           in_everyone boolean not null);
insert into tests.people values
  ('chase',    'e2000000-0000-0000-0000-000000000001', 'Chase',           'owner',  false),
  ('mom', 'e2000000-0000-0000-0000-000000000002', 'Mom',        'adult',  false),
  ('sue',    'e2000000-0000-0000-0000-000000000011', 'Meemaw Sue',    'viewer', true),
  ('rachel',   'e2000000-0000-0000-0000-000000000012', 'Auntie Rachel',   'viewer', true),
  ('linda',    'e2000000-0000-0000-0000-000000000013', 'Aunt Linda',      'viewer', true),
  ('opal',     'e2000000-0000-0000-0000-000000000014', 'Great-aunt Opal', 'viewer', false),
  ('joe',      'e2000000-0000-0000-0000-000000000021', 'Pop Joe',         'viewer', true),
  ('ray',      'e2000000-0000-0000-0000-000000000022', 'Uncle Ray',       'viewer', true),
  ('ann',      'e2000000-0000-0000-0000-000000000031', 'Neighbor Ann',    'viewer', true),
  ('beth',     'e2000000-0000-0000-0000-000000000032', 'Cousin Beth',     'viewer', true);
-- people who join by invite in GRP-12 (accounts only, not members yet)
create table tests.joiners (k text primary key, id uuid not null, name text not null);
insert into tests.joiners values
  ('dee', 'e2000000-0000-0000-0000-000000000041', 'Cousin Dee'),
  ('eve', 'e2000000-0000-0000-0000-000000000042', 'Cousin Eve'),
  ('hal', 'e2000000-0000-0000-0000-000000000043', 'Uncle Hal'),
  ('fay', 'e2000000-0000-0000-0000-000000000044', 'Cousin Fay');

create function tests.u(p_k text) returns uuid language sql stable as $$
  select coalesce((select id from tests.people where k = p_k), (select id from tests.joiners where k = p_k)) $$;
create function tests.c(p_k text) returns uuid language sql stable as $$ select v::uuid from tests.vars where k = p_k $$;
create function tests.act(p_k text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(tests.u(p_k)::text, ''), true) $$;
create function tests.space() returns uuid language sql immutable as $$ select '22222222-0000-0000-0000-0000000000e0'::uuid $$;
-- the schema a 0013 table lives in (public or private); defaults to public so a missing table is a clear 42P01
create function tests.tbl(p_name text) returns text language sql stable as $$
  select coalesce((select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where c.relname = p_name and c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
                   order by n.nspname = 'public' desc limit 1), 'public.' || p_name) $$;

\set as_chase    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''e2000000-0000-0000-0000-000000000001'', false);'
\set as_mom 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''e2000000-0000-0000-0000-000000000002'', false);'
\set as_joe      'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''e2000000-0000-0000-0000-000000000021'', false);'

-- ---------- fixture helpers (admin; each acts as one person through the real RPCs) ----------
create function tests.level(p_key text, p_kind text, p_name text, p_by text default 'chase') returns void language plpgsql as $$
declare v uuid;
begin
  perform tests.act(p_by);
  execute 'select public.create_level(p_space => $1, p_kind => $2, p_name => $3)' into v using tests.space(), p_kind, p_name;
  insert into tests.vars values (p_key, v::text) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'create_level % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
-- GRP-10 signature: place_person(p_group, p_user, p_history)
create function tests.place(p_group text, p_who text, p_history text default 'all') returns void language plpgsql as $$
begin
  perform tests.act('chase');
  execute 'select public.place_person(p_group => $1, p_user => $2, p_history => $3)' using tests.c(p_group), tests.u(p_who), p_history;
exception when others then raise warning 'place_person % in % failed: % %', p_who, p_group, sqlstate, sqlerrm;
end $$;
create function tests.set_mode(p_group text, p_mode text, p_by text default 'chase') returns void language plpgsql as $$
begin
  perform tests.act(p_by);
  execute 'select public.set_comment_mode(p_circle => $1, p_mode => $2)' using tests.c(p_group), p_mode;
exception when others then raise warning 'set_comment_mode % % failed: % %', p_group, p_mode, sqlstate, sqlerrm;
end $$;
create function tests.mode(p_group text) returns text language plpgsql as $$
declare v text;
begin
  execute 'select comment_mode from public.circles where id = $1' into v using tests.c(p_group);
  return v;
exception when others then return '<error ' || sqlstate || '>';
end $$;
-- A published post with one ready photo (admin insert, as the seed does). p_targets are group keys.
create function tests.post(p_key text, p_targets text[], p_author text default 'chase') returns void language plpgsql as $$
declare v_post uuid := gen_random_uuid(); t text;
begin
  insert into public.posts (id, space_id, author_id, caption) values (v_post, tests.space(), tests.u(p_author), 'v2 ' || p_key);
  foreach t in array p_targets loop
    insert into public.post_audiences (post_id, circle_id) values (v_post, tests.c(t));
  end loop;
  insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                  width, height, byte_size, thumb_byte_size, exif_stripped)
  values (v_post, tests.space(), tests.u(p_author), 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true);
  update public.media_items set upload_status = 'ready' where post_id = v_post;
  insert into public.media_keys (media_id, wrapped_dek) select id, extensions.gen_random_bytes(40) from public.media_items where post_id = v_post;
  update public.posts set status = 'published' where id = v_post;
  insert into tests.vars values (p_key, v_post::text) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'post % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
create function tests.say(p_key text, p_who text, p_post text) returns void language plpgsql as $$
declare v uuid;
begin
  perform tests.act(p_who);
  execute 'select (public.add_comment($1, $2, $3)).comment_id' into v using gen_random_uuid(), tests.c(p_post), 'comment ' || p_key;
  insert into tests.vars values (p_key, v::text) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'comment % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
create function tests.heart(p_who text, p_post text) returns void language plpgsql as $$
begin
  perform tests.act(p_who);
  execute 'select public.toggle_heart($1)' using tests.c(p_post);
exception when others then raise warning 'heart by % failed: % %', p_who, sqlstate, sqlerrm;
end $$;

-- ---------- read helpers: each answers as one person ----------
-- through get_comments ("not found" = no)
create function tests.reads(p_who text, p_comment text) returns boolean language plpgsql as $$
declare v_post uuid;
begin
  select post_id into v_post from public.comments where id = tests.c(p_comment);
  if v_post is null then return null; end if;
  perform tests.act(p_who);
  return exists (select 1 from public.get_comments(v_post, 200) g where g.comment_id = tests.c(p_comment));
exception when sqlstate 'P0002' then return false;
end $$;
-- through table RLS, as the app user
create function tests.reads_rls(p_who text, p_comment uuid) returns boolean language plpgsql as $$
declare v boolean;
begin
  perform tests.act(p_who);
  execute 'set local role authenticated';
  select exists (select 1 from public.comments where id = p_comment) into v;
  execute 'reset role';
  return v;
end $$;
create function tests.reads_heart(p_who text, p_post text, p_hearter text) returns boolean language plpgsql as $$
begin
  if not exists (select 1 from public.reactions where post_id = tests.c(p_post) and user_id = tests.u(p_hearter)) then return null; end if;
  perform tests.act(p_who);
  return public.can_see_reply(tests.c(p_post), tests.u(p_hearter));
end $$;
-- reply_readers as p_who, sorted (null = "not found")
create function tests.readers(p_who text, p_post text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform tests.act(p_who);
  execute 'select array(select x from unnest(public.reply_readers($1)) x order by x)' into v using tests.c(p_post);
  return v;
exception when others then return array['<error ' || sqlstate || '>'];
end $$;
create function tests.names(p_names text[]) returns text[] language sql immutable as $$
  select array(select x from unnest(p_names) x order by x) $$;
-- one get_feed / get_timeline row as jsonb (null if absent or on error)
create function tests.row(p_who text, p_post text, p_fn text default 'get_feed') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.act(p_who);
  execute format('select to_jsonb(f) from public.%I($1, null, null, 50) f where f.post_id = $2', p_fn)
    into v using tests.space(), tests.c(p_post);
  return v;
exception when others then return jsonb_build_object('error', sqlstate);
end $$;
-- is p_who a (derived) member of group p_group / placed in it?
create function tests.member(p_group text, p_who text) returns boolean language sql stable as $$
  select exists (select 1 from public.circle_members where circle_id = tests.c(p_group) and user_id = tests.u(p_who)) $$;
create function tests.placed(p_group text, p_who text) returns boolean language sql stable as $$
  select exists (select 1 from public.circle_people where circle_id = tests.c(p_group) and user_id = tests.u(p_who)) $$;

-- feature switches (admin)
create function tests.flag_global(p_on boolean) returns void language plpgsql as $$
begin
  execute format('delete from %s where feature = ''video_posting''', tests.tbl('feature_flags'));
  execute format('insert into %s (feature, enabled) values (''video_posting'', $1)', tests.tbl('feature_flags')) using p_on;
exception when others then raise warning 'feature_flags write failed: % %', sqlstate, sqlerrm;
end $$;
create function tests.flag_family(p_on boolean) returns void language plpgsql as $$
begin
  execute format('delete from %s where space_id = $1 and feature = ''video_posting''', tests.tbl('space_features')) using tests.space();
  execute format('insert into %s (space_id, feature, enabled, set_by) values ($1, ''video_posting'', $2, $3)', tests.tbl('space_features'))
    using tests.space(), p_on, tests.u('chase');
exception when others then raise warning 'space_features write failed: % %', sqlstate, sqlerrm;
end $$;
create function tests.feature_on_as(p_who text) returns boolean language plpgsql as $$
declare v boolean;
begin
  perform tests.act(p_who);
  execute 'select private.feature_on($1, ''video_posting'')' into v using tests.space();
  return v;
exception when others then raise warning 'feature_on failed: % %', sqlstate, sqlerrm; return null;
end $$;
create function tests.my_features_has(p_who text) returns boolean language plpgsql as $$
declare v boolean;
begin
  perform tests.act(p_who);
  execute 'select exists (select 1 from public.my_features($1) f where to_jsonb(f)::text like ''%video_posting%'')' into v using tests.space();
  return v;
exception when others then raise warning 'my_features failed: % %', sqlstate, sqlerrm; return null;
end $$;

grant select on tests.people, tests.joiners to authenticated;
grant execute on all functions in schema tests to authenticated;

-- ======================================================================
-- Shape (0013): the new pieces exist
-- ======================================================================
:as_admin
select tests.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'circles' and column_name = 'comment_mode'),
                'GRP-2 shape: circles.comment_mode exists');
select tests.ok(to_regclass(tests.tbl('comment_mode_log')) is not null,
                'GRP-7 shape: comment_mode_log exists');
select tests.ok(to_regprocedure('public.set_comment_mode(uuid, text)') is not null
                and to_regprocedure('public.add_people_from(uuid, uuid, text)') is not null
                and to_regprocedure('private.feature_on(uuid, text)') is not null
                and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_features')
                and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'group_reply_ok'),
                'GRP-9/11/14 FLAG-1 shape: set_comment_mode, add_people_from, private.feature_on, my_features, private.group_reply_ok exist');
select tests.ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'place_person' and 'p_group' = any (p.proargnames)),
                'GRP-10 shape: place_person takes p_group (any group, not only households)');
select tests.ok(to_regclass(tests.tbl('feature_flags')) is not null and to_regclass(tests.tbl('space_features')) is not null,
                'FLAG shape: feature_flags and space_features exist');
select tests.ok(to_regprocedure('public.set_comment_mode(uuid, text)') is not null
                and not has_function_privilege('anon', 'public.set_comment_mode(uuid, text)', 'execute')
                and to_regprocedure('public.add_people_from(uuid, uuid, text)') is not null
                and not has_function_privilege('anon', 'public.add_people_from(uuid, uuid, text)', 'execute'),
                'GRP-9/11 shape: anon cannot call set_comment_mode or add_people_from');
select tests.ok(to_regprocedure('private.feature_on(uuid, text)') is not null
                and not has_function_privilege('authenticated', 'private.feature_on(uuid, text)', 'execute'),
                'FLAG shape: app users cannot call private.feature_on directly (they use my_features)');

-- GRP-2 (seed half): circles that existed before 0013 were backfilled. Household/event backfill: tests/grp1/after.sql.
select tests.ok_sql($q$select count(*) > 0 and bool_and(comment_mode = case kind when 'household' then 'always'
                                                                         when 'event' then 'on_group_posts' else 'private' end)
                      from public.circles where space_id in ('22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b')$q$,
  'GRP-2 every seed circle (Everyone and groups) is Private after 0013');
select tests.ok_sql(format($q$select count(*) = (select count(*) from public.circles
                                                 where space_id in ('22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b'))
                                and count(distinct l.circle_id) = count(*)
                                and bool_and(l.set_at = c.created_at and l.mode = c.comment_mode)
                             from %s l join public.circles c on c.id = l.circle_id
                             where c.space_id in ('22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b')$q$,
                           tests.tbl('comment_mode_log')),
  'GRP-2 comment_mode_log backfill: exactly one row per existing circle, set_at = circles.created_at, same mode');

-- ======================================================================
-- Fixture
-- ======================================================================
insert into auth.users (id, email, raw_user_meta_data)
select id, k || '@v2.hearth.test', jsonb_build_object('display_name', name) from tests.people
union all select id, k || '@v2.hearth.test', jsonb_build_object('display_name', name) from tests.joiners;
insert into public.households (id, name, created_by) values ('11111111-0000-0000-0000-0000000000e0', 'Chase and Mom v2', tests.u('chase'));
insert into public.household_members (household_id, user_id, role) values ('11111111-0000-0000-0000-0000000000e0', tests.u('chase'), 'admin');
insert into public.spaces (id, household_id, name, plan, created_by)
values (:space_v, '11111111-0000-0000-0000-0000000000e0', 'Hearth v2 family', 'family', tests.u('chase'));
insert into public.circles (space_id, name, kind, created_by) values (:space_v, 'Everyone', 'everyone', tests.u('chase'));
select tests.setv('all', $$select id from public.circles where space_id = '22222222-0000-0000-0000-0000000000e0' and kind = 'everyone'$$);
insert into public.space_members (space_id, user_id, role, invited_by, in_everyone)
select :space_v, id, role, case when k = 'chase' then null else tests.u('chase') end, in_everyone from tests.people;

select tests.level('g_chase',  'group', 'Chase''s side');
select tests.level('g_dan',    'group', 'Mom''s side');
select tests.level('g_meemaw', 'group', 'Meemaw''s');
select tests.level('g_porch',  'group', 'Porch');
select tests.level('e_bday',   'event', 'Chase''s birthday');
select tests.place('g_chase', 'joe');
select tests.place('g_chase', 'rachel');
select tests.place('g_dan', 'sue');
select tests.place('g_dan', 'rachel');
select tests.place('g_dan', 'linda');
select tests.place('g_meemaw', 'sue');
select tests.place('g_meemaw', 'rachel');
select tests.place('g_meemaw', 'opal');
select tests.place('g_porch', 'joe');
select tests.place('g_porch', 'linda');
-- a parent placed in a side is not copied (parents already read everything)
select tests.try($$insert into public.circle_people (circle_id, user_id, added_by)
                   values (tests.c('g_dan'), tests.u('mom'), tests.u('chase'))$$);
select tests.set_mode('g_meemaw', 'always');

-- ======================================================================
-- GRP-11: copy both sides into the birthday (copied, not linked)
-- ======================================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
select tests.lives(format('select public.add_people_from(p_target => %L, p_source => %L, p_history => %L)', tests.c('e_bday'), tests.c('g_chase'), 'all'),
                   'GRP-11 a parent copies everyone in Chase''s side into Chase''s birthday');
select tests.lives(format('select public.add_people_from(p_target => %L, p_source => %L, p_history => %L)', tests.c('e_bday'), tests.c('g_dan'), 'all'),
                   'GRP-11 ...and everyone in Mom''s side (Auntie Rachel, in both, does not make it fail)');
select tests.ok((select array_agg(user_id order by user_id) from public.circle_people where circle_id = tests.c('e_bday'))
                = (select array_agg(id order by id) from tests.people where k in ('joe', 'rachel', 'sue', 'linda')),
                'GRP-11 the birthday holds exactly Pop Joe, Auntie Rachel, Meemaw Sue and Aunt Linda, each once (no parent copied)');
select tests.ok(not exists (select 1 from public.circle_links where tests.c('e_bday') in (parent_id, child_id)),
                'GRP-11 copied, not linked: no circle_links row for the birthday');
select tests.throws_code(format('select public.add_people_from(p_target => %L, p_source => %L, p_history => null)', tests.c('e_bday'), tests.c('g_chase')),
                         'GRP-11 no share-history choice is refused', '23514');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000021', false);   -- Pop Joe
select tests.throws_code(format('select public.add_people_from(p_target => %L, p_source => %L, p_history => %L)', tests.c('e_bday'), tests.c('g_chase'), 'all'),
                         'GRP-11 a relative calling add_people_from gets "not found"', 'P0002');
:as_admin
select tests.place('g_chase', 'ray');   -- added to Chase's side after the copy
select tests.ok(tests.placed('g_chase', 'ray') and not tests.member('e_bday', 'ray') and not tests.placed('e_bday', 'ray'),
                'GRP-11 Uncle Ray, added to Chase''s side later, is not in Chase''s birthday');

-- ======================================================================
-- GRP-9: create_level and set_comment_mode
-- ======================================================================
select tests.ok(tests.mode('g_chase') = 'private' and tests.mode('g_porch') = 'private',
                'GRP-9 a group made with create_level starts Private');
select tests.level('e_reunion', 'event', 'Reunion', 'mom');
select tests.ok(tests.mode('e_bday') = 'on_group_posts' and tests.mode('e_reunion') = 'on_group_posts',
                'GRP-9 an event made with create_level (by either parent) starts Shared on this group''s posts');
select tests.ok(tests.mode('g_meemaw') = 'always', 'GRP-9 a parent sets Meemaw''s to Always shared with set_comment_mode');
select tests.ok_sql(format($q$select count(*) = 2 and (array_agg(mode order by set_at))[1] = 'private' and (array_agg(mode order by set_at))[2] = 'always'
                                and bool_or(set_by = 'e2000000-0000-0000-0000-000000000001')
                             from %s where circle_id = %L$q$, tests.tbl('comment_mode_log'), tests.c('g_meemaw')),
  'GRP-9 comment_mode_log has a row for the new group (Private) and one for the change (Always shared, set by Chase)');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
select tests.throws_code(format('select public.set_comment_mode(p_circle => %L, p_mode => %L)', tests.c('g_porch'), 'sometimes'),
                         'GRP-9 set_comment_mode refuses a fourth value', '23514');
select tests.throws_code(format('select public.set_comment_mode(p_circle => %L, p_mode => null)', tests.c('g_porch')),
                         'GRP-9 set_comment_mode refuses no value', '23514');
select tests.throws_code(format('select public.set_comment_mode(p_circle => %L, p_mode => %L)', tests.c('all'), 'always'),
                         'GRP-9 Everyone''s setting can''t be changed (the owner''s AUD-10 switch is the one way to open it)', '23514');
select tests.ok(tests.mode('all') = 'private', 'GRP-9 Everyone is still Private');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000021', false);   -- Pop Joe
select tests.throws_code(format('select public.set_comment_mode(p_circle => %L, p_mode => %L)', tests.c('g_porch'), 'always'),
                         'GRP-9 a relative calling set_comment_mode gets "not found"', 'P0002');
select tests.throws_code(format('select public.create_level(p_space => %L, p_kind => %L, p_name => %L)', tests.space(), 'group', 'Joe''s pals'),
                         'GRP-9 a relative calling create_level gets "not found"', 'P0002');
:as_chase
select tests.throws_code(format('update public.circles set comment_mode = %L where id = %L', 'always', tests.c('g_porch')),
                         'GRP-9 a parent can''t change comment_mode with a direct UPDATE (only set_comment_mode)', '42501');
select tests.throws_code(format('insert into %s (circle_id, mode, set_by) values (%L, %L, %L)', tests.tbl('comment_mode_log'), tests.c('g_porch'), 'always', tests.u('chase')),
                         'GRP-9 app users can''t write comment_mode_log', '42501');
:as_admin
select tests.ok(tests.mode('g_porch') = 'private', 'GRP-9 Porch is still Private after the refused writes');

-- ======================================================================
-- GRP-10: place_person in any live group or event
-- ======================================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
select tests.ok(tests.placed('g_porch', 'joe') and tests.member('g_porch', 'joe') and tests.member('g_meemaw', 'opal'),
                'GRP-10 place_person put people in plain groups (Porch, Meemaw''s), and they are members');
select tests.lives(format('select public.place_person(p_group => %L, p_user => %L, p_history => %L)', tests.c('e_reunion'), tests.u('ann'), 'all'),
                   'GRP-10 place_person into an event succeeds');
select tests.ok(tests.member('e_reunion', 'ann'), 'GRP-10 ...and Neighbor Ann is a member of Reunion');
select tests.throws_code(format('select public.place_person(p_group => %L, p_user => %L, p_history => %L)', tests.c('all'), tests.u('opal'), 'all'),
                         'GRP-10 placing someone in Everyone is still refused', '23514');
select tests.throws_code(format('select public.place_person(p_group => %L, p_user => %L, p_history => null)', tests.c('g_porch'), tests.u('ann')),
                         'GRP-10 no share-history choice is refused', '23514');
select tests.throws_code(format('select public.place_person(p_group => %L, p_user => %L, p_history => %L)', tests.c('g_porch'), tests.u('ann'), 'some'),
                         'GRP-10 an unknown share-history choice is refused', '23514');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000021', false);
select tests.throws_code(format('select public.place_person(p_group => %L, p_user => %L, p_history => %L)', tests.c('g_porch'), tests.u('ann'), 'all'),
                         'GRP-10 a relative calling place_person gets "not found"', 'P0002');
:as_admin
select tests.ok(not tests.member('g_porch', 'ann'), 'GRP-10 the refused placements left Porch unchanged');

-- ======================================================================
-- Posts and replies
-- ======================================================================
select tests.post('p_all',  array['all']);        -- Dad's (Chase's) post to Everyone
select tests.post('p_dan',  array['g_dan']);      -- to Mom's side only
select tests.post('p_bday', array['e_bday']);     -- to Chase's birthday only
select tests.post('p_evt',  array['e_bday', 'all']);  -- to the birthday and Everyone (EVT-1)

-- ---------- GRP-3 (Scenario 1): Meemaw comments and hearts Dad's post to Everyone ----------
select tests.say('c3', 'sue', 'p_all');
select tests.heart('sue', 'p_all');
select tests.ok(tests.reads('chase', 'c3') and tests.reads('mom', 'c3') and tests.reads('rachel', 'c3'),
                'GRP-3 Chase, Mom and Auntie Rachel (Meemaw''s, Always shared) read Meemaw''s comment on the Everyone post');
select tests.ok(tests.reads_heart('chase', 'p_all', 'sue') and tests.reads_heart('mom', 'p_all', 'sue') and tests.reads_heart('rachel', 'p_all', 'sue'),
                'GRP-3 ...and her heart');
select tests.ok(not tests.reads('linda', 'c3') and not tests.reads('joe', 'c3') and not tests.reads('ann', 'c3')
                and not tests.reads('beth', 'c3') and not tests.reads('ray', 'c3'),
                'GRP-3 everyone else who sees the post (Linda, Joe, Ann, Beth, Ray) does not read her comment');
select tests.ok(not tests.reads_heart('linda', 'p_all', 'sue') and not tests.reads_heart('joe', 'p_all', 'sue')
                and not tests.reads_heart('ann', 'p_all', 'sue') and not tests.reads_heart('beth', 'p_all', 'sue'),
                'GRP-3 ...nor her heart');
select tests.ok(tests.readers('sue', 'p_all') = tests.names(array['Chase', 'Mom', 'Auntie Rachel']),
                format('GRP-3 reply_readers for Meemaw names exactly Chase, Mom and Auntie Rachel (got %s)', tests.readers('sue', 'p_all')));

-- ---------- GRP-4 (Scenario 2): comments on a post sent to the birthday ----------
select tests.say('c4', 'joe', 'p_bday');
select tests.say('c4b', 'linda', 'p_bday');
select tests.ok(tests.reads('sue', 'c4') and tests.reads('rachel', 'c4') and tests.reads('linda', 'c4'),
                'GRP-4 every birthday member reads Pop Joe''s comment on a post sent to the birthday');
select tests.ok(tests.reads('joe', 'c4b') and tests.reads('sue', 'c4b') and tests.reads('rachel', 'c4b'),
                'GRP-4 ...and Aunt Linda''s');
select tests.ok(not tests.reads('ann', 'c4') and not tests.reads('opal', 'c4') and not tests.reads('ray', 'c4'),
                'GRP-4 people outside the birthday (who can''t see the post) read nothing');
select tests.ok(tests.readers('joe', 'p_bday') = tests.names(array['Chase', 'Mom', 'Meemaw Sue', 'Auntie Rachel', 'Aunt Linda']),
                format('GRP-4 reply_readers for Pop Joe on the birthday post names the parents and every other member (got %s)', tests.readers('joe', 'p_bday')));

-- ---------- GRP-5 (leak case): Shared-on-this-group's-posts never leaks to other posts ----------
select tests.ok(not tests.reads('joe', 'c3') and not tests.reads('linda', 'c3'),
                'GRP-5 birthday members Joe and Linda don''t read Meemaw''s comment on an Everyone-only post');
select tests.ok(tests.reads('rachel', 'c3'),
                'GRP-5 ...unless another rule allows it (Rachel shares the Always-shared Meemaw''s)');
select tests.say('c5', 'sue', 'p_dan');
select tests.ok(not tests.reads('linda', 'c5'),
                'GRP-5 same for a post sent to another group: Linda (birthday + Mom''s side, both with Meemaw) doesn''t read her comment on the Mom''s side post');
select tests.ok(tests.readers('sue', 'p_dan') = tests.names(array['Chase', 'Mom', 'Auntie Rachel']),
                format('GRP-5 reply_readers for Meemaw on the Mom''s side post leaves out Aunt Linda (got %s)', tests.readers('sue', 'p_dan')));

-- ---------- GRP-6: Always shared crosses posts, but only to people who see the post ----------
select tests.ok(tests.reads('rachel', 'c5'),
                'GRP-6 Rachel (Meemaw''s, Always shared) reads Meemaw''s comment on a post not sent to Meemaw''s');
select tests.ok(not tests.reads('opal', 'c5') and not tests.reads_rls('opal', tests.c('c5')),
                'GRP-6 Great-aunt Opal (Meemaw''s, can''t see that post) reads nothing: get_comments says not found, RLS hides it');
select tests.ok(not tests.reads_heart('opal', 'p_all', 'sue'),
                'GRP-6 ...and can''t read Meemaw''s heart on a post she can''t see');

-- ---------- GRP-7: the setting at write time and now; the less open wins ----------
select tests.say('c7a', 'joe', 'p_all');              -- Porch is Private
select tests.ok(not tests.reads('linda', 'c7a'), 'GRP-7 setup: Porch is Private, Linda doesn''t read Joe''s comment on the Everyone post');
select tests.set_mode('g_porch', 'always');
select tests.ok(tests.mode('g_porch') = 'always', 'GRP-7 setup: a parent switched Porch to Always shared');
select tests.ok(not tests.reads('linda', 'c7a'),
                'GRP-7 the comment written while Porch was Private keeps its readers after the switch to Always shared');
select tests.say('c7b', 'joe', 'p_all');
select tests.ok(tests.reads('linda', 'c7b'), 'GRP-7 a comment written after the switch follows Always shared (Linda reads it)');
select tests.ok(tests.readers('joe', 'p_all') @> array['Aunt Linda'], 'GRP-7 ...and reply_readers for Joe now names Aunt Linda');
select tests.set_mode('g_porch', 'private');
select tests.ok(not tests.reads('linda', 'c7b') and not tests.reads_rls('linda', tests.c('c7b')),
                'GRP-7 switching Always shared -> Private hides the earlier comment from the group at once');
select tests.ok(not (tests.readers('joe', 'p_all') @> array['Aunt Linda']), 'GRP-7 ...and reply_readers drops Aunt Linda');

-- ---------- GRP-8: readers fixed at write time ----------
select tests.place('g_meemaw', 'beth');     -- after c3 was written
select tests.ok(tests.member('g_meemaw', 'beth'), 'GRP-8 setup: Cousin Beth is now in Meemaw''s');
select tests.ok(not tests.reads('beth', 'c3') and not tests.reads_rls('beth', tests.c('c3')),
                'GRP-8 Beth, added to Meemaw''s after Meemaw''s comment, doesn''t read it through the group');
select tests.ok(not tests.reads_heart('beth', 'p_all', 'sue'), 'GRP-8 ...nor Meemaw''s earlier heart');
select tests.say('c8', 'sue', 'p_all');
select tests.ok(tests.reads('beth', 'c8'), 'GRP-8 Beth does read Meemaw''s next comment, written after Beth joined');

-- ======================================================================
-- EVT-1: event rows carry the event only for its members
-- ======================================================================
select tests.ok(tests.row('joe', 'p_evt') ->> 'event_id' = tests.c('e_bday')::text
                and tests.row('joe', 'p_evt') ->> 'event_name' = 'Chase''s birthday',
                'EVT-1 a birthday member''s feed row for a post to the birthday carries the event''s id and name');
select tests.ok(tests.row('joe', 'p_evt', 'get_timeline') ->> 'event_id' = tests.c('e_bday')::text
                and tests.row('joe', 'p_evt', 'get_timeline') ->> 'event_name' = 'Chase''s birthday',
                'EVT-1 ...and so does the timeline row');
select tests.ok(tests.row('joe', 'p_bday') ->> 'event_id' = tests.c('e_bday')::text,
                'EVT-1 a post sent only to the event carries it too');
select tests.ok(tests.row('ann', 'p_evt') is not null and tests.row('ann', 'p_evt') ? 'event_id'
                and tests.row('ann', 'p_evt') -> 'event_id' = 'null'::jsonb and tests.row('ann', 'p_evt') -> 'event_name' = 'null'::jsonb
                and tests.row('ann', 'p_evt')::text not like '%birthday%' and tests.row('ann', 'p_evt')::text not like '%' || tests.c('e_bday') || '%',
                'EVT-1 Neighbor Ann (sees it only through Everyone) gets no event id or name, anywhere in the feed row');
select tests.ok(tests.row('ann', 'p_evt', 'get_timeline') ? 'event_id'
                and tests.row('ann', 'p_evt', 'get_timeline') -> 'event_id' = 'null'::jsonb
                and tests.row('ann', 'p_evt', 'get_timeline')::text not like '%birthday%',
                'EVT-1 ...nor in the timeline row');

-- ======================================================================
-- GRP-12: invites to any groups
-- ======================================================================
create function tests.invite(p_key text, p_targets text[], p_name text, p_history text default 'all') returns void language plpgsql as $$
declare v_code text; v_inv uuid; v_ids uuid[];
begin
  select array_agg(tests.c(t)) into v_ids from unnest(p_targets) t;
  perform tests.act('chase');
  execute 'select invite_id, code from public.create_invite(p_space => $1, p_role => ''viewer'', p_circle_ids => $2, p_name => $3, p_history => $4)'
    into v_inv, v_code using tests.space(), v_ids, p_name, p_history;
  insert into tests.vars values ('code_' || p_key, v_code) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'create_invite % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
create function tests.redeem(p_who text) returns void language plpgsql as $$
begin
  perform tests.act(p_who);
  execute 'select public.redeem_invite($1)' using tests.v('code_' || p_who);
exception when others then raise warning 'redeem % failed: % %', p_who, sqlstate, sqlerrm;
end $$;
create function tests.in_everyone(p_who text) returns boolean language sql stable as $$
  select in_everyone from public.space_members where space_id = tests.space() and user_id = tests.u(p_who) $$;

select tests.invite('dee', array['g_meemaw', 'e_bday'], 'Cousin Dee');
select tests.ok(tests.v('code_dee') is not null, 'GRP-12 a parent can name two groups (a group and an event) in one invite');
select tests.redeem('dee');
select tests.ok(tests.placed('g_meemaw', 'dee') and tests.placed('e_bday', 'dee'),
                'GRP-12 redeeming places Cousin Dee in each named group');
select tests.ok(tests.in_everyone('dee') = false and not tests.member('all', 'dee'),
                'GRP-12 ...and NOT in Everyone, because Everyone wasn''t named');
select tests.ok(exists (select 1 from public.circle_members where user_id = tests.u('dee'))
                and not exists (select 1 from public.circle_members where user_id = tests.u('dee') and not derived),
                'GRP-12 the legacy direct circle_members path is gone: every membership Dee got is derived from a placement');
select tests.invite('eve', array['all', 'g_porch'], 'Cousin Eve');
select tests.redeem('eve');
select tests.ok(tests.in_everyone('eve') and tests.member('all', 'eve') and tests.placed('g_porch', 'eve'),
                'GRP-12 an invite naming Everyone and Porch puts Cousin Eve in Everyone and in Porch');
select tests.level('h_hal', 'household', 'Hal''s house');
select tests.invite('hal', array['h_hal'], 'Uncle Hal');
select tests.redeem('hal');
select tests.ok(tests.in_everyone('hal') and tests.placed('h_hal', 'hal'),
                'GRP-12 an old-style invite naming a household still puts the person in Everyone too');
-- a named group retired before the invite is used
select tests.level('g_old', 'group', 'Old porch');
select tests.invite('fay', array['g_old', 'g_meemaw'], 'Cousin Fay');
select tests.ok(tests.v('code_fay') is not null, 'GRP-12 setup: invite naming Old porch and Meemaw''s made');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
select tests.try(format('select public.retire_level(%L)', tests.c('g_old')));
select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select (r -> 'body' ->> 'code') = '22023' and (r -> 'body' ->> 'details') = 'Chase'
                 from tests.rest(format('select public.invite_preview(%L)', tests.v('code_fay'))) r),
                'GRP-12 / UX-G7 preview refuses an invite naming a retired group (22023) with the inviter''s name');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000044', false);
select tests.ok((select (r -> 'body' ->> 'code') = '22023' from tests.rest(format('select public.redeem_invite(%L)', tests.v('code_fay'))) r)
                and not exists (select 1 from public.space_members where space_id = tests.space() and user_id = tests.u('fay')),
                'GRP-12 ...and redeem refuses it too (22023); Cousin Fay does not join');
select set_config('request.jwt.claim.sub', '', false);

-- ======================================================================
-- GRP-13: relatives never see a comment setting or a group they're not in
-- ======================================================================
:as_joe
select tests.ok_sql(format('select count(*) = 0 from public.my_circles(%L)', tests.space()),
                    'GRP-13 my_circles gives a relative nothing (AUD-14)');
select tests.ok_sql($q$select bool_and(id = any (select circle_id from public.circle_members where user_id = 'e2000000-0000-0000-0000-000000000021'))
                      from public.circles where space_id = '22222222-0000-0000-0000-0000000000e0'$q$,
                    'GRP-13 reading circles, a relative sees only groups they are in');
select tests.throws_code($q$select comment_mode from public.circles$q$,
                         'GRP-13 a relative can''t read any group''s comment setting from circles', '42501');
select tests.ok_sql(format($q$select count(*) = 0 from %s$q$, tests.tbl('comment_mode_log')),
                    'GRP-13 a relative reads no comment_mode_log rows');
:as_admin
create function tests.no_mode_key(p_who text) returns boolean language plpgsql as $$
declare r jsonb;
begin
  perform tests.act(p_who);
  for r in select to_jsonb(f) from public.get_feed(tests.space(), null, null, 50) f loop
    if r ? 'comment_mode' or r::text ~ '"(on_group_posts|always)"' then return false; end if;
  end loop;
  return true;
end $$;
select tests.ok(tests.no_mode_key('joe') and tests.no_mode_key('sue'),
                'GRP-13 feed rows never carry a comment setting for a relative');

-- ======================================================================
-- GRP-14: one rule everywhere
-- ======================================================================
select tests.ok_sql($q$select count(*) = 3
                         and bool_and(p.prosrc like '%group_reply_ok%')
                         and bool_and(p.prosrc !~ $r$'(household|event)'$r$)
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where (n.nspname, p.proname) in (('private', 'reply_ok'), ('public', 'reply_scope'), ('private', 'feed_rows'))$q$,
                    'GRP-14 reply_ok, reply_scope and feed_rows all call private.group_reply_ok and none checks kind household/event');

-- expected table (end state), from GRP-3..8: reader x comment -> reads?
create table tests.expect (reader text, comment text, expected boolean);
insert into tests.expect values
  ('chase', 'c3', true), ('mom', 'c3', true), ('rachel', 'c3', true), ('linda', 'c3', false), ('joe', 'c3', false),
  ('ann', 'c3', false), ('beth', 'c3', false), ('ray', 'c3', false), ('opal', 'c3', false),
  ('sue', 'c4', true), ('rachel', 'c4', true), ('linda', 'c4', true), ('ann', 'c4', false), ('opal', 'c4', false),
  ('rachel', 'c5', true), ('linda', 'c5', false), ('opal', 'c5', false), ('joe', 'c5', false),
  ('linda', 'c7a', false), ('linda', 'c7b', false), ('rachel', 'c7b', false),
  ('beth', 'c8', true), ('rachel', 'c8', true), ('joe', 'c8', false);
create function tests.reply_ok_as(p_who text, p_comment uuid) returns boolean language plpgsql as $$
declare v boolean;
begin
  execute 'select private.reply_ok($1, c.post_id, c.author_id, c.created_at) from public.comments c where c.id = $2'
    into v using tests.u(p_who), p_comment;
  return v;
exception when others then return null;
end $$;
select tests.ok((select count(*) from tests.expect e
                 where tests.reads(e.reader, e.comment) is distinct from e.expected
                    or tests.reads_rls(e.reader, tests.c(e.comment)) is distinct from e.expected
                    or tests.reply_ok_as(e.reader, tests.c(e.comment)) is distinct from e.expected) = 0
                and (select count(*) from tests.expect) = 24,
                format('GRP-14 for the 24-row family x post x writer x reader table, get_comments, RLS and reply_ok all give the expected answer (%s wrong)',
                       (select count(*) from tests.expect e
                        where tests.reads(e.reader, e.comment) is distinct from e.expected
                           or tests.reads_rls(e.reader, tests.c(e.comment)) is distinct from e.expected
                           or tests.reply_ok_as(e.reader, tests.c(e.comment)) is distinct from e.expected)));

-- every person x every comment: get_comments = RLS = reply_ok
create table tests.cmatrix (who text, comment_id uuid, via_rpc boolean, via_rls boolean, via_ok boolean);
insert into tests.cmatrix
select p.k, c.id,
       null::boolean, null::boolean, null::boolean
from tests.people p cross join public.comments c join public.posts po on po.id = c.post_id and po.space_id = tests.space();
create function tests.fill_cmatrix() returns void language plpgsql as $$
declare r record; v boolean;
begin
  for r in select who, comment_id from tests.cmatrix loop
    perform tests.act(r.who);
    begin
      select exists (select 1 from public.get_comments((select post_id from public.comments where id = r.comment_id), 200) g
                     where g.comment_id = r.comment_id) into v;
    exception when sqlstate 'P0002' then v := false;
    end;
    update tests.cmatrix set via_rpc = v, via_rls = tests.reads_rls(r.who, r.comment_id), via_ok = tests.reply_ok_as(r.who, r.comment_id)
     where who = r.who and comment_id = r.comment_id;
  end loop;
end $$;
select tests.fill_cmatrix();
select tests.ok((select count(*) from tests.cmatrix) = 10 * 7   -- 10 people x the 7 comments the fixture writes
                and not exists (select 1 from tests.cmatrix where via_rpc is distinct from via_rls or via_rls is distinct from via_ok),
                format('GRP-14 every person x every comment: get_comments = table RLS = reply_ok (%s disagree)',
                       (select count(*) from tests.cmatrix where via_rpc is distinct from via_rls or via_rls is distinct from via_ok)));

-- feed counts = RLS counts, per person x post they see
create function tests.count_mismatches() returns int language plpgsql as $$
declare r record; f record; n int := 0; v_c int; v_h int;
begin
  for r in select k from tests.people loop
    perform tests.act(r.k);
    for f in select post_id, comment_count, heart_count from public.get_feed(tests.space(), null, null, 50) loop
      execute 'set local role authenticated';
      select count(*) into v_c from public.comments where post_id = f.post_id;
      select count(*) into v_h from public.reactions where post_id = f.post_id;
      execute 'reset role';
      if v_c <> f.comment_count or v_h <> f.heart_count then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
select tests.ok(tests.count_mismatches() = 0,
                format('GRP-14 feed_rows comment and heart counts equal what table RLS shows, for every person x post (%s differ)', tests.count_mismatches()));

-- reply_scope agrees with reply_readers for relatives
create function tests.scope_mismatches() returns int language plpgsql as $$
declare r record; p record; n int := 0; v_scope text; v_readers text[]; v_insiders text[];
begin
  for r in select k from tests.people where role = 'viewer' loop
    for p in select id, author_id from public.posts where space_id = tests.space() and author_id <> tests.u(r.k) loop
      perform tests.act(r.k);
      if not public.can_view_post(p.id) then continue; end if;
      v_scope := public.reply_scope(p.id);
      v_readers := public.reply_readers(p.id);
      select array_agg(pr.display_name) into v_insiders from public.space_members sm join public.profiles pr on pr.id = sm.user_id
       where sm.space_id = tests.space() and (sm.role in ('owner', 'adult') or sm.user_id = p.author_id);
      if (v_scope = 'parents') <> (v_readers <@ v_insiders) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
exception when others then raise warning 'scope check failed: % %', sqlstate, sqlerrm; return -1;
end $$;
select tests.ok(tests.scope_mismatches() = 0,
                format('GRP-14 reply_scope = ''parents'' exactly when reply_readers names only parents and the poster (%s differ)', tests.scope_mismatches()));

-- ======================================================================
-- FLAG-1..3: three switches, server-side, default off
-- ======================================================================
select tests.ok(tests.feature_on_as('chase') = false, 'FLAG-1 with no rows, feature_on(space, ''video_posting'') is false (default off)');
select tests.ok(tests.my_features_has('chase') = false, 'FLAG-1 ...and my_features doesn''t list it');
select tests.flag_global(true);
select tests.flag_family(true);
select tests.ok(tests.feature_on_as('chase') = true and tests.feature_on_as('mom') = true,
                'FLAG-2 global on + family on: a parent (owner or adult) gets true');
select tests.ok(tests.feature_on_as('joe') = false, 'FLAG-2 ...a relative asking for the parents-only capability gets false');
select tests.ok(tests.my_features_has('chase') = true and tests.my_features_has('joe') = false,
                'FLAG-2 my_features lists video_posting for a parent, not for a relative');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
select tests.ok_sql(format('select public.can(%L, ''use_video'')', tests.space()), 'FLAG-2 can(space, ''use_video'') is true for a parent');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000021', false);
select tests.ok_sql(format('select not public.can(%L, ''use_video'')', tests.space()), 'FLAG-2 can(space, ''use_video'') is false for a relative');
select set_config('request.jwt.claim.sub', '', false);
select tests.flag_global(false);
select tests.ok(tests.feature_on_as('chase') = false, 'FLAG-2 global switch off (family on, parent): false');
select tests.flag_global(true);
select tests.flag_family(false);
select tests.ok(tests.feature_on_as('chase') = false, 'FLAG-2 family add-on off (global on, parent): false');

:as_chase
select tests.throws_code(format('insert into %s (feature, enabled) values (''ai_search'', true)', tests.tbl('feature_flags')),
                         'FLAG-3 the owner can''t write the global table', '42501');
select tests.throws_code(format('update %s set enabled = true where feature = ''video_posting''', tests.tbl('feature_flags')),
                         'FLAG-3 ...nor switch the global video flag on', '42501');
:as_joe
select tests.throws_code(format('insert into %s (feature, enabled) values (''ai_search'', true)', tests.tbl('feature_flags')),
                         'FLAG-3 a relative can''t write the global table', '42501');
select tests.throws_code(format('insert into %s (space_id, feature, enabled, set_by) values (%L, ''video_posting'', true, %L)',
                                tests.tbl('space_features'), tests.space(), tests.u('joe')),
                         'FLAG-3 a relative can''t write the family add-on', '42501');
select tests.try(format('update %s set enabled = true where space_id = %L', tests.tbl('space_features'), tests.space()));
:as_admin
select tests.ok_sql(format('select count(*) = 1 and not bool_or(enabled) from %s where space_id = %L and feature = ''video_posting''',
                           tests.tbl('space_features'), tests.space()),
                    'FLAG-3 ...nor switch it on with an UPDATE (still off)');
:as_chase
select tests.lives(format('update %s set enabled = true where space_id = %L and feature = ''video_posting''', tests.tbl('space_features'), tests.space()),
                   'FLAG-3 setup: a parent may switch the family add-on');
:as_admin
select tests.ok_sql(format('select bool_and(enabled) and count(*) = 1 from %s where space_id = %L and feature = ''video_posting''',
                           tests.tbl('space_features'), tests.space()),
                    'FLAG-3 the parent''s family add-on switch took effect');

-- ======================================================================
-- FLAG-4 (SQL side): the upload RPC sign-media calls refuses video when the flag is off
-- ======================================================================
insert into public.posts (id, space_id, author_id, caption)
values ('e5000000-0000-0000-0000-0000000000f4', :space_v, 'e2000000-0000-0000-0000-000000000001', 'flag-4 draft');
insert into public.post_audiences (post_id, circle_id) values ('e5000000-0000-0000-0000-0000000000f4', tests.c('all'));
select tests.flag_global(false);    -- family on, global off
\set video_item '''[{"kind":"video","mime_type":"video/mp4","width":1920,"height":1080,"duration_ms":5000,"byte_size":100000,"thumb_byte_size":1000,"exif_stripped":true}]'''
\set photo_item '''[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]'''
:as_chase
select tests.throws_code(format('select * from public.prepare_media_upload(%L, %L::jsonb)', 'e5000000-0000-0000-0000-0000000000f4', :video_item),
                         'FLAG-4 video_posting off: preparing a video upload is refused (42501 video_posting_off)', '42501');
select tests.lives(format('select * from public.prepare_media_upload(%L, %L::jsonb)', 'e5000000-0000-0000-0000-0000000000f4', :photo_item),
                   'FLAG-4 ...photos still upload with the flag off');
:as_admin
select tests.ok(not exists (select 1 from public.media_items where post_id = 'e5000000-0000-0000-0000-0000000000f4' and kind = 'video'),
                'FLAG-4 ...and no video row was created');
select tests.flag_global(true);
:as_chase
select tests.lives(format('select * from public.prepare_media_upload(%L, %L::jsonb)', 'e5000000-0000-0000-0000-0000000000f4', :video_item),
                   'FLAG-4 with all three switches on, a parent can prepare a video upload');

reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo GROUPS-V2 RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
