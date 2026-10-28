-- Timeline tests (BETA-TIME-2, BETA-TIME-3; migration 0010).
-- get_timeline / get_timeline_years: order by coalesce(taken_at, published_at), keyset pages,
-- "not found" (simply absent) for posts the caller can't see, both directions, and ONE shared
-- visibility function with get_feed (private.visible_posts) so 0011's share-history cutoff lands once.
-- Runs against a FRESH db: stub -> migrations -> seed -> this file (see tests/run.sh).
-- Every call goes through dynamic SQL, so a missing function is a failed test, never an abort.
\set ON_ERROR_STOP 1
\pset footer off
set client_min_messages = warning;
\o /dev/null


-- ---------- harness ----------
create schema tests;
create table tests.results (n serial, ok boolean not null, description text not null);
create table tests.vars (k text primary key, v text);
create function tests.ok(p_ok boolean, p_desc text) returns void language sql as $$
  insert into tests.results (ok, description) values (coalesce(p_ok, false), p_desc) $$;
-- boolean query; an error is a failure, never an abort
create function tests.ok_sql(p_sql text, p_desc text) returns void language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  perform tests.ok(v, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
end $$;
-- must fail with exactly this SQLSTATE
create function tests.throws_code(p_sql text, p_desc text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform tests.ok(sqlstate = p_code, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
    return;
  end;
  perform tests.ok(false, p_desc || '  [expected ' || p_code || ', none raised]');
end $$;
create function tests.lives(p_sql text, p_desc text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform tests.ok(true, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
end $$;
-- run a scalar query and remember the result (null on error)
create function tests.setv(p_k text, p_sql text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := null; end;
  insert into tests.vars values (p_k, v) on conflict (k) do update set v = excluded.v;
end $$;
-- setup step that must not abort the run (assertions downstream catch problems)
create function tests.try(p_sql text) returns void language plpgsql as $$
begin execute p_sql; exception when others then raise warning 'setup failed: % (%)', sqlerrm, p_sql; end $$;
create function tests.v(p_k text) returns text language sql stable as $$ select v from tests.vars where k = p_k $$;
-- Simulate a PostgREST request: PostgREST sets request.method/request.headers and
-- reads response.status. Returns {status, body}. Never raises.
create function tests.rest(p_sql text, p_headers jsonb default '{}') returns jsonb language plpgsql as $$
declare v json;
begin
  perform set_config('request.method', 'POST', true);
  perform set_config('request.headers', p_headers::text, true);
  perform set_config('response.status', '', true);
  begin
    execute p_sql into v;
  exception when others then
    return jsonb_build_object('status', 'raised', 'body', jsonb_build_object('code', sqlstate, 'message', sqlerrm));
  end;
  return jsonb_build_object('status', coalesce(nullif(current_setting('response.status', true), ''), '200'),
                            'body', v::jsonb);
end $$;
grant usage on schema tests to authenticated, anon;
grant select, insert, update on tests.results, tests.vars to authenticated, anon;
grant usage on sequence tests.results_n_seq to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- ids (seed.sql)
\set alex      '''a0000000-0000-0000-0000-00000000000a'''
\set blair     '''b0000000-0000-0000-0000-00000000000b'''
\set gma_riv   '''a0000000-0000-0000-0000-0000000000a1'''
\set gma_chen  '''b0000000-0000-0000-0000-0000000000b1'''
\set space_a   '''22222222-0000-0000-0000-00000000000a'''
\set space_b   '''22222222-0000-0000-0000-00000000000b'''
\set c_a_all   '''33333333-0000-0000-0000-0000000000a0'''
\set c_a_gp    '''33333333-0000-0000-0000-0000000000a1'''
\set c_a_co    '''33333333-0000-0000-0000-0000000000a2'''
\set p_a_gp    '''55555555-0000-0000-0000-0000000000a1'''
\set p_a_co    '''55555555-0000-0000-0000-0000000000a2'''
\set p_a_all   '''55555555-0000-0000-0000-0000000000a3'''

\set as_alex     'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_blair    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-00000000000b'', false);'
\set as_gma_riv  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_gpa_riv  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a2'', false);'
\set as_gma_chen 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-0000000000b1'', false);'
\set as_anon     'reset role; set role anon; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'

-- ---------- fixture helpers (admin only) ----------
-- A published post by Alex to one circle, with ready photos, a capture time and a share time.
create function tests.tlpost(p_key text, p_circle uuid, p_photos int, p_taken timestamptz, p_published timestamptz,
                             p_status text default 'published', p_deleted boolean default false) returns void
language plpgsql as $$
declare v_post uuid := gen_random_uuid(); v_space uuid;
begin
  select space_id into v_space from public.circles where id = p_circle;
  insert into public.posts (id, space_id, author_id, caption, taken_at)
  values (v_post, v_space, 'a0000000-0000-0000-0000-00000000000a', 'timeline ' || p_key, p_taken);
  insert into public.post_audiences (post_id, circle_id) values (v_post, p_circle);
  for i in 0 .. p_photos - 1 loop
    insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                    width, height, byte_size, thumb_byte_size, exif_stripped)
    values (v_post, v_space, 'a0000000-0000-0000-0000-00000000000a', i, 'photo', 'image/jpeg', 'k' || i, 't' || i,
            100, 100, 1000, 100, true);
  end loop;
  update public.media_items set upload_status = 'ready' where post_id = v_post;
  if p_status = 'published' then
    update public.posts set status = 'published' where id = v_post;
    update public.posts set published_at = p_published where id = v_post;
  end if;
  if p_deleted then update public.posts set deleted_at = now() where id = v_post; end if;
  insert into tests.vars values (p_key, v_post::text) on conflict (k) do update set v = excluded.v;
end $$;
-- The caller's timeline as an ordered uuid[] (null on error, so a missing RPC fails the test).
create function tests.tl(p_space uuid, p_limit int default 50, p_before_at timestamptz default null, p_before_id uuid default null)
returns uuid[] language plpgsql as $$
declare v uuid[];
begin
  execute 'select coalesce(array_agg(post_id order by n), ''{}'') from (select post_id, row_number() over () as n
             from public.get_timeline(p_space => $1, p_before_at => $2, p_before_id => $3, p_limit => $4)) t'
    into v using p_space, p_before_at, p_before_id, p_limit;
  return v;
exception when others then
  raise warning 'get_timeline failed: % %', sqlstate, sqlerrm;
  return null;
end $$;
-- Fixture posts only, in the order the caller's timeline returned them.
create function tests.tl_fixture(p_space uuid) returns text[] language sql as $$
  select array(select v.k from unnest(tests.tl(p_space)) with ordinality u(id, n)
               join tests.vars v on v.v = u.id::text and v.k like 't\_%'
               order by u.n) $$;
grant select on tests.vars to authenticated, anon;

-- ======================================================================
-- Fixture: Alex's space A. Times are fixed, so results never depend on the real date.
--   t_old   Dad's-side grandparents, taken Jul 4 2024, shared Oct 17 2026 08:00 (bulk import), 3 photos
--   t_old2  Dad's-side grandparents, taken Jul 6 2024, shared Oct 17 2026 08:05, 2 photos
--   t_new   Everyone, no taken_at, shared Oct 16 2026, 1 photo
--   t_mid   Everyone, taken Dec 25 2025, shared Jan 2 2026, 4 photos
--   t_nye   Everyone, taken Dec 31 2023 10:30 pm Eastern (= Jan 1 2024 UTC), shared Oct 17 2026 09:00, 1 photo
--   t_co    Co-parent only (Blair), taken May 1 2023, 1 photo
--   t_draft Everyone, draft, taken Mar 1 2025
--   t_del   Everyone, deleted, taken Jun 1 2025
-- Seed posts a1 (grandparents), a2 (co-parent), a3 (Everyone) have no taken_at.
-- ======================================================================
:as_admin
select tests.tlpost('t_old',   :c_a_gp,  3, '2024-07-04 15:00Z', '2026-10-17 08:00Z');
select tests.tlpost('t_old2',  :c_a_gp,  2, '2024-07-06 15:00Z', '2026-10-17 08:05Z');
select tests.tlpost('t_new',   :c_a_all, 1, null,                '2026-10-16 12:00Z');
select tests.tlpost('t_mid',   :c_a_all, 4, '2025-12-25 18:00Z', '2026-01-02 12:00Z');
select tests.tlpost('t_nye',   :c_a_all, 1, '2024-01-01 03:30Z', '2026-10-17 09:00Z');
select tests.tlpost('t_co',    :c_a_co,  1, '2023-05-01 12:00Z', '2026-10-17 07:00Z');
select tests.tlpost('t_draft', :c_a_all, 1, '2025-03-01 12:00Z', null, 'draft');
select tests.tlpost('t_del',   :c_a_all, 1, '2025-06-01 12:00Z', '2026-10-15 12:00Z', 'published', true);
-- seed posts: pin their share time so the expected order is fixed
update public.posts set published_at = '2026-10-10 12:00Z' where id = :p_a_gp;
update public.posts set published_at = '2026-10-11 12:00Z' where id = :p_a_co;
update public.posts set published_at = '2026-10-12 12:00Z' where id = :p_a_all;

-- ======================================================================
-- Shape: the RPCs exist, and the timeline shares the feed's visibility function
-- ======================================================================
select tests.ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'get_timeline'),
                'BETA-TIME-2: public.get_timeline exists (migration 0010)');
select tests.ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'get_timeline_years'),
                'BETA-TIME-4: public.get_timeline_years exists (migration 0010)');
select tests.ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'private' and p.proname = 'visible_posts'),
                'BETA-TIME-3: one visibility function, private.visible_posts, exists');
select tests.ok((select bool_and(p.prosrc ilike '%private.visible_posts%') and count(*) = 3
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('get_feed', 'get_timeline', 'get_timeline_years')),
                'BETA-TIME-3: get_feed, get_timeline and get_timeline_years all read private.visible_posts (no copies)');
select tests.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'get_timeline'
                   and p.prosrc ~* 'circle_members|post_audiences') = 0
                and exists (select 1 from pg_proc p where p.proname = 'get_timeline'),
                'BETA-TIME-3: get_timeline has no visibility logic of its own (no circle_members / post_audiences joins)');
select tests.ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts'
                        and indexdef ilike '%COALESCE(taken_at, published_at) DESC%'),
                'BETA-TIME-2: posts has an index on (space_id, coalesce(taken_at, published_at) desc, ...)');
select tests.ok(not has_function_privilege('anon', 'public.get_feed(uuid, timestamptz, uuid, integer)', 'execute')
                and coalesce((select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
                              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname in ('get_timeline', 'get_timeline_years')), false)
                and exists (select 1 from pg_proc where proname = 'get_timeline'),
                'BETA-TIME-3: anon cannot call get_timeline or get_timeline_years (same as get_feed)');

select tests.ok((select bool_and(l.lanname = 'plpgsql') and count(*) = 2 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
                 where n.nspname = 'private' and p.proname in ('feed_rows', 'visible_posts')),
                'BETA-TIME-2 perf: private.feed_rows and visible_posts are plpgsql, so their plans are cached per connection (a SQL security-definer function is re-planned on every call)');

-- ======================================================================
-- BETA-TIME-2: order by coalesce(taken_at, published_at) desc
-- ======================================================================
:as_gma_riv
select tests.ok(tests.tl_fixture(:space_a) = array['t_new', 't_mid', 't_old2', 't_old', 't_nye'],
                'BETA-TIME-2: Grandma Rivera''s timeline orders by date taken (shared date if none): t_new, t_mid, t_old2, t_old, t_nye');
select tests.ok_sql(format($$select array_agg(post_id order by n) = array[%L, %L, %L]::uuid[]
                             from (select post_id, row_number() over () n from public.get_timeline(%L, null, null, 3)) t$$,
                           tests.v('t_new'), :p_a_all, :p_a_gp, :space_a),
                    'BETA-TIME-2: first page of 3 is t_new (Oct 16), Soccer (Oct 12), Bike ride (Oct 10): an undated post sorts by its shared date');
select tests.ok_sql($$select bool_and(sort_at = coalesce(taken_at, published_at))
                             and bool_and(sort_at >= coalesce(lead_sort, '-infinity'))
                      from (select taken_at, published_at, sort_at, lead(sort_at) over () lead_sort
                            from public.get_timeline('22222222-0000-0000-0000-00000000000a', null, null, 50)) t$$,
                    'BETA-TIME-2: every row has sort_at = coalesce(taken_at, published_at), never increasing');
select tests.ok_sql(format($$select taken_at = '2024-07-04 15:00Z' and published_at = '2026-10-17 08:00Z'
                                    and jsonb_array_length(media) = 3 and author_name is not null and audience is null
                             from public.get_timeline(%L, null, null, 50) where post_id = %L$$, :space_a, tests.v('t_old')),
                    'BETA-TIME-2: a timeline row is a feed row plus taken_at (3 photos, no audience for a viewer)');
select tests.ok_sql(format($$select taken_at is null and sort_at = published_at
                             from public.get_timeline(%L, null, null, 50) where post_id = %L$$, :space_a, tests.v('t_new')),
                    'BETA-TIME-2: a post with no taken_at comes back with taken_at null and sorts by its shared date');
-- keyset: pages of 2 cover the whole timeline with no gap or duplicate
create temp table pages (n serial, post_id uuid);
grant all on pages to authenticated;
grant usage on sequence pages_n_seq to authenticated;
do $$
declare v_at timestamptz; v_id uuid; r record; got int; guard int := 0;
begin
  loop
    got := 0;
    for r in execute 'select post_id, sort_at from public.get_timeline($1, $2, $3, 2)'
               using '22222222-0000-0000-0000-00000000000a'::uuid, v_at, v_id loop
      insert into pages (post_id) values (r.post_id);
      v_at := r.sort_at; v_id := r.post_id; got := got + 1;
    end loop;
    guard := guard + 1;
    exit when got < 2 or guard > 50;
  end loop;
exception when others then
  raise warning 'paging failed: %', sqlerrm;
end $$;
select tests.ok((select array_agg(post_id order by n) from pages) = tests.tl(:space_a)
                and (select count(*) from pages) = (select count(distinct post_id) from pages)
                and (select count(*) from pages) > 0,
                'BETA-TIME-2: keyset pages of 2 (p_before_at, p_before_id) match the full timeline with no gaps or duplicates');
select tests.ok_sql($$select count(*) <= 50 from public.get_timeline('22222222-0000-0000-0000-00000000000a', null, null, 500)$$,
                    'BETA-TIME-2: limit is capped at 50');

-- ======================================================================
-- BETA-TIME-3: hidden posts are "not found" (absent); the allowed person sees them
-- ======================================================================
select tests.ok(tests.tl(:space_a) @> array[tests.v('t_old')::uuid, tests.v('t_old2')::uuid, :p_a_gp::uuid],
                'BETA-TIME-3 allowed: Grandma Rivera (Dad''s-side grandparents) sees the grandparents-only posts');
select tests.ok(not (tests.tl(:space_a) && array[tests.v('t_co')::uuid, :p_a_co::uuid]),
                'BETA-TIME-3 excluded: Grandma Rivera never gets the co-parent-only posts');
select tests.ok(not (tests.tl(:space_a) && array[tests.v('t_draft')::uuid, tests.v('t_del')::uuid]),
                'BETA-TIME-3: drafts and deleted posts never appear');
select tests.ok_sql(format($$select count(*) = 0 from public.get_timeline(%L, null, null, 50)$$, :space_b),
                    'BETA-TIME-3: a space she is not in returns nothing (not an error that confirms it exists)');
:as_gma_chen
select tests.ok(tests.tl_fixture(:space_a) = array['t_new', 't_mid', 't_nye'],
                'BETA-TIME-3 excluded: Grandma Chen (Everyone only) gets just the Everyone posts, in date-taken order');
select tests.ok(not (tests.tl(:space_a) && array[tests.v('t_old')::uuid, tests.v('t_old2')::uuid, :p_a_gp::uuid]),
                'BETA-TIME-3 excluded: Grandma Chen never gets the Dad''s-side-grandparents posts, on any page');
:as_blair
select tests.ok(tests.tl(:space_a) @> array[tests.v('t_co')::uuid, :p_a_co::uuid]
                and not (tests.tl(:space_a) && array[tests.v('t_old')::uuid, tests.v('t_mid')::uuid, :p_a_all::uuid]),
                'BETA-TIME-3: Blair (co-parent) sees the co-parent posts and nothing from Dad''s family groups');
:as_alex
select tests.ok(tests.tl_fixture(:space_a) = array['t_new', 't_mid', 't_old2', 't_old', 't_nye', 't_co'],
                'BETA-TIME-3: the author sees all his published posts, but not his draft or deleted post');
select tests.ok_sql(format($$select audience is not null from public.get_timeline(%L, null, null, 50) where post_id = %L$$,
                           :space_a, tests.v('t_old')),
                    'BETA-TIME-2: like get_feed, the author gets the audience on his own posts');

-- one visibility function: for every member, visible_posts == published posts can_view_post allows
:as_admin
create function tests.visible_matches(p_user uuid) returns boolean language plpgsql as $$
declare a uuid[]; b uuid[];
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'select coalesce(array_agg(post_id order by post_id), ''{}'') from private.visible_posts($1)'
    into a using '22222222-0000-0000-0000-00000000000a'::uuid;
  select coalesce(array_agg(id order by id), '{}') into b from public.posts
  where space_id = '22222222-0000-0000-0000-00000000000a' and status = 'published' and deleted_at is null
    and public.can_view_post(id);
  return a = b and cardinality(a) > 0;
exception when others then
  raise warning 'visible_posts failed: %', sqlerrm;
  return false;
end $$;
select tests.ok(tests.visible_matches(:alex) and tests.visible_matches(:gma_riv)
                and tests.visible_matches(:gma_chen) and tests.visible_matches(:blair),
                'BETA-TIME-3: private.visible_posts matches can_view_post (published) for the author, both grandmas and the co-parent');

-- ======================================================================
-- BETA-TIME-4 / TIME-3: years list ("Jump to year") counts only what you can see
-- ======================================================================
:as_gma_riv
select tests.ok_sql(format($$select array_agg(format('%%s:%%s:%%s', year, post_count, photo_count) order by n)
                                    = array['2026:3:3', '2025:1:4', '2024:2:5', '2023:1:1']
                             from (select *, row_number() over () n from public.get_timeline_years(%L, 'America/New_York')) t$$, :space_a),
                    'BETA-TIME-4: Grandma Rivera''s years, newest first: 2026 (3 posts, 3 photos), 2025 (1, 4), 2024 (2, 5), 2023 (1, 1); videos not counted');
select tests.ok_sql(format($$select array_agg(year order by n) = array[2026, 2025, 2024]
                                    and (select post_count from public.get_timeline_years(%L, 'UTC') where year = 2024) = 3
                             from (select *, row_number() over () n from public.get_timeline_years(%L, 'UTC')) t$$, :space_a, :space_a),
                    'BETA-TIME-4: in UTC the 10:30 pm New Year''s Eve photo counts in 2024: the year follows the phone''s time zone');
select tests.ok_sql(format($$select count(*) = 0 from public.get_timeline_years(%L, 'UTC')$$, :space_b),
                    'BETA-TIME-3: years for a space she is not in: nothing');
select tests.throws_code(format($$select * from public.get_timeline_years(%L, 'Mars/Olympus')$$, :space_a),
                         'BETA-TIME-4: an unknown time zone is 22023', '22023');
:as_gma_chen
select tests.ok_sql(format($$select array_agg(format('%%s:%%s:%%s', year, post_count, photo_count) order by n)
                                    = array['2026:2:2', '2025:1:4', '2023:1:1']
                             from (select *, row_number() over () n from public.get_timeline_years(%L, 'America/New_York')) t$$, :space_a),
                    'BETA-TIME-3 excluded: Grandma Chen''s years leave out the grandparents-only posts (no 2024 at all)');
:as_blair
select tests.ok_sql(format($$select array_agg(format('%%s:%%s', year, post_count) order by n) = array['2026:1', '2023:1']
                             from (select *, row_number() over () n from public.get_timeline_years(%L, 'America/New_York')) t$$, :space_a),
                    'BETA-TIME-3: Blair''s years count only the 2 co-parent posts');

-- ======================================================================
-- BETA-TIME-1 guard: the Photos feed stays newest-SHARED-first
-- ======================================================================
:as_gma_riv
select tests.ok_sql(format($$select array_agg(post_id order by n) = array[%L, %L, %L, %L, %L]::uuid[]
                             from (select post_id, row_number() over () n from public.get_feed(%L, null, null, 5)) t$$,
                           tests.v('t_nye'), tests.v('t_old2'), tests.v('t_old'), tests.v('t_new'), :p_a_all, :space_a),
                    'BETA-TIME-1: get_feed still orders by shared date, so old photos imported today don''t reorder by date taken');

select tests.ok_sql(format($$select taken_at = '2024-07-04 15:00Z' from public.get_feed(%L, null, null, 50) where post_id = %L$$,
                           :space_a, tests.v('t_old')),
                    'BETA-TIME-1: get_feed rows carry taken_at, so Photos can put old photos in an "Added from earlier" card');

-- ======================================================================
-- privacy-security review (Oct 17): removed people lose the timeline and the years at once (threat 4)
-- ======================================================================
:as_admin
delete from public.circle_members where circle_id = :c_a_gp and user_id = :gma_riv;
:as_gma_riv
select tests.ok(not (tests.tl(:space_a) && array[tests.v('t_old')::uuid, tests.v('t_old2')::uuid, :p_a_gp::uuid])
                and tests.tl(:space_a) @> array[tests.v('t_new')::uuid],
                'BETA-TIME-3 removed from a group: Grandma Rivera loses its posts from the timeline (keeps Everyone)');
select tests.ok_sql(format($$select not exists (select 1 from public.get_timeline_years(%L, 'America/New_York') where year = 2024 and post_count > 1)
                                    and (select sum(post_count) from public.get_timeline_years(%L, 'America/New_York')) = 4$$, :space_a, :space_a),
                    'BETA-TIME-4 removed from a group: her years list no longer counts its posts (only the 4 Everyone posts)');
:as_gpa_riv
select tests.ok(tests.tl(:space_a) @> array[tests.v('t_old')::uuid, tests.v('t_old2')::uuid],
                'BETA-TIME-3 allowed: Grandpa Rivera, still in the group, keeps those posts');
:as_admin
delete from public.space_members where space_id = :space_a and user_id = :gma_riv;
:as_gma_riv
select tests.ok(coalesce(cardinality(tests.tl(:space_a)), -1) = 0,
                'BETA-TIME-3 removed from the family: her timeline is empty');
select tests.ok_sql(format($$select count(*) = 0 from public.get_timeline_years(%L, 'UTC')$$, :space_a),
                    'BETA-TIME-4 removed from the family: her years list is empty (no counts survive)');

-- ---------- HARD-17 (migration 0018): the feed and timeline never wait on JIT ----------
-- Once a family has a few dozen posts, Postgres's estimate for feed_rows passes jit_above_cost and it compiles
-- the query first: 1.5-2 s per Photos or By date page on the test harness, 20-50 ms without it.
:as_admin
select tests.ok((select 'jit=off' = any (p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'feed_rows'),
                'HARD-17 feed_rows runs with JIT off');

-- ======================================================================
-- Summary
-- ======================================================================
reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo TIMELINE RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
