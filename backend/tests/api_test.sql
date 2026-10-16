-- Beta API contract tests (API.md). Every RPC: allowed path, denied path,
-- idempotency, exact error codes. BETA IDs in titles where they map.
-- Runs against a FRESH db: stub -> migrations -> seed -> this file (see tests/run.sh).
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
-- Page through get_feed with the keyset until it runs dry; returns every id in order.
create function tests.page_all(p_space uuid, p_lim int) returns uuid[] language plpgsql as $$
declare ids uuid[] := '{}'; ts timestamptz; id uuid; r record; n int; guard int := 0;
begin
  loop
    n := 0;
    for r in select * from public.get_feed(p_space, ts, id, p_lim) loop
      ids := ids || r.post_id; ts := r.published_at; id := r.post_id; n := n + 1;
    end loop;
    exit when n = 0;
    guard := guard + 1;
    if guard > 1000 then raise exception 'pagination never ended'; end if;
  end loop;
  return ids;
end $$;
grant usage on schema tests to authenticated, anon;
grant select, insert, update on tests.results, tests.vars to authenticated, anon;
grant usage on sequence tests.results_n_seq to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- ids
\set alex      '''a0000000-0000-0000-0000-00000000000a'''
\set blair     '''b0000000-0000-0000-0000-00000000000b'''
\set gma_riv   '''a0000000-0000-0000-0000-0000000000a1'''
\set gpa_riv   '''a0000000-0000-0000-0000-0000000000a2'''
\set gma_chen  '''b0000000-0000-0000-0000-0000000000b1'''
\set aunt_jo   '''c0000000-0000-0000-0000-0000000000c1'''
\set ray       '''d0000000-0000-0000-0000-0000000000d1'''
\set space_a   '''22222222-0000-0000-0000-00000000000a'''
\set space_b   '''22222222-0000-0000-0000-00000000000b'''
\set c_a_all   '''33333333-0000-0000-0000-0000000000a0'''
\set c_a_gp    '''33333333-0000-0000-0000-0000000000a1'''
\set c_a_co    '''33333333-0000-0000-0000-0000000000a2'''
\set c_b_gp    '''33333333-0000-0000-0000-0000000000b1'''
\set p_a_gp    '''55555555-0000-0000-0000-0000000000a1'''
\set p_a_co    '''55555555-0000-0000-0000-0000000000a2'''
\set p_a_all   '''55555555-0000-0000-0000-0000000000a3'''
\set p_b_gp    '''55555555-0000-0000-0000-0000000000b1'''
\set p_b_co    '''55555555-0000-0000-0000-0000000000b2'''
\set nopost    '''99999999-0000-0000-0000-000000000099'''

\set as_alex     'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_blair    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-00000000000b'', false);'
\set as_gma_riv  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_gpa_riv  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a2'', false);'
\set as_gma_chen 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-0000000000b1'', false);'
\set as_ray      'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''d0000000-0000-0000-0000-0000000000d1'', false);'
\set as_anon     'reset role; set role anon; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'

insert into auth.users (id, email, raw_user_meta_data)
values ('d0000000-0000-0000-0000-0000000000d1', 'uncle.ray@example.com', '{"display_name":"Uncle Ray"}'),
       ('e0000000-0000-0000-0000-0000000000e1', 'rate.tester@example.com', '{"display_name":"Rate Tester"}');

-- ======================================================================
-- my_spaces
-- ======================================================================
:as_alex
select tests.ok_sql($q$select count(*) = 2 from public.my_spaces()$q$, 'my_spaces: Alex is in 2 spaces');
select tests.ok_sql(format($q$select role = 'owner' and can_post and inviter_name is null and name = 'Sam at Dad''s'
                              from public.my_spaces() where space_id = %L$q$, :space_a),
                    'my_spaces: owner row has role owner, can_post, no inviter');
select tests.ok_sql(format($q$select role = 'viewer' and not can_post and inviter_name = 'Blair'
                              from public.my_spaces() where space_id = %L$q$, :space_b),
                    'my_spaces: co-parent row shows viewer, cannot post, inviter Blair');
:as_gma_riv
select tests.ok_sql($q$select array_agg(role::text || '/' || inviter_name) = array['viewer/Alex'] from public.my_spaces()$q$,
                    'my_spaces: grandparent sees one space, invited by Alex');
:as_ray
select tests.ok_sql($q$select count(*) = 0 from public.my_spaces()$q$, 'my_spaces: a user with no spaces gets []');
:as_anon
select tests.throws_code('select * from public.my_spaces()', 'my_spaces: anon is refused', '42501');

-- ======================================================================
-- my_circles
-- ======================================================================
:as_alex
select tests.ok_sql(format($q$select count(*) = 3 from public.my_circles(%L)$q$, :space_a), 'my_circles: owner sees all 3 circles');
select tests.ok_sql(format($q$select member_count = 5 and 'Grandma Rivera' = any(member_names) and 'Grandma Chen' = any(member_names)
                              from public.my_circles(%L) where name = 'Everyone'$q$, :space_a),
                    'my_circles: member_count and member_names for Everyone');
select tests.ok_sql(format($q$select member_count = 1 and member_names = array['Blair']
                              from public.my_circles(%L) where circle_id = %L$q$, :space_a, :c_a_co),
                    'my_circles: Co-parent circle has exactly Blair');
select tests.ok_sql(format($q$select count(*) = 0 from public.my_circles(%L)$q$, :space_b),
                    'my_circles: Alex is a viewer in Blair''s space, gets []');
:as_gma_riv
select tests.ok_sql(format($q$select count(*) = 0 from public.my_circles(%L)$q$, :space_a), 'my_circles: viewer gets []');
:as_blair
select tests.ok_sql(format($q$select count(*) = 0 from public.my_circles(%L)$q$, :space_a),
                    'BETA-AUD-4 my_circles: co-parent gets [] in the other household (no circle names leak)');
:as_ray
select tests.ok_sql(format($q$select count(*) = 0 from public.my_circles(%L)$q$, :space_a), 'my_circles: non-member gets []');

-- ======================================================================
-- get_feed: visibility (BETA-AUD-3), author-only fields, shape
-- ======================================================================
:as_gma_chen
select tests.ok_sql(format($q$select array_agg(post_id) = array[%L]::uuid[] from public.get_feed(%L)$q$, :p_a_all, :space_a),
                    'BETA-AUD-3 get_feed: user only in circle Everyone sees only the Everyone post, not the circle-A post');
:as_gma_riv
select tests.ok_sql(format($q$select array_agg(post_id order by post_id) = array[%L, %L]::uuid[] from public.get_feed(%L)$q$, :p_a_gp, :p_a_all, :space_a),
                    'get_feed: Dad-side grandma sees the grandparents post and the Everyone post');
select tests.ok_sql(format($q$select audience is null and seen_count is null and reach_count is null
                              from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'get_feed: audience, seen_count, reach_count are null for non-authors');
select tests.ok_sql(format($q$select author_name = 'Alex' and caption like 'Sam''s first bike ride%%' and heart_count = 1 and i_hearted
                                     and comment_count = 1 and published_at is not null
                              from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'get_feed: author_name, caption, heart_count, i_hearted, comment_count');
select tests.ok_sql(format($q$select jsonb_array_length(media) = 2
                                     and media->0->>'kind' = 'video' and (media->0->>'duration_ms')::int = 14000
                                     and media->1->>'kind' = 'photo' and media->1->>'status' = 'ready'
                                     and media->0 ?& array['media_id','kind','width','height','duration_ms','status']
                              from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'get_feed: media array in position order with the contract fields');
:as_gpa_riv
select tests.ok_sql(format($q$select not i_hearted from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'get_feed: i_hearted is per caller');
:as_blair
select tests.ok_sql(format($q$select array_agg(post_id) = array[%L]::uuid[] from public.get_feed(%L)$q$, :p_a_co, :space_a),
                    'BETA-AUD-4 get_feed: co-parent sees only the co-parent post in the other space');
:as_alex
select tests.ok_sql(format($q$select count(*) = 3 from public.get_feed(%L)$q$, :space_a), 'get_feed: author sees all own published posts');
select tests.ok_sql(format($q$select audience = jsonb_build_array(jsonb_build_object('circle_id', %L::uuid, 'name', 'Grandparents – Dad''s side', 'member_count', 2))
                                     and reach_count = 2 and seen_count = 1
                              from public.get_feed(%L) where post_id = %L$q$, :c_a_gp, :space_a, :p_a_gp),
                    'get_feed: author gets audience [{circle_id,name,member_count}], reach_count, seen_count');
select tests.ok_sql(format($q$select reach_count = 4 from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_all),
                    'get_feed: reach_count excludes the author');
:as_ray
select tests.ok_sql(format($q$select count(*) = 0 from public.get_feed(%L)$q$, :space_a), 'get_feed: non-member gets []');
:as_anon
select tests.throws_code(format('select * from public.get_feed(%L)', :space_a), 'get_feed: anon is refused', '42501');

-- Property: for every seed user and space, get_feed == published posts that can_view_post() allows.
:as_admin
create function tests.feed_matches_rule(p_user uuid, p_space uuid) returns boolean language plpgsql as $$
declare a uuid[]; b uuid[];
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select coalesce(array_agg(post_id order by post_id), '{}') into a from public.get_feed(p_space, null, null, 50);
  select coalesce(array_agg(id order by id), '{}') into b from public.posts
   where space_id = p_space and status = 'published' and deleted_at is null and public.can_view_post(id);
  return a = b;
end $$;
select tests.ok_sql($q$select bool_and(tests.feed_matches_rule(u.id, s.id)) from auth.users u cross join public.spaces s$q$,
                    'get_feed matches can_view_post() for every user x space (seed)');

-- ======================================================================
-- get_feed: keyset pagination, limits, drafts, deletes
-- ======================================================================
-- 60 extra Everyone posts by Alex, including timestamp ties, published directly.
:as_admin
insert into posts (id, space_id, author_id, caption)
select ('66666666-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, :space_a, :alex, 'bulk ' || g from generate_series(1, 60) g;
insert into post_audiences (post_id, circle_id)
select ('66666666-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, :c_a_all from generate_series(1, 60) g;
update posts set status = 'published', published_at = now() - make_interval(mins => (g.g / 3))   -- groups of 3 share a timestamp
  from generate_series(1, 60) g where posts.id = ('66666666-0000-0000-0000-' || lpad(g.g::text, 12, '0'))::uuid;
:as_gma_chen
select tests.ok_sql(format($q$select tests.page_all(%L, 7) = (select array_agg(id order by published_at desc, id desc) from posts
                               where space_id = %L and status = 'published' and deleted_at is null)$q$, :space_a, :space_a),
                    'get_feed: keyset pages (limit 7, with timestamp ties) return every visible post once, newest first');
select tests.ok_sql(format($q$select count(*) = 50 from public.get_feed(%L, null, null, 1000)$q$, :space_a), 'get_feed: p_limit is capped at 50');
select tests.ok_sql(format($q$select count(*) = 20 from public.get_feed(%L)$q$, :space_a), 'get_feed: default page is 20');
select tests.ok_sql(format($q$select count(*) = 0 from public.get_feed(%L, '-infinity', null, 20)$q$, :space_a), 'get_feed: a cursor before everything returns []');
:as_alex
select tests.ok_sql(format($q$select tests.page_all(%L, 13) = (select array_agg(id order by published_at desc, id desc) from posts
                               where space_id = %L and status = 'published' and deleted_at is null)$q$, :space_a, :space_a),
                    'get_feed: author keyset pages cover every own post once');

-- ======================================================================
-- create_post (idempotent on author + p_client_id)
-- ======================================================================
:as_alex
select tests.setv('cp1', format($q$select public.create_post('77777777-0000-0000-0000-000000000001'::uuid, %L::uuid, 'idem', array[%L]::uuid[])$q$, :space_a, :c_a_gp));
select tests.setv('cp1b', format($q$select public.create_post('77777777-0000-0000-0000-000000000001'::uuid, %L::uuid, 'idem retry', array[%L]::uuid[])$q$, :space_a, :c_a_gp));
select tests.ok(tests.v('cp1') is not null and tests.v('cp1') = tests.v('cp1b'), 'create_post: retry with the same p_client_id returns the original post_id');
select tests.ok_sql($q$select count(*) = 1 and min(caption) = 'idem' and min(status::text) = 'draft' from posts
                       where client_id = '77777777-0000-0000-0000-000000000001'$q$,
                    'create_post: ...creates no duplicate, keeps the original, and makes a draft');
select tests.ok_sql(format($q$select not exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, tests.v('cp1')),
                    'create_post: drafts are not in the author''s feed');
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', '{}'::uuid[])$q$, :space_a),
                         'create_post: no audience is 23514', '23514');
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_b_gp),
                         'create_post: a circle from another space is 23514', '23514');
select tests.throws_code(format($q$select public.create_post(null, %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_gp),
                         'create_post: p_client_id is required (23514)', '23514');
:as_gma_riv
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_all),
                         'create_post: viewer who cannot post gets 42501', '42501');
:as_ray
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_all),
                         'create_post: non-member gets 42501', '42501');
-- viewer allowed to post may only target circles they can see
:as_admin
update spaces set viewers_can_post = true where id = :space_a;
:as_blair
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_all),
                         'create_post: a viewer-poster cannot target a circle they cannot see (23514)', '23514');
select tests.lives(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_co),
                   'create_post: a viewer-poster can target their own circle');
:as_admin
update spaces set viewers_can_post = false where id = :space_a;
:as_anon
select tests.throws_code(format($q$select public.create_post(gen_random_uuid(), %L::uuid, 'x', array[%L]::uuid[])$q$, :space_a, :c_a_all),
                         'create_post: anon is refused', '42501');

-- ======================================================================
-- publish_post (idempotent)
-- ======================================================================
:as_alex
select tests.throws_code(format('select public.publish_post(%L)', tests.v('cp1')), 'publish_post: media not ready is 23514', '23514');
select tests.setv('cp1_media', format($q$select media_id from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, tests.v('cp1')));
:as_admin
select public.mark_media_upload_result(tests.v('cp1_media')::uuid, true);
:as_gma_chen
select tests.throws_code(format('select public.publish_post(%L)', tests.v('cp1')), 'publish_post: someone who cannot see the draft gets P0002', 'P0002');
select tests.throws_code(format('select public.publish_post(%L)', :nopost), 'publish_post: unknown post gets P0002', 'P0002');
:as_alex
select tests.lives(format('select public.publish_post(%L)', tests.v('cp1')), 'publish_post: author publishes once media is ready');
select tests.setv('cp1_pub', format('select published_at from posts where id = %L', tests.v('cp1')));
select tests.lives(format('select public.publish_post(%L)', tests.v('cp1')), 'publish_post: publishing again is a no-op (idempotent)');
select tests.ok_sql(format('select published_at = %L::timestamptz from posts where id = %L', tests.v('cp1_pub'), tests.v('cp1')),
                    'publish_post: ...and does not move published_at');
:as_gma_riv
select tests.ok_sql(format($q$select exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, tests.v('cp1')),
                    'publish_post: the audience now sees it in get_feed');
select tests.throws_code(format('select public.publish_post(%L)', :p_a_gp), 'publish_post: a visible post by someone else is 42501', '42501');

-- ======================================================================
-- toggle_heart (BETA-REPLY-1)
-- ======================================================================
:as_gpa_riv
select tests.ok_sql(format($q$select (h).i_hearted and (h).heart_count = 2 from (select public.toggle_heart(%L) h) x$q$, :p_a_gp),
                    'BETA-REPLY-1 toggle_heart: one call hearts it');
select tests.ok_sql(format($q$select (select array_agg(user_id order by user_id) from reactions where post_id = %L) = array[%L, %L]::uuid[]$q$, :p_a_gp, :gma_riv, :gpa_riv),
                    'BETA-REPLY-1 the audience sees who hearted it');
select tests.ok_sql(format($q$select not (h).i_hearted and (h).heart_count = 1 from (select public.toggle_heart(%L) h) x$q$, :p_a_gp),
                    'BETA-REPLY-1 toggle_heart: a second call un-hearts it');
:as_gma_chen
select tests.throws_code(format('select public.toggle_heart(%L)', :p_a_gp), 'BETA-AUD-3 toggle_heart: invisible post is P0002 (not 42501)', 'P0002');
select tests.throws_code(format('select public.toggle_heart(%L)', :nopost), 'toggle_heart: unknown post is P0002', 'P0002');
select tests.ok_sql(format('select not exists (select 1 from reactions where post_id = %L)', :p_a_gp),
                    'BETA-REPLY-1 people outside the audience do not see who hearted');
:as_admin
update spaces set viewers_can_comment = false where id = :space_a;
:as_gpa_riv
select tests.throws_code(format('select public.toggle_heart(%L)', :p_a_gp), 'toggle_heart: viewer when viewers_can_comment = false is 42501', '42501');
:as_admin
update spaces set viewers_can_comment = true where id = :space_a;

-- ======================================================================
-- add_comment / get_comments (BETA-REPLY-2)
-- ======================================================================
:as_gpa_riv
select tests.setv('cm1', format($q$select (public.add_comment('88888888-0000-0000-0000-000000000001'::uuid, %L::uuid, '  Great ride!  ')).comment_id$q$, :p_a_gp));
select tests.setv('cm1b', format($q$select (public.add_comment('88888888-0000-0000-0000-000000000001'::uuid, %L::uuid, 'Great ride!')).comment_id$q$, :p_a_gp));
select tests.ok(tests.v('cm1') is not null and tests.v('cm1') = tests.v('cm1b'), 'BETA-REPLY-2 add_comment: retry with the same p_client_id returns the original comment');
select tests.ok_sql($q$select count(*) = 1 and min(body) = 'Great ride!' from comments where client_id = '88888888-0000-0000-0000-000000000001'$q$,
                    'add_comment: no duplicate, body stored trimmed');
select tests.ok_sql(format($q$select (c).created_at is not null from (select public.add_comment(gen_random_uuid(), %L::uuid, %L) c) x$q$, :p_a_gp, repeat('x', 500)),
                    'add_comment: 500 characters is allowed and returns created_at');
select tests.throws_code(format($q$select public.add_comment(gen_random_uuid(), %L::uuid, %L)$q$, :p_a_gp, repeat('x', 501)), 'add_comment: 501 characters is 23514', '23514');
select tests.throws_code(format($q$select public.add_comment(gen_random_uuid(), %L::uuid, '   ')$q$, :p_a_gp), 'add_comment: blank after trim is 23514', '23514');
select tests.ok_sql(format($q$select array_agg(body order by created_at) = (select array_agg(body) from (select body from public.get_comments(%L)) g)
                              from comments where post_id = %L and deleted_at is null$q$, :p_a_gp, :p_a_gp),
                    'get_comments: oldest first');
select tests.ok_sql(format($q$select author_name = 'Grandpa Rivera' from public.get_comments(%L) where comment_id = %L$q$, :p_a_gp, tests.v('cm1')),
                    'get_comments: author_name');
select tests.ok_sql(format($q$select count(*) = 1 from public.get_comments(%L, 1)$q$, :p_a_gp), 'get_comments: p_limit');
:as_gma_riv
select tests.ok_sql(format($q$select exists (select 1 from public.get_comments(%L) where comment_id = %L)$q$, :p_a_gp, tests.v('cm1')),
                    'BETA-REPLY-2 the post''s audience sees the comment');
:as_gma_chen
select tests.throws_code(format('select * from public.get_comments(%L)', :p_a_gp), 'BETA-REPLY-2 outside the audience: get_comments is P0002', 'P0002');
select tests.throws_code(format('select * from public.get_comments(%L)', :nopost), 'get_comments: unknown post is P0002', 'P0002');
select tests.throws_code(format($q$select public.add_comment(gen_random_uuid(), %L::uuid, 'hi')$q$, :p_a_gp), 'BETA-REPLY-2 add_comment on an invisible post is P0002', 'P0002');
select tests.ok_sql(format('select not exists (select 1 from comments where post_id = %L)', :p_a_gp), 'BETA-REPLY-2 ...and the comments table shows nothing');
:as_admin
update spaces set viewers_can_comment = false where id = :space_a;
:as_gpa_riv
select tests.throws_code(format($q$select public.add_comment(gen_random_uuid(), %L::uuid, 'hi')$q$, :p_a_gp), 'add_comment: viewers_can_comment = false is 42501', '42501');
:as_admin
update spaces set viewers_can_comment = true where id = :space_a;

-- ======================================================================
-- mark_seen
-- ======================================================================
:as_gpa_riv
select tests.lives(format('select public.mark_seen(%L)', :p_a_gp), 'mark_seen: audience member marks seen');
select tests.lives(format('select public.mark_seen(%L)', :p_a_gp), 'mark_seen: again is fine (idempotent)');
select tests.ok_sql(format('select count(*) = 1 from post_views where post_id = %L and user_id = auth.uid()', :p_a_gp), 'mark_seen: one receipt row');
:as_alex
select tests.ok_sql(format($q$select seen_count = 2 from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'mark_seen: feeds the author''s seen_count');
select tests.lives(format('select public.mark_seen(%L)', :p_a_gp), 'mark_seen: author viewing own post is a no-op');
select tests.ok_sql(format($q$select seen_count = 2 from public.get_feed(%L) where post_id = %L$q$, :space_a, :p_a_gp),
                    'mark_seen: ...and the author never counts as a viewer');
:as_gma_chen
select tests.throws_code(format('select public.mark_seen(%L)', :p_a_gp), 'mark_seen: invisible post is P0002', 'P0002');

-- ======================================================================
-- SEE-6: removal from a circle denies immediately
-- ======================================================================
:as_alex
delete from circle_members where circle_id = :c_a_gp and user_id = :gpa_riv;
:as_gpa_riv
select tests.ok_sql(format($q$select not exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, :p_a_gp),
                    'BETA-SEE-6 removed from the circle: post gone from get_feed immediately');
select tests.ok_sql(format('select not public.can_view_post(%L)', :p_a_gp), 'BETA-SEE-6 ...and can_view_post (the media signer) says no');
select tests.throws_code(format('select public.toggle_heart(%L)', :p_a_gp), 'BETA-SEE-6 / REPLY-4 ...hearting it is P0002', 'P0002');
select tests.throws_code(format($q$select public.add_comment(gen_random_uuid(), %L::uuid, 'still here?')$q$, :p_a_gp), 'BETA-SEE-6 / REPLY-4 ...commenting is P0002', 'P0002');
:as_alex
insert into circle_members (circle_id, user_id) values (:c_a_gp, :gpa_riv);

-- ======================================================================
-- delete_post (BETA-AUD-5)
-- ======================================================================
:as_gma_riv
select tests.throws_code(format('select public.delete_post(%L)', :p_a_all), 'BETA-AUD-5 delete_post: a visible post by someone else is 42501', '42501');
:as_gma_chen
select tests.throws_code(format('select public.delete_post(%L)', :p_a_gp), 'BETA-AUD-5 delete_post: an invisible post is P0002', 'P0002');
:as_alex
select tests.lives(format('select public.delete_post(%L)', :p_a_all), 'BETA-AUD-5 delete_post: author deletes');
select tests.lives(format('select public.delete_post(%L)', :p_a_all), 'BETA-AUD-5 delete_post: deleting again is a no-op (idempotent)');
select tests.ok_sql(format($q$select not exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, :p_a_all),
                    'BETA-AUD-5 gone from the author''s feed');
:as_gma_chen
select tests.ok_sql(format($q$select not exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, :p_a_all),
                    'BETA-AUD-5 gone from a viewer''s feed');
select tests.ok_sql(format('select not public.can_view_post(%L)', :p_a_all), 'BETA-AUD-5 can_view_post is false, so sign-media refuses new URLs');
select tests.throws_code(format('select public.toggle_heart(%L)', :p_a_all), 'BETA-AUD-5 hearting a deleted post is P0002', 'P0002');
:as_admin
select tests.ok_sql(format($q$select not exists (select 1 from media_keys k join media_items m on m.id = k.media_id where m.post_id = %L)$q$, :p_a_all),
                    'BETA-AUD-5 the deleted post''s wrapped keys are destroyed (crypto-shred)');
select tests.ok_sql(format($q$select count(*) = 2 from storage_purge_queue where reason = 'post_deleted' and object_key like '%%/p/' || %L || '/%%'$q$, :p_a_all),
                    'BETA-AUD-5 its media blobs are queued for purge');
:as_ray
select tests.throws_code(format('select public.delete_post(%L)', :nopost), 'delete_post: unknown post is P0002', 'P0002');

-- ======================================================================
-- create_invite returns {code, link}; S9 hashes unreadable (BETA-JOIN-4)
-- ======================================================================
:as_alex
select tests.setv('inv1', format($q$select row_to_json(i)::text from public.create_invite(%L, 'viewer', array[%L]::uuid[], 'email', 'Uncle.Ray@example.com') i$q$, :space_a, :c_a_gp));
select tests.ok_sql($q$select (tests.v('inv1')::jsonb) ?& array['code','link']$q$, 'create_invite: returns code and link');
select tests.ok_sql($q$select length(tests.v('inv1')::jsonb->>'code') = 10$q$, 'create_invite: the typed code stays short (10 chars)');
select tests.ok_sql($q$select length(substring(tests.v('inv1')::jsonb->>'link' from '([0-9a-f]+)$')) * 4 >= 128$q$,
                    'BETA-JOIN-4 create_invite: the link carries >= 128 random bits');
select tests.throws_code('select code_hash from invites', 'BETA-JOIN-4 (S9) a manager cannot read invite code hashes', '42501');
select tests.throws_code('select link_hash from invites', 'BETA-JOIN-4 (S9) a manager cannot read invite link hashes', '42501');
select tests.throws_code('select * from invites', 'BETA-JOIN-4 (S9) select * on invites is refused (name the columns)', '42501');
select tests.ok_sql('select count(*) >= 1 from (select id, role, expires_at, use_count, revoked_at from invites) i',
                    'create_invite: managers still list invites without the hashes');
:as_admin
select tests.ok_sql($q$select code_hash <> encode(extensions.digest(tests.v('inv1')::jsonb->>'code', 'sha256'), 'hex')
                         and code_hash <> tests.v('inv1')::jsonb->>'code'
                       from invites where id = (tests.v('inv1')::jsonb->>'invite_id')::uuid$q$,
                    'BETA-JOIN-4 (S9) stored hash is keyed (HMAC with a server pepper), not sha256(code)');
:as_alex
select tests.throws_code('select * from private.secrets', 'BETA-JOIN-4 (S9) clients cannot read the pepper', '42501');
:as_gma_riv
select tests.throws_code(format($q$select * from public.create_invite(%L, 'viewer', array[%L]::uuid[])$q$, :space_a, :c_a_all),
                         'create_invite: viewer is 42501', '42501');

-- ======================================================================
-- invite_preview (anon-callable, leaks nothing else)
-- ======================================================================
:as_anon
select tests.ok_sql($q$select public.invite_preview(tests.v('inv1')::jsonb->>'code')::jsonb = '{"inviter_name":"Alex","space_name":"Sam at Dad''s"}'::jsonb$q$,
                    'invite_preview: anon sees exactly {inviter_name, space_name}');
select tests.ok_sql($q$select public.invite_preview(substring(tests.v('inv1')::jsonb->>'link' from '([0-9a-f]+)$'))::jsonb->>'inviter_name' = 'Alex'$q$,
                    'invite_preview: the link token works too');
select tests.throws_code($q$select public.invite_preview('NOPE234567')$q$, 'invite_preview: unknown code is 22023', '22023');
select tests.ok_sql($q$select (tests.rest($s$select public.invite_preview('NOPE234567')$s$)) @> '{"status":"400","body":{"code":"22023"}}'$q$,
                    'invite_preview over PostgREST: 400 with code 22023');

-- ======================================================================
-- redeem_invite: BETA-JOIN-3 (every bad invite -> 22023, nothing leaks)
-- ======================================================================
:as_alex
select tests.setv('inv_exp',  format($q$select code from public.create_invite(%L, 'viewer', array[%L]::uuid[])$q$, :space_a, :c_a_gp));
select tests.setv('inv_rev',  format($q$select code from public.create_invite(%L, 'viewer', array[%L]::uuid[])$q$, :space_a, :c_a_gp));
select tests.setv('inv_used', format($q$select code from public.create_invite(%L, 'viewer', array[%L]::uuid[])$q$, :space_a, :c_a_gp));
select tests.setv('inv_ok',   format($q$select row_to_json(i)::text from public.create_invite(%L, 'viewer', array[%L]::uuid[], 'link') i$q$, :space_a, :c_a_gp));
select tests.setv('inv_ok2',  format($q$select row_to_json(i)::text from public.create_invite(%L, 'viewer', array[%L]::uuid[], 'link') i$q$, :space_a, :c_a_gp));
:as_admin
select tests.try($q$update invites set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
                     where code_hash = private.invite_hash(tests.v('inv_exp'))$q$);
select tests.try($q$update invites set revoked_at = now() where code_hash = private.invite_hash(tests.v('inv_rev'))$q$);
select tests.try($q$update invites set use_count = max_uses where code_hash = private.invite_hash(tests.v('inv_used'))$q$);
:as_ray
select tests.throws_code(format('select public.redeem_invite(%L)', tests.v('inv_exp')),  'BETA-JOIN-3 expired invite is 22023', '22023');
select tests.throws_code(format('select public.redeem_invite(%L)', tests.v('inv_rev')),  'BETA-JOIN-3 revoked invite is 22023', '22023');
select tests.throws_code(format('select public.redeem_invite(%L)', tests.v('inv_used')), 'BETA-JOIN-3 used-up invite is 22023', '22023');
select tests.throws_code($q$select public.redeem_invite('ZZZZZZZZZZ')$q$, 'BETA-JOIN-3 unknown code is 22023', '22023');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c1', false);  -- Aunt Jo, not Uncle Ray
select tests.throws_code($q$select public.redeem_invite(tests.v('inv1')::jsonb->>'code')$q$, 'BETA-JOIN-3 invite addressed to a different email is 22023', '22023');
select tests.ok_sql($q$select (tests.rest($s$select public.redeem_invite(tests.v('inv1')::jsonb->>'code')$s$))->'body'
                          = (tests.rest($s$select public.redeem_invite('ZZZZZZZZZZ')$s$))->'body'$q$,
                    'BETA-JOIN-3 wrong-email and unknown-code responses are byte-identical (no space data, no hint the code is real)');
:as_ray
select tests.ok_sql(format($q$select public.redeem_invite(lower(tests.v('inv1')::jsonb->>'code'))::text = to_json(%L::uuid)::text$q$, :space_a),
                    'redeem_invite: the addressed person redeems (case-insensitive) and gets space_id');
select tests.ok_sql(format($q$select exists (select 1 from public.get_feed(%L) where post_id = %L)$q$, :space_a, :p_a_gp),
                    'redeem_invite: ...and lands in the invited circle');
:as_ray
select tests.ok_sql(format($q$select public.redeem_invite(substring(tests.v('inv_ok')::jsonb->>'link' from '([0-9a-f]+)$'))::text = to_json(%L::uuid)::text$q$, :space_a),
                    'redeem_invite: the long link token redeems');

-- ======================================================================
-- S10 rate limits (BETA-JOIN-4): 10 failures / 10 min per user and per IP -> 54000
-- ======================================================================
:as_admin
set role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000e1', false);  -- a fresh account
do $$ begin
  for i in 1..9 loop perform tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"203.0.113.9"}'); end loop;
end $$;
select tests.ok_sql($q$select tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"203.0.113.9"}') @> '{"status":"400","body":{"code":"22023"}}'$q$,
                    'BETA-JOIN-4 (S10) 10th failure is still 22023 (failures persist across requests)');
select tests.ok_sql($q$select tests.rest(format('select public.redeem_invite(%L)', tests.v('inv_ok2')::jsonb->>'code'), '{"x-forwarded-for":"203.0.113.9"}')
                          @> '{"status":"429","body":{"code":"54000"}}'$q$,
                    'BETA-JOIN-4 (S10) 11th attempt by the same account is 54000, even with a valid code');
select tests.ok_sql($q$select not exists (select 1 from public.my_spaces())$q$, 'BETA-JOIN-4 (S10) ...and did not join');
select tests.throws_code($q$select public.redeem_invite('BADBADBAD2')$q$, 'BETA-JOIN-4 (S10) also 54000 outside PostgREST', '54000');
-- another account, same IP
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-0000000000b1', false);
select tests.ok_sql($q$select tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"10.0.0.1, 203.0.113.9"}') @> '{"body":{"code":"54000"}}'$q$,
                    'BETA-JOIN-4 (S10) the same IP is limited across accounts (last X-Forwarded-For hop)');
select tests.ok_sql($q$select tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"198.51.100.7"}') @> '{"body":{"code":"22023"}}'$q$,
                    'BETA-JOIN-4 (S10) a different account on a different IP is not limited');
select tests.ok_sql($q$select tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"198.51.100.8","prefer":"tx=rollback"}') @> '{"body":{"code":"54000"}}'$q$,
                    'BETA-JOIN-4 (S10) Prefer: tx=rollback (which would erase the failure log) is refused');
:as_admin
select tests.try($q$update private.rate_limit_events set at = at - interval '11 minutes'$q$);
set role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000e1', false);
select tests.ok_sql($q$select tests.rest($s$select public.redeem_invite('BADBADBAD2')$s$, '{"x-forwarded-for":"203.0.113.9"}') @> '{"body":{"code":"22023"}}'$q$,
                    'BETA-JOIN-4 (S10) the window is 10 minutes');
-- anon preview, keyed by IP
:as_anon
do $$ begin
  for i in 1..10 loop perform tests.rest($s$select public.invite_preview('BADBADBAD3')$s$, '{"cf-connecting-ip":"192.0.2.50"}'); end loop;
end $$;
select tests.ok_sql($q$select tests.rest(format('select public.invite_preview(%L)', tests.v('inv_ok2')::jsonb->>'code'), '{"cf-connecting-ip":"192.0.2.50"}')
                          @> '{"status":"429","body":{"code":"54000"}}'$q$,
                    'BETA-JOIN-4 (S10) invite_preview: 11th anon attempt from one IP is 54000');
select tests.ok_sql($q$select tests.rest(format('select public.invite_preview(%L)', tests.v('inv_ok2')::jsonb->>'code'), '{"cf-connecting-ip":"192.0.2.51"}')
                          @> '{"status":"200","body":{"inviter_name":"Alex"}}'$q$,
                    'BETA-JOIN-4 (S10) invite_preview: another IP still works');

-- ======================================================================
-- BETA-OPS-1: crash/error reports with no personal data and no third-party SDK
-- ======================================================================
:as_gma_riv
select tests.lives($$select public.report_client_error('0.1.0', 'android 14', 'photos', 'TypeError', null)$$,
                   'BETA-OPS-1: a signed-in member reports an error');
:as_admin
select tests.ok_sql($$select count(*) = 1 from public.client_errors
                      where app_version = '0.1.0' and os = 'android 14' and screen = 'photos' and kind = 'TypeError'$$,
                    'BETA-OPS-1: exactly 1 row with app version, OS, screen and error type');
:as_anon
select tests.lives($$select public.report_client_error('0.1.0', 'ios 18.1', 'sign-in', 'ApiError', 'P0002')$$,
                   'BETA-OPS-1: errors before sign-in can be reported too');
:as_gma_riv
select tests.throws_code($$select public.report_client_error('0.1.0', 'ios', 'photos', 'Sam''s caption here', null)$$,
                         'BETA-OPS-1: free text (a caption) is refused, not stored', '23514');
select tests.throws_code($$select public.report_client_error('0.1.0', 'ios', 'https://x.b2.com/k?sig=1', 'TypeError', null)$$,
                         'BETA-OPS-1: a URL is refused, not stored', '23514');
select tests.throws_code($$select public.report_client_error('0.1.0', 'gma@example.com', 'photos', 'TypeError', null)$$,
                         'BETA-OPS-1: an email address is refused, not stored', '23514');
select tests.throws_code('select count(*) from public.client_errors', 'BETA-OPS-1: app users cannot read error reports', '42501');
select tests.lives($$select public.report_client_error('0.1.0', 'ios', 'photos', 'TypeError', null) from generate_series(1, 29)$$,
                   'setup: 30 reports in an hour');
select tests.throws_code($$select public.report_client_error('0.1.0', 'ios', 'photos', 'TypeError', null)$$,
                         'BETA-OPS-1: more than 30 reports an hour from one person is 54000', '54000');
:as_admin
update public.client_errors set at = now() - interval '31 days' where kind = 'ApiError';
select public.purge_client_errors();
select tests.ok_sql($$select not exists (select 1 from public.client_errors where kind = 'ApiError')
                         and exists (select 1 from public.client_errors where kind = 'TypeError')$$,
                    'BETA-OPS-1: reports older than 30 days are purged; newer ones stay');
:as_gma_riv
select tests.throws_code('select public.purge_client_errors()', 'BETA-OPS-1: only the server can purge', '42501');

-- ======================================================================
-- RLS performance hygiene
-- ======================================================================
:as_admin
select tests.ok_sql($q$select count(*) = 0 from pg_policies where schemaname = 'public'
                         and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'$q$,
                    'RLS: every policy uses (select auth.uid()), never a per-row auth.uid()');
select tests.ok_sql($q$select count(*) = 0 from pg_policies where schemaname = 'public'
                         and coalesce(qual, '') || ' ' || coalesce(with_check, '')
                             ~ '(is_space_member|is_space_manager|is_space_owner|is_household_member|is_child_guardian|can_see_circle)\('$q$,
                    'RLS: membership helpers are wrapped as once-per-statement (select ...) arrays, not per-row calls');
select tests.ok_sql($q$
  select count(*) = 0 from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                    and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey,1)] = c.conkey)$q$,
                    'Indexes: every foreign key has an index on its columns');
create function tests.posts_match_rule(p_user uuid) returns boolean language plpgsql as $$
declare a uuid[]; b uuid[];
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  -- the rule, evaluated as superuser over every row
  select coalesce(array_agg(id order by id), '{}') into b from public.posts where public.can_view_post(id);
  -- what the policy lets the user read
  execute 'set local role authenticated';
  select coalesce(array_agg(id order by id), '{}') into a from public.posts;
  execute 'reset role';
  return a = b;
end $$;
grant execute on function tests.posts_match_rule(uuid) to authenticated;
select tests.ok_sql($q$select bool_and(tests.posts_match_rule(id)) from auth.users$q$,
                    'RLS: rewritten posts policy returns exactly the rows can_view_post() allows, for every user');

-- ======================================================================
-- Summary
-- ======================================================================
reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo API RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
