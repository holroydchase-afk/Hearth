-- Groups, households, events, roles and share history (docs/product/SPEC-GROUPS.md; migration 0011).
-- BETA-AUD-11..21, BETA-REPLY-7..13 and every required item of SPEC-GROUPS section 10
-- (privacy review, Oct 17). Written FIRST (qa-tdd, Oct 17): red until 0011 lands.
--
-- Fixture: Chase's real family shape (SPEC-GROUPS section 2, PERSONAS names) in its own space "Hearth family".
--   Parents:  Chase (owner), Mom (adult).
--   Chase's side    (group): Gammy's house [Gammy]; Grandaddy and Grandmomma's house [Grandaddy, Grandmomma];
--                            Gigi and Bebar's house [Gigi, Bebar].
--   Mom's side (group): Memaw's house [Memaw, Mom's sister]; Pawpaw and Granny's house
--                            [Pawpaw, Granny, Mom's sister]; Great-Grandma's house [Great-Grandma].
--   Mom's sister also has her own house (not under any group), linked to the Charleston trip.
--   Charleston trip    (event): Pawpaw and Granny's house + the sister's house.
--   Birthday at Gigi's (event): Grandaddy and Grandmomma's house, Gigi and Bebar's house, Pawpaw and Granny's house.
--   Everyone: every relative who joined by invite, plus the parents.
-- Relatives join the way the app does it: create_invite (naming one household, p_history required) + redeem_invite.
-- Gigi joins with "Only new photos" (p_history 'new'); everyone else with "Share all past photos".
--
-- Decisions this suite encodes (staff-pm / Chase can change them; then change the test first):
--   * Event replies = Event (SPEC-GROUPS question 1): everyone in an event on the post's audience reads each other.
--   * Readers are FIXED WHEN THE REPLY IS WRITTEN (privacy review item 5, default chosen Oct 17): moving
--     someone into a household, or adding a household to an event with "Share all past photos", does not
--     let new people read old comments or hearts. Narrowing stays read-time: whoever stops qualifying stops reading.
--   * A relative not allowed on a container gets 42501 for Everyone (item 2) and 42501 or 23514 for any other
--     container they are not in (today's create_post says 23514 "not found").
--   * reply_readers(p_post) returns text[] of display names (the name the family uses), never the caller.
-- Every call goes through dynamic SQL or a catching helper, so a missing function is a failed test, never an abort.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set space_h   '''22222222-0000-0000-0000-0000000000f0'''
\set space_a   '''22222222-0000-0000-0000-00000000000a'''

-- ---------- people ----------
create table tests.people (k text primary key, id uuid not null, name text not null, role public.member_role not null);
insert into tests.people values
  ('chase',      'f0000000-0000-0000-0000-000000000001', 'Chase',              'owner'),
  ('mom',   'f0000000-0000-0000-0000-000000000002', 'Mom',           'adult'),
  ('gammy',      'f0000000-0000-0000-0000-000000000011', 'Gammy',              'viewer'),
  ('grandaddy',  'f0000000-0000-0000-0000-000000000012', 'Grandaddy',          'viewer'),
  ('grandmomma', 'f0000000-0000-0000-0000-000000000013', 'Grandmomma',         'viewer'),
  ('gigi',       'f0000000-0000-0000-0000-000000000014', 'Gigi',               'viewer'),
  ('bebar',      'f0000000-0000-0000-0000-000000000015', 'Bebar',              'viewer'),
  ('memaw',      'f0000000-0000-0000-0000-000000000021', 'Memaw',              'viewer'),
  ('pawpaw',     'f0000000-0000-0000-0000-000000000022', 'Pawpaw',             'viewer'),
  ('granny',     'f0000000-0000-0000-0000-000000000023', 'Granny',             'viewer'),
  ('ggma',    'f0000000-0000-0000-0000-000000000024', 'Great-Grandma',    'viewer'),
  ('sister',     'f0000000-0000-0000-0000-000000000025', 'Mom''s sister', 'viewer');
grant select on tests.people to authenticated;

create function tests.u(p_k text) returns uuid language sql stable as $$ select id from tests.people where k = p_k $$;
create function tests.c(p_k text) returns uuid language sql stable as $$ select v::uuid from tests.vars where k = p_k $$;
create function tests.act(p_k text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(tests.u(p_k)::text, ''), true) $$;

-- run p_sql as p_who; first column as text / boolean (null on error)
create function tests.q(p_who text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform tests.act(p_who);
  execute p_sql into v;
  return v;
exception when others then
  raise warning 'as %: % % (%)', p_who, sqlstate, sqlerrm, p_sql;
  return null;
end $$;
create function tests.qb(p_who text, p_sql text) returns boolean language sql as $$ select tests.q(p_who, p_sql)::boolean $$;
create function tests.setq(p_k text, p_who text, p_sql text) returns void language sql as $$
  insert into tests.vars values (p_k, tests.q(p_who, p_sql)) on conflict (k) do update set v = excluded.v $$;

\set as_chase    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''f0000000-0000-0000-0000-000000000001'', false);'
\set as_gammy    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''f0000000-0000-0000-0000-000000000011'', false);'
\set as_gigi     'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''f0000000-0000-0000-0000-000000000014'', false);'

-- ---------- fixture helpers (admin; each acts as one person through the real RPCs) ----------
-- A container made by Chase through create_level. Stored under p_key.
create function tests.level(p_key text, p_kind text, p_name text, p_by text default 'chase') returns void language plpgsql as $$
declare v uuid;
begin
  perform tests.act(p_by);
  execute 'select public.create_level(p_space => $1, p_kind => $2, p_name => $3)' into v
    using '22222222-0000-0000-0000-0000000000f0'::uuid, p_kind, p_name;
  insert into tests.vars values (p_key, v::text) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'create_level % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
create function tests.link(p_parent text, p_child text, p_history text default 'all') returns void language plpgsql as $$
begin
  perform tests.act('chase');
  execute 'select public.link_level(p_parent => $1, p_child => $2, p_history => $3)' using tests.c(p_parent), tests.c(p_child), p_history;
exception when others then raise warning 'link_level % -> % failed: % %', p_child, p_parent, sqlstate, sqlerrm;
end $$;
create function tests.place(p_house text, p_who text, p_history text default 'all') returns void language plpgsql as $$
begin
  perform tests.act('chase');
  execute 'select public.place_person(p_household => $1, p_user => $2, p_history => $3)' using tests.c(p_house), tests.u(p_who), p_history;
exception when others then raise warning 'place_person % in % failed: % %', p_who, p_house, sqlstate, sqlerrm;
end $$;
-- Chase invites p_who to one household with a share-history choice; p_who redeems it.
create function tests.join(p_who text, p_house text, p_history text) returns void language plpgsql as $$
declare v_code text; v_inv uuid; v_name text := (select name from tests.people where k = p_who);
begin
  perform tests.act('chase');
  execute 'select invite_id, code from public.create_invite(p_space => $1, p_role => ''viewer'', p_circle_ids => $2, p_name => $3, p_history => $4)'
    into v_inv, v_code using '22222222-0000-0000-0000-0000000000f0'::uuid, array[tests.c(p_house)], v_name, p_history;
  insert into tests.vars values ('invite_' || p_who, v_inv::text) on conflict (k) do update set v = excluded.v;
  perform tests.act(p_who);
  execute 'select public.redeem_invite($1)' using v_code;
exception when others then raise warning 'invite % failed: % %', p_who, sqlstate, sqlerrm;
end $$;
-- A published post with one ready photo (admin insert, as the seed does). p_targets are container keys.
create function tests.post(p_key text, p_targets text[], p_author text default 'chase',
                           p_published timestamptz default null, p_taken timestamptz default null) returns void
language plpgsql as $$
declare v_post uuid := gen_random_uuid(); v_space uuid := '22222222-0000-0000-0000-0000000000f0'; t text;
begin
  insert into public.posts (id, space_id, author_id, caption, taken_at) values (v_post, v_space, tests.u(p_author), 'groups ' || p_key, p_taken);
  foreach t in array p_targets loop
    insert into public.post_audiences (post_id, circle_id) values (v_post, tests.c(t));
  end loop;
  insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                  width, height, byte_size, thumb_byte_size, exif_stripped)
  values (v_post, v_space, tests.u(p_author), 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true);
  update public.media_items set upload_status = 'ready' where post_id = v_post;
  insert into public.media_keys (media_id, wrapped_dek)
  select id, extensions.gen_random_bytes(40) from public.media_items where post_id = v_post;
  update public.posts set status = 'published' where id = v_post;
  if p_published is not null then update public.posts set published_at = p_published where id = v_post; end if;
  insert into tests.vars values (p_key, v_post::text) on conflict (k) do update set v = excluded.v;
exception when others then raise warning 'post % failed: % %', p_key, sqlstate, sqlerrm;
end $$;
-- p_who comments on a post through add_comment; stored under p_key.
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
create function tests.sees(p_who text, p_post text) returns boolean language plpgsql as $$
begin perform tests.act(p_who); return public.can_view_post(tests.c(p_post)); end $$;
create function tests.feed(p_who text) returns uuid[] language plpgsql as $$
declare v uuid[];
begin
  perform tests.act(p_who);
  execute 'select coalesce(array_agg(post_id), ''{}'') from public.get_feed($1, null, null, 50)' into v
    using '22222222-0000-0000-0000-0000000000f0'::uuid;
  return v;
exception when others then return null;
end $$;
create function tests.tl(p_who text) returns uuid[] language plpgsql as $$
declare v uuid[];
begin
  perform tests.act(p_who);
  execute 'select coalesce(array_agg(post_id), ''{}'') from public.get_timeline($1, null, null, 50)' into v
    using '22222222-0000-0000-0000-0000000000f0'::uuid;
  return v;
exception when others then return null;
end $$;
create function tests.times(p_ids uuid[], p_post text) returns int language sql as $$
  select case when p_ids is null or tests.c(p_post) is null then null
              else (select count(*)::int from unnest(p_ids) x where x = tests.c(p_post)) end $$;
-- Does p_who read comment p_comment (through get_comments)? "not found" = no.
create function tests.reads(p_who text, p_comment text) returns boolean language plpgsql as $$
declare v_post uuid;
begin
  select post_id into v_post from public.comments where id = tests.c(p_comment);
  if v_post is null then return null; end if;
  perform tests.act(p_who);
  return exists (select 1 from public.get_comments(v_post, 200) g where g.comment_id = tests.c(p_comment));
exception when sqlstate 'P0002' then return false;
end $$;
-- Does p_who read p_hearter's heart on p_post?
create function tests.reads_heart(p_who text, p_post text, p_hearter text) returns boolean language plpgsql as $$
begin
  if not exists (select 1 from public.reactions where post_id = tests.c(p_post) and user_id = tests.u(p_hearter)) then return null; end if;
  perform tests.act(p_who);
  return public.can_see_reply(tests.c(p_post), tests.u(p_hearter));
end $$;
-- p_who's feed counts for a post: 'hearts:comments'
create function tests.counts(p_who text, p_post text) returns text language plpgsql as $$
declare v text;
begin
  perform tests.act(p_who);
  execute 'select heart_count || '':'' || comment_count from public.get_feed($1, null, null, 50) where post_id = $2'
    into v using '22222222-0000-0000-0000-0000000000f0'::uuid, tests.c(p_post);
  return v;
exception when others then return null;
end $$;
-- reply_readers as p_who, sorted (null = "not found")
create function tests.readers(p_who text, p_post text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform tests.act(p_who);
  execute 'select array(select x from unnest(public.reply_readers($1)) x order by x)' into v using tests.c(p_post);
  return v;
exception when others then
  raise warning 'reply_readers failed: % %', sqlstate, sqlerrm;
  return array['<error ' || sqlstate || '>'];
end $$;
create function tests.names(p_names text[]) returns text[] language sql immutable as $$
  select array(select x from unnest(p_names) x order by x) $$;

-- ======================================================================
-- Shape (0011): the new pieces exist
-- ======================================================================
:as_admin
select tests.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'circles' and column_name = 'kind'),
                'BETA-AUD-11 shape: circles.kind exists (everyone | group | household | event)');
select tests.ok(to_regclass('public.circle_links') is not null and to_regclass('public.circle_people') is not null,
                'BETA-AUD-11 shape: circle_links and circle_people exist');
select tests.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'space_members' and column_name = 'sees_from')
                and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invites' and column_name = 'history')
                and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'circle_members' and column_name = 'sees_from'),
                'BETA-AUD-20 shape: space_members.sees_from, invites.history and circle_members.sees_from exist');
select tests.ok((select count(distinct p.proname) = 8 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('can', 'can_send_to', 'create_level', 'link_level', 'unlink_level',
                                                              'place_person', 'unplace_person', 'reply_readers'))
                and exists (select 1 from pg_proc where proname = 'link_allowed'),
                'BETA-AUD-13/21 shape: can, can_send_to, link_allowed, create_level, link_level, unlink_level, place_person, unplace_person, reply_readers exist');
select tests.ok(to_regprocedure('public.reply_readers(uuid)') is not null
                and not has_function_privilege('anon', coalesce(to_regprocedure('public.reply_readers(uuid)'), 'public.can_view_post(uuid)'::regprocedure), 'execute'),
                'BETA-REPLY-11 shape: anon cannot call reply_readers');

-- ======================================================================
-- Fixture
-- ======================================================================
insert into auth.users (id, email, raw_user_meta_data)
select id, k || '@hearth.test', jsonb_build_object('display_name', name) from tests.people;
insert into public.households (id, name, created_by) values ('11111111-0000-0000-0000-0000000000f0', 'Chase and Mom', tests.u('chase'));
insert into public.household_members (household_id, user_id, role) values ('11111111-0000-0000-0000-0000000000f0', tests.u('chase'), 'admin');
insert into public.spaces (id, household_id, name, plan, created_by)
values (:space_h, '11111111-0000-0000-0000-0000000000f0', 'Hearth family', 'family', tests.u('chase'));
insert into public.space_members (space_id, user_id, role, invited_by) values
  (:space_h, tests.u('chase'), 'owner', null),
  (:space_h, tests.u('mom'), 'adult', tests.u('chase'));
-- One Everyone per space (0011 may create it with the space; if not, make it here)
select tests.try($$insert into public.circles (space_id, name, kind, created_by)
                   select '22222222-0000-0000-0000-0000000000f0', 'Everyone', 'everyone', 'f0000000-0000-0000-0000-000000000001'
                   where not exists (select 1 from public.circles where space_id = '22222222-0000-0000-0000-0000000000f0' and kind = 'everyone')$$);
select tests.setv('all', $$select id from public.circles where space_id = '22222222-0000-0000-0000-0000000000f0' and kind = 'everyone'$$);

select tests.level('g_chase', 'group', 'Chase''s side');
select tests.level('g_dan',   'group', 'Mom''s side');
select tests.level('h_gammy', 'household', 'Gammy''s house');
select tests.level('h_gg',    'household', 'Grandaddy and Grandmomma''s house');
select tests.level('h_gigi',  'household', 'Gigi and Bebar''s house');
select tests.level('h_memaw', 'household', 'Memaw''s house');
select tests.level('h_pg',    'household', 'Pawpaw and Granny''s house');
select tests.level('h_phyl',  'household', 'Great-Grandma''s house');
select tests.level('h_sis',   'household', 'Mom''s sister''s house');
select tests.level('e_chs',   'event', 'Charleston trip');
select tests.level('e_bday',  'event', 'Birthday at Gigi''s');
select tests.link('g_chase', 'h_gammy'); select tests.link('g_chase', 'h_gg'); select tests.link('g_chase', 'h_gigi');
select tests.link('g_dan', 'h_memaw');   select tests.link('g_dan', 'h_pg');   select tests.link('g_dan', 'h_phyl');
select tests.link('e_chs', 'h_pg');      select tests.link('e_chs', 'h_sis');
select tests.link('e_bday', 'h_gg');     select tests.link('e_bday', 'h_gigi'); select tests.link('e_bday', 'h_pg');

select tests.join('gammy', 'h_gammy', 'all');
select tests.join('grandaddy', 'h_gg', 'all');
select tests.join('grandmomma', 'h_gg', 'all');
select tests.join('bebar', 'h_gigi', 'all');
select tests.join('gigi', 'h_gigi', 'new');       -- "Only new photos": T = her invite's creation time
select tests.join('memaw', 'h_memaw', 'all');
select tests.join('pawpaw', 'h_pg', 'all');
select tests.join('granny', 'h_pg', 'all');
select tests.join('ggma', 'h_phyl', 'all');
select tests.join('sister', 'h_memaw', 'all');
select tests.place('h_pg', 'sister');            -- the sibling workaround: in both of her parents' houses
select tests.place('h_sis', 'sister');
select tests.setv('t_gigi', $$select created_at from public.invites where id = (select v::uuid from tests.vars where k = 'invite_gigi')$$);

-- posts (Chase's unless noted). Published now (after T) unless a time is given.
select tests.post('p_ev',    array['all']);
select tests.post('p_dan',   array['g_dan']);
select tests.post('p_chase', array['g_chase']);
select tests.post('p_pg',    array['h_pg']);
select tests.post('p_memaw', array['h_memaw']);
select tests.post('p_chs',   array['e_chs']);
select tests.post('p_bday',  array['e_bday']);
select tests.post('p_mixed', array['all', 'e_chs']);
select tests.post('p_dpost', array['all'], 'mom');
select tests.post('p_old',      array['all'],    'chase', coalesce(tests.v('t_gigi')::timestamptz, now()) - interval '30 days');
select tests.post('p_old_gigi', array['h_gigi'], 'chase', coalesce(tests.v('t_gigi')::timestamptz, now()) - interval '29 days');
select tests.post('p_bulk',     array['h_gigi'], 'chase', null, '2024-07-04 15:00Z');   -- old photo, bulk-imported after T

-- replies
select tests.say('c_gammy',  'gammy',  'p_ev');   select tests.heart('gammy', 'p_ev');
select tests.say('c_sis',    'sister', 'p_ev');
select tests.say('c_memaw',  'memaw',  'p_ev');
select tests.say('c_pawpaw', 'pawpaw', 'p_ev'); select tests.heart('pawpaw', 'p_ev');
select tests.say('c_dan',    'mom', 'p_ev'); select tests.heart('mom', 'p_ev');
select tests.say('c_granny_chs', 'granny', 'p_chs');
select tests.say('c_sis_chs',    'sister', 'p_chs');
select tests.say('c_gd_bday',    'grandaddy', 'p_bday');
select tests.say('c_granny_mix', 'granny', 'p_mixed');
select tests.say('c_memaw_dan',  'memaw', 'p_dan');
select tests.say('c_gammy_dp',   'gammy', 'p_dpost');
select tests.say('c_bebar_old',  'bebar', 'p_old_gigi');

-- ======================================================================
-- BETA-AUD-11: a post to Mom's side reaches everyone placed under it, and nobody only under Chase's side
-- ======================================================================
select tests.ok(tests.sees('memaw', 'p_dan') and tests.sees('pawpaw', 'p_dan') and tests.sees('granny', 'p_dan')
                and tests.sees('ggma', 'p_dan') and tests.sees('sister', 'p_dan'),
                'BETA-AUD-11 allowed: Memaw, Pawpaw, Granny, Great-Grandma and Mom''s sister see the Mom''s side post');
select tests.ok(tests.sees('chase', 'p_dan') and tests.sees('mom', 'p_dan'),
                'BETA-AUD-11 allowed: both parents see it');
select tests.ok(not (tests.sees('gammy', 'p_dan') or tests.sees('grandaddy', 'p_dan') or tests.sees('grandmomma', 'p_dan')
                     or tests.sees('gigi', 'p_dan') or tests.sees('bebar', 'p_dan')),
                'BETA-AUD-11 excluded: nobody placed only under Chase''s side can open it by ID (can_view_post)');
select tests.ok(tests.times(tests.feed('gammy'), 'p_dan') = 0 and tests.times(tests.feed('grandaddy'), 'p_dan') = 0
                and tests.times(tests.feed('memaw'), 'p_dan') = 1,
                'BETA-AUD-11 feed: Memaw gets it once; Gammy and Grandaddy never do');
select tests.ok(tests.times(tests.tl('bebar'), 'p_dan') = 0 and tests.times(tests.tl('ggma'), 'p_dan') = 1,
                'BETA-AUD-11 timeline: Great-Grandma gets it; Bebar never does');
:as_gammy
select tests.ok_sql(format($$select count(*) = 0 from public.media_items where post_id = %L$$, tests.v('p_dan')),
                    'BETA-AUD-11 media signer: Gammy can read no media row (no key, no URL) of the Mom''s side post');
:as_admin
select tests.ok((select array_agg(o.recipient_id order by o.recipient_id) from public.notification_outbox o
                 where o.post_id = tests.c('p_dan') and o.kind = 'post')
                = (select array_agg(id order by id) from tests.people where k in ('mom', 'memaw', 'pawpaw', 'granny', 'ggma', 'sister')),
                'BETA-AUD-11 push and email: the post notice is queued for Mom, Memaw, Pawpaw, Granny, Great-Grandma and the sister only (once each)');
select tests.ok(tests.sees('gammy', 'p_chase') and tests.sees('gigi', 'p_chase') and not tests.sees('memaw', 'p_chase') and not tests.sees('sister', 'p_chase'),
                'BETA-AUD-11 both directions: the Chase''s side post reaches Gammy and Gigi, never Memaw or the sister');

-- ======================================================================
-- BETA-AUD-12: Mom's sister (two households) sees each post exactly once
-- ======================================================================
select tests.ok(tests.times(tests.feed('sister'), 'p_dan') = 1 and tests.times(tests.feed('sister'), 'p_pg') = 1
                and tests.times(tests.feed('sister'), 'p_memaw') = 1 and tests.times(tests.feed('sister'), 'p_ev') = 1,
                'BETA-AUD-12 feed: the sister gets the Mom''s side, Pawpaw and Granny''s house, Memaw''s house and Everyone posts once each');
select tests.ok(tests.times(tests.tl('sister'), 'p_dan') = 1 and tests.times(tests.tl('sister'), 'p_pg') = 1
                and tests.times(tests.tl('sister'), 'p_memaw') = 1 and tests.times(tests.tl('sister'), 'p_ev') = 1,
                'BETA-AUD-12 timeline: the same four posts once each');
select tests.ok(tests.times(tests.feed('sister'), 'p_chase') = 0 and tests.times(tests.tl('sister'), 'p_chase') = 0,
                'BETA-AUD-12 excluded: the sister never gets a Chase''s side post');
select tests.ok(tests.sees('memaw', 'p_memaw') and not tests.sees('pawpaw', 'p_memaw') and not tests.sees('memaw', 'p_pg'),
                'BETA-AUD-12 a person in two households does not bridge them: Pawpaw can''t see the Memaw''s house post, Memaw can''t see Pawpaw and Granny''s');

-- ======================================================================
-- BETA-AUD-18: the Charleston trip event
-- ======================================================================
select tests.ok(tests.sees('pawpaw', 'p_chs') and tests.sees('granny', 'p_chs') and tests.sees('sister', 'p_chs')
                and tests.sees('chase', 'p_chs') and tests.sees('mom', 'p_chs'),
                'BETA-AUD-18 allowed: Pawpaw, Granny, the sister and both parents see the Charleston trip post');
select tests.ok(not (tests.sees('memaw', 'p_chs') or tests.sees('gammy', 'p_chs') or tests.sees('ggma', 'p_chs')),
                'BETA-AUD-18 excluded: Memaw, Gammy and Great-Grandma don''t');
select tests.ok(tests.sees('pawpaw', 'p_dan') and tests.sees('pawpaw', 'p_ev') and tests.sees('sister', 'p_dan'),
                'BETA-AUD-18: the same people still get Mom''s side and Everyone posts');
select tests.ok(tests.sees('grandaddy', 'p_bday') and tests.sees('gigi', 'p_bday') and tests.sees('granny', 'p_bday')
                and not tests.sees('gammy', 'p_bday') and not tests.sees('memaw', 'p_bday'),
                'BETA-AUD-18 Birthday at Gigi''s: Grandaddy, Gigi and Granny see it; Gammy and Memaw never do');

-- ======================================================================
-- BETA-AUD-20: share history. Gigi chose "Only new photos" at T; Bebar "Share all past photos".
-- ======================================================================
select tests.ok_sql(format($$select %L is not null and (select history from public.invites where id = %L) = 'new'$$, tests.v('t_gigi'), tests.v('invite_gigi')),
                'BETA-AUD-20: Gigi''s invite records history = new');
select tests.ok_sql(format($$select (select sees_from from public.space_members where space_id = %L and user_id = %L) = %L::timestamptz
                and exists (select 1 from public.space_members where space_id = %L and user_id = %L and sees_from is null)$$,
                :space_h, tests.u('gigi'), tests.v('t_gigi'), :space_h, tests.u('bebar')),
                'BETA-AUD-20: redeeming copies the choice: Gigi''s sees_from = her invite''s creation time, Bebar''s is null (all)');
select tests.ok(not tests.sees('gigi', 'p_old') and not tests.sees('gigi', 'p_old_gigi'),
                'BETA-AUD-20 excluded: Gigi can''t open posts shared before T by ID (Everyone or her own house)');
select tests.ok(tests.times(tests.feed('gigi'), 'p_old') = 0 and tests.times(tests.feed('gigi'), 'p_old_gigi') = 0
                and tests.times(tests.tl('gigi'), 'p_old') = 0 and tests.times(tests.tl('gigi'), 'p_old_gigi') = 0,
                'BETA-AUD-20 excluded: neither is in her feed or timeline');
select tests.ok(tests.sees('gigi', 'p_ev') and tests.sees('gigi', 'p_bday') and tests.times(tests.feed('gigi'), 'p_ev') = 1,
                'BETA-AUD-20 allowed: posts shared at or after T show for Gigi');
select tests.ok(tests.sees('gigi', 'p_bulk') and tests.times(tests.tl('gigi'), 'p_bulk') = 1,
                'BETA-AUD-20 / privacy item 8: an old photo (taken 2024) bulk-imported after T counts as new: Gigi sees it (cutoff uses published_at, never taken_at)');
select tests.ok(tests.sees('bebar', 'p_old') and tests.sees('bebar', 'p_old_gigi') and tests.times(tests.tl('bebar'), 'p_old_gigi') = 1,
                'BETA-AUD-20 allowed: Bebar ("Share all past photos") sees both old posts');
create function tests.p0002(p_who text, p_sql text) returns boolean language plpgsql as $$
begin
  perform tests.act(p_who);
  execute p_sql;
  return false;
exception when sqlstate 'P0002' then return true;
when others then return false;
end $$;
select tests.ok(tests.p0002('gigi', format('select * from public.get_comments(%L)', tests.v('p_old_gigi')))
                and tests.p0002('gigi', format('select public.toggle_heart(%L)', tests.v('p_old_gigi'))),
                'BETA-AUD-20 replies: get_comments and toggle_heart on a pre-T post answer "not found" (P0002) for Gigi');
select tests.ok(tests.reads('bebar', 'c_bebar_old') and not coalesce(tests.reads('gigi', 'c_bebar_old'), true),
                'BETA-AUD-20 replies: Bebar''s comment on the pre-T post is not readable by Gigi (same household, but she can''t see the post)');
:as_gigi
select tests.ok_sql(format($$select count(*) = 0 from public.media_items where post_id in (%L, %L)$$, tests.v('p_old'), tests.v('p_old_gigi')),
                    'BETA-AUD-20 media signer: Gigi reads no media row of a pre-T post');
select tests.ok_sql(format($$select (select sum(post_count) from public.get_timeline_years(%L, 'UTC'))
                                    = (select count(*) from public.posts p where p.space_id = %L and p.status = 'published' and p.deleted_at is null and public.can_view_post(p.id))
                                and (select sum(post_count) from public.get_timeline_years(%L, 'UTC')) > 0$$, :space_h, :space_h, :space_h),
                    'BETA-AUD-20 years list: Gigi''s year counts add up to exactly the posts she may open (pre-T posts not counted)');
:as_admin

-- AUD-20 parity: every reader agrees, for every person and every post in the family.
create table tests.parity (who text, post_id uuid, cvp boolean, feed boolean, tl boolean, comments boolean, media boolean);
grant all on tests.parity to authenticated;
create function tests.fill_parity() returns void language plpgsql as $$
declare r record; v_feed uuid[]; v_tl uuid[]; v_media uuid[];
begin
  for r in select k from tests.people loop
    v_feed := tests.feed(r.k); v_tl := tests.tl(r.k);
    perform tests.act(r.k);
    execute 'set local role authenticated';
    select coalesce(array_agg(distinct post_id), '{}') into v_media from public.media_items where space_id = '22222222-0000-0000-0000-0000000000f0';
    execute 'reset role';
    insert into tests.parity
    select r.k, p.id, public.can_view_post(p.id), p.id = any (v_feed), p.id = any (v_tl),
           not tests.p0002(r.k, format('select * from public.get_comments(%L)', p.id)), p.id = any (v_media)
    from public.posts p where p.space_id = '22222222-0000-0000-0000-0000000000f0' and p.status = 'published' and p.deleted_at is null;
  end loop;
exception when others then raise warning 'parity fill failed: % %', sqlstate, sqlerrm;
end $$;
select tests.fill_parity();
select tests.ok((select count(*) from tests.parity) >= 12 * 12
                and not exists (select 1 from tests.parity where not (cvp = feed and feed = tl and tl = comments and comments = media)),
                'BETA-AUD-20 parity: for all 12 people x every post, can_view_post = get_feed = get_timeline = get_comments = media rows (sign-media)');
select tests.ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where p.proname = 'claim_notification_batches' and n.nspname = 'public'
                          and p.prosrc !~* 'join public\.circle_members'),
                'BETA-AUD-20 / privacy item 9: claim_notification_batches no longer copies the visibility rule (it calls the one shared predicate)');
-- a pending notice for a pre-T post is never sent to Gigi
select tests.try(format($$insert into public.notification_outbox (recipient_id, post_id, actor_id, kind, created_at)
                         values (%L, %L, %L, 'post', now() - interval '2 days') on conflict do nothing$$,
                        tests.u('gigi'), tests.v('p_old_gigi'), tests.u('chase')));
create table tests.claimed as select * from public.claim_notification_batches(now()) limit 0;
insert into tests.claimed select * from public.claim_notification_batches(now() + interval '8 days');
select tests.ok(not exists (select 1 from tests.claimed where recipient_id = tests.u('gigi') and tests.c('p_old_gigi') = any (post_ids))
                and not exists (select 1 from tests.claimed c, unnest(c.post_ids) pid, tests.parity p
                                where p.post_id = pid and p.who = (select k from tests.people where id = c.recipient_id) and not p.cvp)
                and exists (select 1 from tests.parity),
                'BETA-AUD-20 push and email: no claimed notice names a post its recipient can''t open (Gigi''s pre-T post included)');

-- ======================================================================
-- BETA-REPLY-7: household rule. Post to Everyone; Gammy comments and hearts.
-- ======================================================================
select tests.ok(tests.reads('chase', 'c_gammy') and tests.reads('mom', 'c_gammy') and tests.reads('gammy', 'c_gammy'),
                'BETA-REPLY-7 allowed: Chase (author, parent), Mom (parent) and Gammy''s household (Gammy) read her comment');
select tests.ok(not tests.reads('grandaddy', 'c_gammy') and not tests.reads('grandmomma', 'c_gammy') and not tests.reads('memaw', 'c_gammy'),
                'BETA-REPLY-7 excluded: Grandaddy, Grandmomma (and Memaw) don''t read Gammy''s comment');
select tests.ok(tests.reads_heart('chase', 'p_ev', 'gammy') and tests.reads_heart('mom', 'p_ev', 'gammy')
                and not tests.reads_heart('grandaddy', 'p_ev', 'gammy') and not tests.reads_heart('grandmomma', 'p_ev', 'gammy'),
                'BETA-REPLY-7 hearts: the parents see Gammy''s heart; Grandaddy and Grandmomma don''t');
select tests.ok(tests.counts('grandaddy', 'p_ev') = '1:1' and tests.counts('gammy', 'p_ev') = '2:2' and tests.counts('chase', 'p_ev') = '3:5',
                'BETA-REPLY-7 counts leave hidden replies out: Grandaddy 1 heart 1 comment (Mom''s), Gammy 2:2, Chase 3:5');

-- ======================================================================
-- BETA-REPLY-8: event rule (Event, SPEC-GROUPS question 1)
-- ======================================================================
select tests.ok(tests.reads('pawpaw', 'c_granny_chs') and tests.reads('sister', 'c_granny_chs')
                and tests.reads('chase', 'c_granny_chs') and tests.reads('mom', 'c_granny_chs'),
                'BETA-REPLY-8 allowed: Granny''s comment on the Charleston trip reaches Pawpaw, the sister (event rule), the parents and the author');
select tests.ok(not coalesce(tests.reads('memaw', 'c_granny_chs'), true),
                'BETA-REPLY-8 excluded: Memaw (can''t see the post at all) doesn''t read it');
select tests.ok(tests.reads('grandmomma', 'c_gd_bday') and tests.reads('gigi', 'c_gd_bday') and tests.reads('bebar', 'c_gd_bday')
                and tests.reads('pawpaw', 'c_gd_bday') and tests.reads('granny', 'c_gd_bday'),
                'BETA-REPLY-8 Birthday at Gigi''s: Grandaddy''s comment reaches Grandmomma, Gigi, Bebar, Pawpaw and Granny (everyone in the event)');
select tests.ok(not coalesce(tests.reads('gammy', 'c_gd_bday'), true) and not coalesce(tests.reads('memaw', 'c_gd_bday'), true),
                'BETA-REPLY-8 Birthday at Gigi''s: Gammy and Memaw never read it');
select tests.ok(tests.reads('pawpaw', 'c_granny_mix') and tests.reads('sister', 'c_granny_mix') and tests.reads('mom', 'c_granny_mix'),
                'BETA-REPLY-8 mixed audience (Everyone + Charleston trip): Granny''s comment reaches the event (Pawpaw, the sister) and the parents');
select tests.ok(tests.sees('memaw', 'p_mixed') and not tests.reads('memaw', 'c_granny_mix') and not tests.reads('gammy', 'c_granny_mix'),
                'BETA-REPLY-8 mixed audience: Memaw sees the photo but not Granny''s comment; nor does Gammy');

-- ======================================================================
-- BETA-REPLY-9: the sibling table (no relay); privacy item 4: direct placements only
-- ======================================================================
select tests.ok(tests.reads('memaw', 'c_sis') and tests.reads('pawpaw', 'c_sis') and tests.reads('granny', 'c_sis')
                and tests.reads('chase', 'c_sis') and tests.reads('mom', 'c_sis'),
                'BETA-REPLY-9: the sister''s comment reaches Memaw, Pawpaw, Granny, Chase and Mom');
select tests.ok(not tests.reads('gammy', 'c_sis') and not tests.reads('grandaddy', 'c_sis') and not tests.reads('ggma', 'c_sis'),
                'BETA-REPLY-9: ... and not Gammy, Grandaddy or Great-Grandma');
select tests.ok(tests.reads('sister', 'c_memaw') and tests.reads('chase', 'c_memaw') and tests.reads('mom', 'c_memaw'),
                'BETA-REPLY-9: Memaw''s comment reaches the sister, Chase and Mom');
select tests.ok(not tests.reads('pawpaw', 'c_memaw') and not tests.reads('granny', 'c_memaw'),
                'BETA-REPLY-9 no relay: Memaw''s comment does NOT reach Pawpaw or Granny (the sister doesn''t bridge the houses)');
select tests.ok(tests.reads('granny', 'c_pawpaw') and tests.reads('sister', 'c_pawpaw') and not tests.reads('memaw', 'c_pawpaw'),
                'BETA-REPLY-9 no relay: Pawpaw''s comment reaches Granny and the sister, but not Memaw');
select tests.ok(tests.reads_heart('granny', 'p_ev', 'pawpaw') and tests.reads_heart('sister', 'p_ev', 'pawpaw') and not tests.reads_heart('memaw', 'p_ev', 'pawpaw'),
                'BETA-REPLY-9 hearts: Pawpaw''s heart reaches Granny and the sister, not Memaw');
select tests.ok(tests.reads('sister', 'c_memaw_dan') and not tests.reads('ggma', 'c_memaw_dan') and not tests.reads('pawpaw', 'c_memaw_dan'),
                'privacy item 4: on a Mom''s side post, Memaw''s comment does not reach Great-Grandma or Pawpaw (a group never passes replies along)');

-- ======================================================================
-- BETA-REPLY-10: parents
-- ======================================================================
select tests.ok(tests.reads('gammy', 'c_dan') and tests.reads('grandaddy', 'c_dan') and tests.reads('ggma', 'c_dan')
                and tests.reads('gigi', 'c_dan') and tests.reads_heart('grandmomma', 'p_ev', 'mom'),
                'BETA-REPLY-10: Mom''s comment and heart on an Everyone post reach everyone who can see it');
select tests.ok(tests.reads('chase', 'c_gammy_dp') and tests.reads('mom', 'c_gammy_dp') and not tests.reads('memaw', 'c_gammy_dp'),
                'BETA-REPLY-10 / rule 4: on Mom''s post, Gammy''s comment reaches Mom (author) and Chase, not Memaw');
create function tests.parent_reads_all(p_who text) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform tests.act(p_who);
  select bool_and(public.can_see_reply(c.post_id, c.author_id)) and count(*) >= 10 into ok
  from public.comments c join public.posts p on p.id = c.post_id
  where p.space_id = '22222222-0000-0000-0000-0000000000f0' and c.deleted_at is null and public.can_view_post(c.post_id);
  return ok;
end $$;
select tests.ok(tests.parent_reads_all('chase') and tests.parent_reads_all('mom'),
                'BETA-REPLY-10: a parent reads every reply on every post they can see (Chase and Mom)');

-- ======================================================================
-- BETA-REPLY-11: reply_readers names exactly who the server allows
-- ======================================================================
select tests.ok(tests.readers('sister', 'p_ev') = tests.names(array['Memaw', 'Pawpaw', 'Granny', 'Chase', 'Mom']),
                'BETA-REPLY-11 sibling: reply_readers for the sister on an Everyone post = Memaw, Pawpaw, Granny, Chase, Mom');
select tests.ok(tests.readers('gammy', 'p_ev') = tests.names(array['Chase', 'Mom']),
                'BETA-REPLY-11 household of one: Gammy''s readers on an Everyone post = Chase, Mom');
select tests.ok(tests.readers('granny', 'p_chs') = tests.names(array['Pawpaw', 'Mom''s sister', 'Chase', 'Mom']),
                'BETA-REPLY-11 event: Granny''s readers on the Charleston trip = Pawpaw, the sister, Chase, Mom');
select tests.ok(tests.readers('pawpaw', 'p_ev') = tests.names(array['Granny', 'Mom''s sister', 'Chase', 'Mom']),
                'BETA-REPLY-11 household: Pawpaw''s readers on an Everyone post = Granny, the sister, Chase, Mom');
select tests.ok(cardinality(tests.readers('mom', 'p_ev')) = 11
                and not ('Mom' = any (tests.readers('mom', 'p_ev')))
                and not ('Gigi' = any (tests.readers('mom', 'p_old'))),
                'BETA-REPLY-11 parent: Mom''s readers on an Everyone post = all 11 others; on a pre-T post, not Gigi (privacy item 7)');
select tests.ok(tests.qb('memaw', format('select public.reply_readers(%L) is null', tests.v('p_chs'))),
                'BETA-REPLY-11 / privacy item 7: reply_readers on a post Memaw can''t see is null ("not found")');
create function tests.readers_match(p_who text, p_post uuid) returns boolean language plpgsql as $$
declare want text[] := '{}'; got text[]; m record;
begin
  perform tests.act(p_who);
  if not public.can_view_post(p_post) then return true; end if;
  execute 'select array(select x from unnest(public.reply_readers($1)) x order by x)' into got using p_post;
  for m in select k, name from tests.people where k <> p_who order by name loop
    perform tests.act(m.k);
    if public.can_see_reply(p_post, tests.u(p_who)) then want := want || m.name; end if;
  end loop;
  return coalesce(got, '{x}') = want;
exception when others then return false;
end $$;
select tests.ok((select bool_and(tests.readers_match(w.k, p.id)) and count(*) > 100
                 from tests.people w cross join public.posts p
                 where p.space_id = :space_h and p.status = 'published' and p.deleted_at is null),
                'BETA-REPLY-11 parity: for every person and post, reply_readers = exactly the members for whom can_see_reply(post, caller) is true');
-- 0010's page-level reply rule (private.feed_rows) agrees with can_see_reply (privacy item 7)
create function tests.count_match(p_who text) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform tests.act(p_who);
  execute $q$select bool_and(f.comment_count = (select count(*) from public.comments c where c.post_id = f.post_id and c.deleted_at is null
                                                  and public.can_see_reply(c.post_id, c.author_id))
                          and f.heart_count = (select count(*) from public.reactions r where r.post_id = f.post_id
                                                  and public.can_see_reply(r.post_id, r.user_id)))
             from public.get_feed($1, null, null, 50) f$q$ into ok using '22222222-0000-0000-0000-0000000000f0'::uuid;
  return ok;
end $$;
select tests.ok((select bool_and(tests.count_match(k)) from tests.people) and tests.counts('sister', 'p_ev') is not null,
                'privacy item 7 parity: feed heart and comment counts equal can_see_reply for every person (household and event rules)');

-- ======================================================================
-- BETA-REPLY-13: a relative allowed to post (milestone 4)
-- ======================================================================
update public.spaces set viewers_can_post = true where id = :space_h;
select tests.setq('p_gpost', 'gammy', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                                 p_caption => 'Gammy''s post', p_circle_ids => array[(select v::uuid from tests.vars where k = 'g_chase')])$$);
select tests.ok(tests.v('p_gpost') is not null, 'BETA-REPLY-13: Gammy (relative, posting on) can post to her own group, Chase''s side');

-- ======================================================================
-- BETA-AUD-21 + privacy item 2: who may send where (one can_send_to, used by create_post, the insert policy and publish_post)
-- ======================================================================
select tests.ok(tests.qb('chase', $$select public.can('22222222-0000-0000-0000-0000000000f0', 'send_to_everyone')$$),
                    'BETA-AUD-21: can(space, send_to_everyone) is true for Chase (owner)');
select tests.ok(tests.qb('mom', $$select public.can('22222222-0000-0000-0000-0000000000f0', 'send_to_everyone')$$),
                    'BETA-AUD-21: ... and for Mom (parent)');
select tests.ok(tests.qb('gammy', $$select not public.can('22222222-0000-0000-0000-0000000000f0', 'send_to_everyone')
                             and public.can('22222222-0000-0000-0000-0000000000f0', 'post')$$),
                    'BETA-AUD-21: Gammy (relative) can post (family switch on) but can''t send to Everyone');
select tests.ok((select count(distinct p.proname) = 2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('create_post', 'publish_post') and p.prosrc ilike '%can_send_to%'),
                'privacy item 2: create_post and publish_post both call can_send_to (publish re-checks)');
select tests.ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_audiences'
                        and cmd = 'INSERT' and with_check ilike '%can_send_to%'),
                'privacy item 2: the post_audiences insert policy calls can_send_to');
select tests.ok(exists (select 1 from pg_proc where proname = 'can_send_to' and prosrc ~ 'public\.can\('),
                'BETA-AUD-21: can_send_to goes through can(space, capability)');
select tests.ok(tests.qb('mom', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                             p_caption => 'to everyone', p_circle_ids => array[(select v::uuid from tests.vars where k = 'all')]) is not null$$),
                    'BETA-AUD-21 allowed: Mom (parent) sends to Everyone through create_post');
select tests.ok(tests.qb('chase', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                             p_caption => 'to everyone', p_circle_ids => array[(select v::uuid from tests.vars where k = 'all')]) is not null$$),
                    'BETA-AUD-21 allowed: Chase (owner) sends to Everyone through create_post');
create function tests.as_throws(p_who text, p_sql text, p_desc text, p_codes text[]) returns void language plpgsql as $$
begin
  perform tests.act(p_who);
  perform tests.throws_any(p_sql, p_desc, p_codes);
end $$;
select tests.as_throws('gammy', format($$select public.create_post(p_client_id => gen_random_uuid(), p_space => %L, p_caption => 'x', p_circle_ids => array[%L]::uuid[])$$,
                       :space_h, tests.v('all')),
                       'BETA-AUD-21 excluded: Gammy to Everyone by create_post is 42501', array['42501']);
select tests.as_throws('gammy', format($$select public.create_post(p_client_id => gen_random_uuid(), p_space => %L, p_caption => 'x', p_circle_ids => array[%L]::uuid[])$$,
                       :space_h, tests.v('g_dan')),
                       'privacy item 2: Gammy to Mom''s side (not hers) is refused', array['42501', '23514']);
select tests.as_throws('gammy', format($$select public.create_post(p_client_id => gen_random_uuid(), p_space => %L, p_caption => 'x', p_circle_ids => array[%L]::uuid[])$$,
                       :space_h, tests.v('e_bday')),
                       'privacy item 2: Gammy to Birthday at Gigi''s (an event she isn''t in) is refused', array['42501', '23514']);
select tests.as_throws('gammy', format($$select public.create_post(p_client_id => gen_random_uuid(), p_space => %L, p_caption => 'x', p_circle_ids => array[%L]::uuid[])$$,
                       :space_h, tests.v('h_memaw')),
                       'privacy item 2: Gammy to Memaw''s house is refused', array['42501', '23514']);
select tests.ok(tests.qb('gammy', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                             p_caption => 'my house', p_circle_ids => array[(select v::uuid from tests.vars where k = 'h_gammy')]) is not null$$),
                    'privacy item 2 allowed: Gammy may send to her own household');
-- direct post_audiences insert (and set_post_audience) on her own draft
select tests.setq('gdraft', 'gammy', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                                p_caption => 'draft', p_circle_ids => array[(select v::uuid from tests.vars where k = 'h_gammy')])$$);
:as_gammy
select tests.throws_code(format($$insert into public.post_audiences (post_id, circle_id) values (%L, %L)$$, tests.v('gdraft'), tests.v('all')),
                         'BETA-AUD-21 excluded: Gammy''s direct post_audiences insert of Everyone is 42501 (insert policy)', '42501');
select tests.throws_code(format($$select public.set_post_audience(%L, array[%L, %L]::uuid[])$$, tests.v('gdraft'), tests.v('h_gammy'), tests.v('all')),
                         'BETA-AUD-21 excluded: set_post_audience adding Everyone is 42501 for Gammy', '42501');
:as_admin
-- publish_post re-checks: a draft that names Everyone (written in by admin) can't be published by a relative
select tests.try(format($$insert into public.post_audiences (post_id, circle_id) values (%L, %L)$$, tests.v('gdraft'), tests.v('all')));
select tests.try(format($$insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key, width, height, byte_size, thumb_byte_size, exif_stripped)
                          values (%L, %L, %L, 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true)$$, tests.v('gdraft'), :space_h, tests.u('gammy')));
select tests.try(format($$update public.media_items set upload_status = 'ready' where post_id = %L$$, tests.v('gdraft')));
select tests.as_throws('gammy', format($$select public.publish_post(%L)$$, tests.v('gdraft')),
                       'BETA-AUD-21 excluded: publish_post of a draft naming Everyone is 42501 for a relative', array['42501']);
-- a parent demoted after drafting to Everyone can't publish it
select tests.setq('ddraft', 'mom', $$select public.create_post(p_client_id => gen_random_uuid(), p_space => '22222222-0000-0000-0000-0000000000f0',
                                p_caption => 'draft to everyone', p_circle_ids => array[(select v::uuid from tests.vars where k = 'all')])$$);
select tests.try(format($$insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key, width, height, byte_size, thumb_byte_size, exif_stripped)
                          values (%L, %L, %L, 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true)$$, tests.v('ddraft'), :space_h, tests.u('mom')));
select tests.try(format($$update public.media_items set upload_status = 'ready' where post_id = %L$$, tests.v('ddraft')));
update public.space_members set role = 'viewer' where space_id = :space_h and user_id = tests.u('mom');
select tests.as_throws('mom', format($$select public.publish_post(%L)$$, coalesce(tests.v('ddraft'), '00000000-0000-0000-0000-000000000000')),
                       'privacy item 2: Mom, demoted to relative after drafting to Everyone, can''t publish it (42501)', array['42501']);
update public.space_members set role = 'adult' where space_id = :space_h and user_id = tests.u('mom');
update public.spaces set viewers_can_post = false where id = :space_h;
select tests.as_throws('gammy', format($$select public.create_post(p_client_id => gen_random_uuid(), p_space => %L, p_caption => 'x', p_circle_ids => array[%L]::uuid[])$$,
                       :space_h, tests.v('h_gammy')),
                       'privacy item 2: with posting off, Gammy can''t send even to her own house (can(space, post) is false)', array['42501']);

-- ======================================================================
-- BETA-AUD-14: a relative learns nothing about the family's shape
-- ======================================================================
:as_gammy
select tests.ok_sql(format($$select coalesce(bool_and(name in ('Everyone', 'Chase''s side', 'Gammy''s house')
                                                      and member_names <@ array['Gammy', 'Chase', 'Mom']), true)
                             from public.my_circles(%L)$$, :space_h),
                    'BETA-AUD-14: my_circles gives Gammy no other household, group or event, and no other household''s member names');
select tests.ok_sql(format($$select count(*) = 0 from public.circles where space_id = %L
                             and name not in ('Everyone', 'Chase''s side', 'Gammy''s house')$$, :space_h),
                    'BETA-AUD-14: reading circles directly, Gammy sees no other container''s name or kind');
select tests.ok_sql('select count(*) = 0 from public.circle_links',
                    'BETA-AUD-14: Gammy can read no circle_links row (no links between containers)');
select tests.ok_sql($$select count(*) = 0 from public.circle_people where user_id <> 'f0000000-0000-0000-0000-000000000011'$$,
                    'BETA-AUD-14: circle_people shows Gammy only her own placement');
select tests.ok_sql($$select count(*) = 0 from public.circle_members where user_id <> 'f0000000-0000-0000-0000-000000000011'$$,
                    'BETA-AUD-14: circle_members shows Gammy no one else (no member counts, no other household''s members)');
select tests.ok_sql(format($$select bool_and(audience is null and seen_count is null and reach_count is null) and count(*) > 0
                             from public.get_feed(%L, null, null, 50)$$, :space_h),
                    'BETA-AUD-14: Gammy''s feed shows posts and their authors only: no audience, seen or reach on anyone else''s post');
:as_admin

-- ======================================================================
-- BETA-AUD-13: bad shapes are 23514, non-parents P0002, and nothing changes
-- ======================================================================
insert into public.space_members (space_id, user_id, role, invited_by) values (:space_a, tests.u('chase'), 'adult', 'a0000000-0000-0000-0000-00000000000a');
select tests.setq('h_other', 'chase', $$select public.create_level(p_space => '22222222-0000-0000-0000-00000000000a', p_kind => 'household', p_name => 'Rivera house')$$);
select tests.level('h_test', 'household', 'Test house');
select tests.try($$create table tests.shape_before as select
  (select count(*) from public.circle_links) as links, (select count(*) from public.circle_people) as people,
  (select count(*) from public.circles where space_id = '22222222-0000-0000-0000-0000000000f0') as circles,
  (select count(*) from public.circle_members) as members$$);
create function tests.chase_throws(p_sql text, p_desc text, p_code text) returns void language plpgsql as $$
begin perform tests.act('chase'); perform tests.throws_code(p_sql, p_desc, p_code); end $$;
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('g_chase'), tests.v('g_dan')),
                          'BETA-AUD-13: a group under a group is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('h_gammy'), tests.v('h_gg')),
                          'BETA-AUD-13: a household under a household is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('h_gammy'), tests.v('g_chase')),
                          'BETA-AUD-13: anything under a household (a group) is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('g_chase'), tests.v('e_bday')),
                          'BETA-AUD-13: an event under a group is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('e_chs'), tests.v('e_bday')),
                          'BETA-AUD-13: an event under an event is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('all'), tests.v('g_chase')),
                          'BETA-AUD-13: linking anything under Everyone is 23514', '23514');
select tests.chase_throws(format('select public.place_person(%L, %L, ''all'')', tests.v('g_chase'), tests.u('gammy')),
                          'BETA-AUD-13: placing a person in a group is 23514 (people go only in households)', '23514');
select tests.chase_throws(format('select public.place_person(%L, %L, ''all'')', tests.v('e_chs'), tests.u('gammy')),
                          'BETA-AUD-13: placing a person in an event is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('g_dan'), tests.v('h_other')),
                          'BETA-AUD-13: linking across two families (spaces) is 23514, even for a parent of both', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''all'')', tests.v('h_test'), tests.v('h_test')),
                          'BETA-AUD-13: a loop (a container under itself) is 23514', '23514');
select tests.chase_throws(format('select public.create_level(%L, ''everyone'', ''Everyone again'')', :space_h),
                          'BETA-AUD-13: a second Everyone is 23514', '23514');
select tests.chase_throws(format('select public.create_level(%L, ''side'', ''Mom''''s side'')', :space_h),
                          'BETA-AUD-13: an unknown kind is 23514', '23514');
-- privacy item 3: same-space and loop checks are triggers, not only RPC code
select tests.throws_code(format('insert into public.circle_links (parent_id, child_id) values (%L, %L)', tests.v('g_dan'), tests.v('h_other')),
                         'privacy item 3: a direct cross-space circle_links insert (even as admin) is refused by trigger (23514)', '23514');
select tests.throws_code(format('insert into public.circle_links (parent_id, child_id) values (%L, %L)', tests.v('g_chase'), tests.v('g_dan')),
                         'privacy item 3: a direct group-under-group insert is refused by link_allowed in a trigger (23514)', '23514');
select tests.throws_code(format('insert into public.circle_people (circle_id, user_id) values (%L, %L)', tests.v('g_chase'), tests.u('gammy')),
                         'privacy item 3: a direct circle_people insert into a group is refused (23514)', '23514');
-- non-parents: P0002 on every setup RPC
create function tests.gammy_p0002(p_sql text, p_desc text) returns void language plpgsql as $$
begin perform tests.act('gammy'); perform tests.throws_code(p_sql, p_desc, 'P0002'); end $$;
select tests.gammy_p0002(format('select public.create_level(%L, ''household'', ''Gammy''''s new house'')', :space_h), 'BETA-AUD-13: Gammy calling create_level is P0002');
select tests.gammy_p0002(format('select public.link_level(%L, %L, ''all'')', tests.v('g_dan'), tests.v('h_test')), 'BETA-AUD-13: Gammy calling link_level is P0002');
select tests.gammy_p0002(format('select public.unlink_level(%L, %L)', tests.v('g_chase'), tests.v('h_gg')), 'BETA-AUD-13: Gammy calling unlink_level is P0002');
select tests.gammy_p0002(format('select public.place_person(%L, %L, ''all'')', tests.v('h_gammy'), tests.u('grandaddy')), 'BETA-AUD-13: Gammy calling place_person is P0002');
select tests.gammy_p0002(format('select public.unplace_person(%L, %L)', tests.v('h_gg'), tests.u('grandaddy')), 'BETA-AUD-13: Gammy calling unplace_person is P0002');
select tests.ok_sql($$select (select links from tests.shape_before) = (select count(*) from public.circle_links)
                and (select people from tests.shape_before) = (select count(*) from public.circle_people)
                and (select circles from tests.shape_before) = (select count(*) from public.circles where space_id = '22222222-0000-0000-0000-0000000000f0')
                and (select members from tests.shape_before) = (select count(*) from public.circle_members)
                and (select links from tests.shape_before) >= 11$$,
                'BETA-AUD-13: after every refused call, links, placements, containers and derived members are unchanged');

-- ======================================================================
-- BETA-AUD-19: the server refuses an add with no share-history choice
-- ======================================================================
select tests.chase_throws(format('select public.link_level(%L, %L, null)', tests.v('g_dan'), tests.v('h_test')),
                          'BETA-AUD-19: link_level with no history is 23514', '23514');
select tests.chase_throws(format('select public.link_level(%L, %L, ''some'')', tests.v('g_dan'), tests.v('h_test')),
                          'BETA-AUD-19: link_level with a made-up history is 23514', '23514');
select tests.chase_throws(format('select public.place_person(%L, %L, null)', tests.v('h_test'), tests.u('ggma')),
                          'BETA-AUD-19: place_person with no history is 23514', '23514');
select tests.chase_throws(format($$select public.create_invite(p_space => %L, p_role => 'viewer', p_circle_ids => array[%L]::uuid[], p_name => 'Grandma June')$$,
                                 :space_h, tests.v('h_test')),
                          'BETA-AUD-19: create_invite for a relative with no p_history is 23514', '23514');
select tests.chase_throws(format($$select public.create_invite(p_space => %L, p_role => 'viewer', p_circle_ids => array[%L]::uuid[], p_name => 'Grandma June', p_history => 'everything')$$,
                                 :space_h, tests.v('h_test')),
                          'BETA-AUD-19: create_invite with a made-up p_history is 23514', '23514');
select tests.chase_throws(format($$select public.create_invite(p_space => %L, p_role => 'viewer', p_circle_ids => array[%L]::uuid[], p_name => 'Grandma June', p_history => 'all')$$,
                                 :space_h, tests.v('g_dan')),
                          'BETA-AUD-19: an invite names one household, not a group (23514)', '23514');

-- ======================================================================
-- BETA-REPLY-12: the 0009 switch is gone
-- ======================================================================
select tests.ok(not exists (select 1 from pg_proc where proname = 'set_group_replies_shared'),
                'BETA-REPLY-12: set_group_replies_shared is dropped');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'circles' and column_name = 'replies_shared'),
                'BETA-REPLY-12: circles.replies_shared is dropped');
select tests.ok(exists (select 1 from pg_proc p where p.proname = 'my_circles')
                and not exists (select 1 from pg_proc p where p.proname = 'my_circles' and 'replies_shared' = any (p.proargnames))
                and exists (select 1 from pg_proc p where p.proname = 'my_circles' and 'kind' = any (p.proargnames) and 'parent_ids' = any (p.proargnames)),
                'BETA-REPLY-12 / API: my_circles returns kind and parent_ids, and no replies_shared');

-- ======================================================================
-- privacy item 3: circle_members, circle_links and circle_people are trigger-written only
-- ======================================================================
select tests.ok(coalesce(not (has_table_privilege('authenticated', 'public.circle_members', 'INSERT')
                              or has_table_privilege('authenticated', 'public.circle_members', 'UPDATE')
                              or has_table_privilege('authenticated', 'public.circle_members', 'DELETE')), false),
                'privacy item 3: app users can''t insert, update or delete circle_members (derived by trigger only)');
select tests.ok(to_regclass('public.circle_links') is not null and to_regclass('public.circle_people') is not null
                and not (has_table_privilege('authenticated', 'public.circle_links', 'INSERT') or has_table_privilege('authenticated', 'public.circle_links', 'UPDATE')
                         or has_table_privilege('authenticated', 'public.circle_links', 'DELETE') or has_table_privilege('authenticated', 'public.circle_people', 'INSERT')
                         or has_table_privilege('authenticated', 'public.circle_people', 'UPDATE') or has_table_privilege('authenticated', 'public.circle_people', 'DELETE')),
                'privacy item 3: app users can''t write circle_links or circle_people directly (only through the RPCs)');

-- ======================================================================
-- Readers are fixed when the reply is written (privacy item 5, default chosen Oct 17)
-- ======================================================================
-- Memaw also joins Pawpaw and Granny's house.
select tests.place('h_pg', 'memaw');
select tests.ok(not tests.reads('pawpaw', 'c_memaw') and not tests.reads('granny', 'c_memaw'),
                'privacy item 5: after Memaw joins Pawpaw and Granny''s house, they still don''t read the comment she wrote before');
select tests.ok(not tests.reads('memaw', 'c_pawpaw') and not tests.reads_heart('memaw', 'p_ev', 'pawpaw'),
                'privacy item 5: ... and Memaw doesn''t read Pawpaw''s earlier comment or heart (written for Granny, the sister and the parents)');
select tests.say('c_memaw2', 'memaw', 'p_ev');
select tests.ok(tests.reads('pawpaw', 'c_memaw2') and tests.reads('granny', 'c_memaw2'),
                'privacy item 5: a comment Memaw writes after the move reaches Pawpaw and Granny');
select tests.ok(tests.readers('memaw', 'p_ev') = tests.names(array['Mom''s sister', 'Pawpaw', 'Granny', 'Chase', 'Mom']),
                'privacy item 5 / REPLY-11: Memaw''s comment box now names the sister, Pawpaw, Granny, Chase and Mom');
-- A household added to an event with "Share all past photos": sees old photos, not old comments.
select tests.link('e_chs', 'h_memaw', 'all');
select tests.ok(tests.sees('memaw', 'p_chs'),
                'BETA-AUD-20: Memaw''s house added to the Charleston trip with "Share all past photos": Memaw sees the trip''s earlier post');
select tests.ok(not tests.reads('memaw', 'c_granny_chs') and not tests.reads('memaw', 'c_sis_chs'),
                'privacy item 5: ... but not the trip comments written before her house was added (Granny''s, and even the sister''s, whose box never named Memaw)');
select tests.say('c_granny_chs2', 'granny', 'p_chs');
select tests.ok(tests.reads('memaw', 'c_granny_chs2'),
                'privacy item 5: Granny''s next comment on the trip reaches Memaw (event rule, now that she''s in it)');
-- "Only new photos" for an event add
select tests.link('e_chs', 'h_phyl', 'new');
select tests.ok(not tests.sees('ggma', 'p_chs'),
                'BETA-AUD-20: Great-Grandma''s house added to the trip with "Only new photos": she can''t open its earlier post');
select tests.post('p_chs2', array['e_chs']);
select tests.ok(tests.sees('ggma', 'p_chs2'), 'BETA-AUD-20: ... and does see the next trip post');
-- Narrowing stays read-time
select tests.q('chase', format('select public.unplace_person(%L, %L)', tests.v('h_pg'), tests.u('sister')));
select tests.ok(not tests.reads('pawpaw', 'c_sis') and not tests.reads('granny', 'c_sis') and tests.reads('memaw', 'c_sis'),
                'privacy item 5 narrowing: once the sister leaves Pawpaw and Granny''s house, they stop reading her old comment; Memaw (still her house) keeps it');

-- ======================================================================
-- BETA-AUD-15: removals bite in the same transaction
-- ======================================================================
create function tests.unplace_then_sees(p_house text, p_who text, p_post text) returns boolean language plpgsql as $$
begin
  perform tests.act('chase');
  execute 'select public.unplace_person($1, $2)' using tests.c(p_house), tests.u(p_who);
  return tests.sees(p_who, p_post);
exception when others then return null;
end $$;
select tests.ok(tests.unplace_then_sees('h_phyl', 'ggma', 'p_dan') = false,
                'BETA-AUD-15: Great-Grandma removed from her house loses the Mom''s side post in the same transaction');
create function tests.unlink_then_sees(p_parent text, p_child text, p_who text, p_post text) returns boolean language plpgsql as $$
begin
  perform tests.act('chase');
  execute 'select public.unlink_level($1, $2)' using tests.c(p_parent), tests.c(p_child);
  return tests.sees(p_who, p_post);
exception when others then return null;
end $$;
select tests.ok(tests.unlink_then_sees('g_chase', 'h_gammy', 'gammy', 'p_chase') = false,
                'BETA-AUD-15: Gammy''s house unlinked from Chase''s side: Gammy loses its posts in the same transaction');
select tests.ok(tests.unlink_then_sees('e_bday', 'h_pg', 'granny', 'p_bday') = false,
                'BETA-AUD-15: Pawpaw and Granny''s house unlinked from the birthday event: Granny loses the event post at once');
select tests.ok(tests.sees('grandaddy', 'p_chase') and tests.sees('gammy', 'p_ev') and tests.sees('grandaddy', 'p_bday'),
                'BETA-AUD-15 allowed: everyone else keeps theirs (Grandaddy keeps Chase''s side and the birthday; Gammy keeps Everyone)');
:as_gammy
select tests.ok_sql(format($$select count(*) = 0 from public.media_items where post_id = %L$$, tests.v('p_chase')),
                    'BETA-AUD-15: Gammy can no longer read the media rows (sign-media refuses new URLs)');
:as_admin

-- ======================================================================
-- privacy item 10: removed, then re-invited: a fresh choice; no old cutoff survives
-- ======================================================================
delete from public.space_members where space_id = :space_h and user_id = tests.u('gigi');
select tests.ok_sql(format($$select not exists (select 1 from public.circle_people where user_id = %L)
                and not exists (select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
                                where cm.user_id = %L and c.space_id = %L)$$, tests.u('gigi'), tests.u('gigi'), :space_h),
                'privacy item 10: removing Gigi from the family removes her placements and derived memberships');
select tests.join('gigi', 'h_gigi', 'all');
select tests.ok(tests.sees('gigi', 'p_old_gigi') and tests.sees('gigi', 'p_old'),
                'privacy item 10: re-invited with "Share all past photos", Gigi now sees the posts from before her first invite');

-- ======================================================================
-- Summary
-- ======================================================================
reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo GROUPS RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
