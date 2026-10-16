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
-- The switch: a group whose members read each other's replies (AUD-9)
-- ======================================================================
:as_gma_riv
select tests.throws_code(format('select public.set_group_replies_shared(%L, true)', :c_a_gp),
                         'AUD-9: a viewer can''t flip the switch (not found)', 'P0002');
:as_alex
select tests.lives(format('select public.set_group_replies_shared(%L, true)', :c_a_gp),
                   'AUD-9: the parent turns on "members see each other''s replies" for the grandparents group');
select tests.ok_sql(format($$select replies_shared from public.my_circles(%L) where circle_id = %L$$, :space_a, :c_a_gp),
                    'AUD-9: my_circles shows the switch');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 2', :p_a_gp),
                    'AUD-9: now Grandma reads Grandpa''s comment (and the parent''s)');
select tests.ok_sql(format($$select tests.feed_row(%L, %L)->>'reply_scope' = 'group'$$, :space_a, :p_a_gp),
                    'AUD-9: the app is told her replies reach her group');
-- a post to "Everyone" (not switched on): the grandparents' replies stay with the parents
:as_gpa_riv
select tests.lives(format($$select public.add_comment(gen_random_uuid(), %L, 'Go team')$$, :p_a_all), 'setup: Grandpa comments on the Everyone post');
:as_gma_riv
select tests.ok_sql(format('select tests.comments_seen(%L) = 0', :p_a_all),
                    'AUD-9: the switch follows the post''s groups: on the Everyone post, Grandpa''s reply stays private');
:as_alex
select tests.lives(format('select public.set_group_replies_shared(%L, false)', :c_a_gp), 'setup: switch back off');

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
