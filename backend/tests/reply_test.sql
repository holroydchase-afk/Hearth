-- Who reads replies (comments + hearts), Chase Oct 16: safe default = only the parents
-- (owners/adults); a group can let its members read each other's replies; the family can
-- change the default. Runs against a FRESH db: stub -> migrations -> seed -> this file.
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
\set as_aunt_jo  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''c0000000-0000-0000-0000-0000000000c1'', false);'
\set as_anon     'reset role; set role anon; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'

-- seed: post p_a_gp -> group "Grandparents – Dad's side" (Grandma + Grandpa Rivera);
--       Grandpa commented "Look at him go!", Grandma hearted it.
create function tests.comments_seen(p_post uuid) returns int language sql as $$
  select count(*)::int from public.get_comments(p_post) $$;
create function tests.feed_row(p_space uuid, p_post uuid) returns jsonb language sql as $$
  select to_jsonb(f) from public.get_feed(p_space) f where f.post_id = p_post $$;
grant execute on all functions in schema tests to authenticated, anon;

-- ======================================================================
-- Default: only the parents read a relative's reply (AUD-8)
-- ======================================================================
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 0', :p_a_gp),
                    'AUD-8: by default Grandma can''t read Grandpa''s comment, even in the same group');
select tests.ok_sql(format($$select not exists (select 1 from public.comments where post_id = %L and author_id <> auth.uid())$$, :p_a_gp),
                    'AUD-8: ...not through the table either');
select tests.ok_sql(format($$select (tests.feed_row(%L, %L)->>'comment_count')::int = 0$$, :space_a, :p_a_gp),
                    'AUD-8: the comment count she sees doesn''t give it away');
:as_gpa_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 1', :p_a_gp), 'AUD-8: Grandpa sees his own comment');
select tests.ok_sql(format($$select (tests.feed_row(%L, %L)->>'heart_count')::int = 0$$, :space_a, :p_a_gp),
                    'AUD-8: Grandpa can''t tell Grandma hearted it (heart count shows only what he may see)');
select tests.ok_sql(format($$select tests.feed_row(%L, %L)->>'reply_scope' = 'parents'$$, :space_a, :p_a_gp),
                    'AUD-8: the app is told his replies reach only the parents');
:as_alex
select tests.ok_sql(format('select tests.comments_seen(%L) = 1', :p_a_gp), 'AUD-8: the parent (owner) reads every reply');
select tests.ok_sql(format($$select (tests.feed_row(%L, %L)->>'heart_count')::int = 1$$, :space_a, :p_a_gp),
                    'AUD-8: ...and sees every heart');
select tests.lives(format($$select public.add_comment(gen_random_uuid(), %L, 'Thanks Dad!')$$, :p_a_gp), 'setup: Alex answers');
select tests.ok_sql(format($$select tests.feed_row(%L, %L)->>'reply_scope' = 'everyone'$$, :space_a, :p_a_gp),
                    'AUD-8: a parent''s own replies reach everyone the post went to');
:as_gma_riv
select tests.ok_sql(format($$select array_agg(body) = array['Thanks Dad!'] from public.get_comments(%L)$$, :p_a_gp),
                    'AUD-8: so Grandma sees the parent''s answer, but still not Grandpa''s comment');
select tests.ok_sql(format($$select (public.toggle_heart(%L)).heart_count = 0$$, :p_a_gp),
                    'AUD-8: toggling her heart off reports only what she may see');
select tests.lives(format('select public.toggle_heart(%L)', :p_a_gp), 'setup: Grandma hearts again');

-- ======================================================================
-- 0011 (SPEC-GROUPS, Chase Oct 17): the per-group switch is gone (AUD-9 retired, REPLY-12); a household is
-- what lets relatives read each other (REPLY-7), and readers are fixed when a reply is written (privacy item 5)
-- ======================================================================
:as_alex
select tests.throws_code(format('select public.set_group_replies_shared(%L, true)', :c_a_gp),
                         'REPLY-12 (was AUD-9): set_group_replies_shared no longer exists', '42883');
select tests.ok_sql(format($$select kind = 'group' from public.my_circles(%L) where circle_id = %L$$, :space_a, :c_a_gp),
                    'REPLY-12 (was AUD-9): my_circles shows the kind, not a switch');
select tests.setv('h_riv', format($$select public.create_level(%L, 'household', 'Rivera house')$$, :space_a));
select tests.lives(format($$select public.place_person(%L, %L, 'all'), public.place_person(%L, %L, 'all')$$,
                          tests.v('h_riv'), :gma_riv, tests.v('h_riv'), :gpa_riv),
                   'setup: the parent puts Grandma and Grandpa Rivera in one household');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 1', :p_a_gp),
                    'REPLY-7 / privacy item 5: Grandpa''s earlier comment stays with the parents (written before they shared a house); she sees the parent''s');
select tests.ok_sql(format($$select tests.feed_row(%L, %L)->>'reply_scope' = 'group'$$, :space_a, :p_a_gp),
                    'REPLY-7: the app is told her replies now reach her household too');
:as_gpa_riv
select tests.lives(format($$select public.add_comment(gen_random_uuid(), %L, 'Go team')$$, :p_a_all), 'setup: Grandpa comments on the Everyone post');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 1', :p_a_all),
                    'REPLY-7: on the Everyone post, Grandma reads her household''s new comment');
:as_gma_chen
select tests.ok_sql(format('select tests.comments_seen(%L) = 0', :p_a_all),
                    'REPLY-7: ...and Grandma Chen (not in their house) doesn''t');
:as_alex
select tests.lives(format($$select public.unplace_person(%L, %L), public.unplace_person(%L, %L)$$,
                          tests.v('h_riv'), :gma_riv, tests.v('h_riv'), :gpa_riv),
                   'setup: the household is undone');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 0', :p_a_all),
                    'REPLY-7 narrowing is read-time: out of the house, she stops reading Grandpa''s comment at once');

-- ======================================================================
-- The family can change the default (AUD-10)
-- ======================================================================
:as_gma_riv
select tests.throws_code(format($$select public.set_reply_audience(%L, 'everyone')$$, :space_a),
                         'AUD-10: a viewer can''t change it (42501)', '42501');
:as_admin
update public.space_members set role = 'adult' where space_id = :space_a and user_id = :aunt_jo;
:as_aunt_jo
select tests.throws_code(format($$select public.set_reply_audience(%L, 'everyone')$$, :space_a),
                         'AUD-10: an adult who isn''t the owner can''t either (42501)', '42501');
:as_admin
update public.space_members set role = 'viewer' where space_id = :space_a and user_id = :aunt_jo;
:as_alex
select tests.throws_code(format($$select public.set_reply_audience(%L, 'sometimes')$$, :space_a),
                         'AUD-10: unknown choice is 23514', '23514');
select tests.lives(format($$select public.set_reply_audience(%L, 'everyone')$$, :space_a),
                   'AUD-10: the owner opens replies to everyone the post went to');
select tests.ok_sql(format($$select reply_audience = 'everyone' from public.my_spaces() where space_id = %L$$, :space_a),
                    'AUD-10: my_spaces shows the family''s choice');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 1', :p_a_all),
                    'AUD-10: then Grandma reads Grandpa''s reply on the Everyone post');
select tests.ok_sql(format($$select tests.feed_row(%L, %L)->>'reply_scope' = 'everyone'$$, :space_a, :p_a_all),
                    'AUD-10: and the app says so');
:as_ray
select tests.throws_code(format($$select public.set_reply_audience(%L, 'parents')$$, :space_a),
                         'AUD-10: not in the family -> not found (P0002)', 'P0002');
:as_alex
select tests.lives(format($$select public.set_reply_audience(%L, 'parents')$$, :space_a), 'setup: back to the safe default');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 0', :p_a_all), 'AUD-10: back to parents-only immediately');

-- ======================================================================
-- privacy-security review: no side doors
-- ======================================================================
:as_gpa_riv
select tests.throws_code(format('select reaction_count from public.posts where id = %L', :p_a_gp),
                         'AUD-8 review: the raw heart counter on posts is not readable (42501)', '42501');
select tests.throws_code(format('select comment_count from public.posts where id = %L', :p_a_gp),
                         'AUD-8 review: the raw comment counter on posts is not readable (42501)', '42501');
select tests.ok_sql(format($$select caption is not null from public.posts where id = %L$$, :p_a_gp),
                    'AUD-8 review: ...while the post itself still reads fine');
:as_gma_chen
select tests.ok_sql(format('select public.reply_scope(%L) is null', :p_a_gp),
                    'AUD-8 review: reply_scope on a post you can''t see says nothing ("not found")');
-- a relative from another group who replied must not become visible through that reply
:as_admin
insert into auth.users (id, email, raw_user_meta_data) values ('f0000000-0000-0000-0000-0000000000c9', 'cousin@example.com', '{"display_name":"Cousin Pat"}');
insert into public.space_members (space_id, user_id, role, invited_by) values (:space_a, 'f0000000-0000-0000-0000-0000000000c9', 'viewer', :alex);
insert into public.circles (id, space_id, name, created_by) values ('33333333-0000-0000-0000-0000000000c9', :space_a, 'Cousins', :alex);
insert into public.circle_members (circle_id, user_id) values ('33333333-0000-0000-0000-0000000000c9', 'f0000000-0000-0000-0000-0000000000c9');
insert into public.posts (id, space_id, author_id, caption) values ('55555555-0000-0000-0000-0000000000c9', :space_a, :alex, 'Both groups');
insert into public.post_audiences (post_id, circle_id) values ('55555555-0000-0000-0000-0000000000c9', :c_a_gp), ('55555555-0000-0000-0000-0000000000c9', '33333333-0000-0000-0000-0000000000c9');
update public.posts set status = 'published' where id = '55555555-0000-0000-0000-0000000000c9';
insert into public.comments (post_id, author_id, body) values ('55555555-0000-0000-0000-0000000000c9', 'f0000000-0000-0000-0000-0000000000c9', 'Hi from the cousins');
insert into public.reactions (post_id, user_id, emoji) values ('55555555-0000-0000-0000-0000000000c9', 'f0000000-0000-0000-0000-0000000000c9', '❤️');
:as_gma_riv
select tests.ok_sql($$select not exists (select 1 from public.profiles where id = 'f0000000-0000-0000-0000-0000000000c9')$$,
                    'AUD-8 review: a relative in another group who replied stays invisible (no profile leak)');
:as_alex
select tests.ok_sql($$select exists (select 1 from public.profiles where id = 'f0000000-0000-0000-0000-0000000000c9')$$,
                    'AUD-8 review: ...while the parent still sees who replied');

-- ======================================================================
-- privacy-security review (Oct 17): 0010 made the reply helpers plpgsql (cached plans), and
-- the feed/timeline row builder works the reply rule out for the whole page. Both must
-- give exactly what can_see_reply / reply_scope give, for every member, in every setting.
-- ======================================================================
:as_admin
-- more replies: a second parent (Aunt Jo as 'adult'), the Everyone-only grandma, the cousin, a deleted comment
update public.space_members set role = 'adult' where space_id = :space_a and user_id = :aunt_jo;
insert into public.circle_members (circle_id, user_id) values (:c_a_all, 'f0000000-0000-0000-0000-0000000000c9');
insert into public.comments (post_id, author_id, body) values
  (:p_a_all, :aunt_jo, 'From Aunt Jo'), (:p_a_all, :gma_chen, 'From Grandma Chen'),
  (:p_a_all, 'f0000000-0000-0000-0000-0000000000c9', 'From the cousin'), ('55555555-0000-0000-0000-0000000000c9', :gma_riv, 'Grandma on both');
insert into public.comments (post_id, author_id, body, deleted_at) values (:p_a_all, :gma_riv, 'deleted one', now());
insert into public.reactions (post_id, user_id, emoji) values
  (:p_a_all, :aunt_jo, '❤️'), (:p_a_all, :gma_chen, '❤️'), (:p_a_all, :gpa_riv, '❤️'),
  (:p_a_all, 'f0000000-0000-0000-0000-0000000000c9', '❤️'), ('55555555-0000-0000-0000-0000000000c9', :gpa_riv, '❤️')
  on conflict do nothing;
-- Mismatches between the page rows and the per-reply rule, for one member ('' = none; null = error).
create function tests.reply_rows_mismatch(p_user uuid) returns text language plpgsql as $$
declare bad text; n int;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select count(*), coalesce(string_agg(x.src || ':' || x.post_id || ' h' || x.heart_count || ' c' || x.comment_count || ' ' || coalesce(x.reply_scope, '-'), '; ')
                        filter (where x.heart_count <> (select count(*) from public.reactions r
                                                         where r.post_id = x.post_id and public.can_see_reply(x.post_id, r.user_id))
                                   or x.comment_count <> (select count(*) from public.comments c
                                                           where c.post_id = x.post_id and c.deleted_at is null
                                                             and public.can_see_reply(x.post_id, c.author_id))
                                   or x.reply_scope is distinct from public.reply_scope(x.post_id)), '')
    into n, bad
  from (select 'feed' src, f.post_id, f.heart_count, f.comment_count, f.reply_scope
          from public.get_feed('22222222-0000-0000-0000-00000000000a', null, null, 50) f
        union all
        select 'timeline', t.post_id, t.heart_count, t.comment_count, t.reply_scope
          from public.get_timeline('22222222-0000-0000-0000-00000000000a', null, null, 50) t) x;
  return case when n = 0 then 'no rows' else bad end;
exception when others then
  return 'error ' || sqlstate || ' ' || sqlerrm;
end $$;
create function tests.reply_rows_all_match() returns text language sql as $$
  select coalesce(string_agg(u::text || ' -> ' || m, ' | ') filter (where m <> ''), '')
  from (select u, tests.reply_rows_mismatch(u) m
        from unnest(array['a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a1',
                          'a0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000b',
                          'b0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000c1',
                          'f0000000-0000-0000-0000-0000000000c9']::uuid[]) u) t $$;
select tests.ok(tests.reply_rows_all_match() = '',
                'AUD-8 perf: default (parents read replies): every member''s feed and timeline counts and reply_scope equal the per-reply rule');
-- 0011: two households (was AUD-9's two sharing groups): the Riveras in one, the cousin and Grandma Chen in another,
-- an event on the "Both groups" post holding the cousins' house, and replies written before and after the placements
insert into public.circles (id, space_id, name, kind, created_by) values
  ('33333333-0000-0000-0000-0000000000d1', :space_a, 'Grandparents house', 'household', :alex),
  ('33333333-0000-0000-0000-0000000000d2', :space_a, 'Cousins house', 'household', :alex),
  ('33333333-0000-0000-0000-0000000000d3', :space_a, 'Reunion', 'event', :alex);
insert into public.circle_people (circle_id, user_id) values
  ('33333333-0000-0000-0000-0000000000d1', :gma_riv), ('33333333-0000-0000-0000-0000000000d1', :gpa_riv),
  ('33333333-0000-0000-0000-0000000000d2', 'f0000000-0000-0000-0000-0000000000c9'), ('33333333-0000-0000-0000-0000000000d2', :gma_chen);
insert into public.circle_links (parent_id, child_id) values
  ('33333333-0000-0000-0000-0000000000d3', '33333333-0000-0000-0000-0000000000d1'),
  ('33333333-0000-0000-0000-0000000000d3', '33333333-0000-0000-0000-0000000000d2');
insert into public.post_audiences (post_id, circle_id) values ('55555555-0000-0000-0000-0000000000c9', '33333333-0000-0000-0000-0000000000d3');
-- Grandma Chen (in the event through the cousins' house) replies for the first time after the placements
insert into public.comments (post_id, author_id, body) values ('55555555-0000-0000-0000-0000000000c9', :gma_chen, 'Grandma Chen at the reunion');
insert into public.reactions (post_id, user_id, emoji) values ('55555555-0000-0000-0000-0000000000c9', :gma_chen, '❤️');
select tests.ok(tests.reply_rows_all_match() = '',
                'REPLY-7/8 perf (was AUD-9): with two households and an event, replies before and after the placements, counts and reply_scope still equal the per-reply rule');
:as_gma_riv
select tests.ok_sql($$select array_agg(body order by body) = array['Grandma Chen at the reunion', 'Grandma on both']
                      from public.get_comments('55555555-0000-0000-0000-0000000000c9')$$,
                    'REPLY-8 / privacy item 5: Grandma Rivera reads her event-mate''s new comment, not the cousin''s from before the event');
:as_admin
delete from public.post_audiences where circle_id = '33333333-0000-0000-0000-0000000000d3';
delete from public.circle_people where circle_id in ('33333333-0000-0000-0000-0000000000d1', '33333333-0000-0000-0000-0000000000d2');
update public.spaces set reply_audience = 'everyone' where id = :space_a;
select tests.ok(tests.reply_rows_all_match() = '',
                'AUD-10 perf: with replies open to everyone, counts and reply_scope still equal the per-reply rule');
update public.spaces set reply_audience = 'parents' where id = :space_a;
select tests.ok(tests.reply_rows_all_match() = '',
                'AUD-8 perf: back on the safe default, still equal');
-- the fixture really separates people: Grandma Chen sees fewer hearts on the Everyone post than the parent
:as_gma_chen
select tests.setv('chen_h', format($$select heart_count from public.get_feed(%L) where post_id = %L$$, :space_a, :p_a_all));
:as_alex
select tests.setv('alex_h', format($$select heart_count from public.get_feed(%L) where post_id = %L$$, :space_a, :p_a_all));
select tests.ok(tests.v('chen_h')::int < tests.v('alex_h')::int,
                'AUD-8 perf: the fixture is not trivial (a grandma sees fewer hearts on the Everyone post than the parent)');
:as_admin
select tests.ok((select p.prosrc !~* 'can_see_reply|reply_scope\s*\(' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'feed_rows'),
                'AUD-8 perf: private.feed_rows works the reply rule out per page, not by calling can_see_reply per heart and comment');
-- 0010's plan cache must not carry one person's answer to the next request on the same connection
-- (PostgREST reuses connections). 10 rounds: past the 5 calls after which plpgsql may switch to a generic plan.
create function tests.plan_cache_flip() returns boolean language plpgsql as $$
declare ok boolean := true;
begin
  for i in 1 .. 10 loop
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);  -- Grandma Rivera
    ok := ok and public.can_view_post('55555555-0000-0000-0000-0000000000a1')
             and public.reply_scope('55555555-0000-0000-0000-0000000000a1') = 'parents'
             and not public.can_see_reply('55555555-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
    perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-0000000000b1', true);  -- Grandma Chen
    ok := ok and not public.can_view_post('55555555-0000-0000-0000-0000000000a1')
             and public.reply_scope('55555555-0000-0000-0000-0000000000a1') is null
             and not public.can_see_reply('55555555-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);  -- Alex (parent)
    ok := ok and public.can_see_reply('55555555-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2')
             and public.reply_scope('55555555-0000-0000-0000-0000000000a1') = 'everyone';
  end loop;
  return ok;
end $$;
select tests.ok(tests.plan_cache_flip(),
                'AUD-8 / 0010 plan cache: switching people on one connection 10 times never carries an answer over (allowed and excluded both ways)');

-- ======================================================================
-- Summary
-- ======================================================================
reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo REPLY RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
