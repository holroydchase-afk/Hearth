-- Notification outbox + sender contract (migration 0003). BETA IDs in titles.
-- NOTIFY-2 audience-only + no content in payload, NOTIFY-4 batching, REPLY-3 reactions.
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

-- ---------- notify helpers (admin only) ----------
-- A published post by p_author to one circle with p_photos photo items. Returns post id.
create function tests.mkpost(p_author uuid, p_circle uuid, p_photos int, p_caption text) returns uuid
language plpgsql as $$
declare v_post uuid := gen_random_uuid(); v_space uuid;
begin
  select space_id into v_space from public.circles where id = p_circle;
  insert into public.posts (id, space_id, author_id, caption) values (v_post, v_space, p_author, p_caption);
  insert into public.post_audiences (post_id, circle_id) values (v_post, p_circle);
  insert into public.post_children (post_id, child_id) values (v_post, '44444444-0000-0000-0000-000000000001');
  for i in 0 .. p_photos - 1 loop
    insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                    width, height, byte_size, thumb_byte_size, exif_stripped)
    values (v_post, v_space, p_author, i, 'photo', 'image/jpeg', 'secret-key-' || i, 'secret-thumb-' || i,
            100, 100, 1000, 100, true);
  end loop;
  update public.posts set status = 'published' where id = v_post;
  return v_post;
end $$;
-- Run the sender's claim at a simulated time; keep what it returned in tests.batches.
create table tests.batches as select * from public.claim_notification_batches(now()) limit 0;
create function tests.claim(p_now timestamptz) returns int language plpgsql as $$
declare n int;
begin
  delete from tests.batches;
  insert into tests.batches select * from public.claim_notification_batches(p_now);
  get diagnostics n = row_count;
  return n;
end $$;
-- Pretend the pending notices were queued at p_at (the simulated clock).
create function tests.queued_at(p_at timestamptz) returns void language sql as $$
  update public.notification_outbox set created_at = p_at where sent_at is null $$;
create function tests.batch_count(p_user uuid) returns int language sql as $$
  select count(*)::int from tests.batches where recipient_id = p_user $$;

-- ======================================================================
-- Setup: clear seed notices; known prefs; push tokens for the Rivera side + Alex
-- ======================================================================
:as_admin
delete from public.notification_outbox;
delete from public.notification_prefs;
insert into public.push_tokens (user_id, expo_token, platform) values
  (:alex,    'ExponentPushToken[alex]',    'ios'),
  (:gma_riv, 'ExponentPushToken[gma_riv]', 'android'),
  (:gpa_riv, 'ExponentPushToken[gpa_riv]', 'ios');
-- Simulated clock: fixed, so results never depend on the real date. Mon Nov 2, 2026, noon Eastern.
select tests.setv('t0', $$select '2026-11-02 12:00 America/New_York'::timestamptz$$);

-- ======================================================================
-- BETA-NOTIFY-2: only the audience; no image, caption or child's name
-- ======================================================================
select tests.setv('p1', format('select tests.mkpost(%L, %L, 1, %L)', :alex, :c_a_gp, 'Sam lost a tooth at Grandma''s'));
select tests.ok_sql($$select array_agg(recipient_id order by recipient_id)
                          = array['a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a2']::uuid[]
                      from public.notification_outbox$$,
                    'BETA-NOTIFY-2: publishing to the Dad''s-side grandparents group queues exactly those two members');
select tests.ok_sql(format('select not exists (select 1 from public.notification_outbox where recipient_id in (%L,%L,%L,%L))',
                           :alex, :blair, :aunt_jo, :gma_chen),
                    'BETA-NOTIFY-2: the author, the co-parent, Aunt Jo and Grandma Chen get nothing');
select tests.setv('n', format($$select tests.claim(%L::timestamptz)$$, tests.v('t0')));
select tests.ok_sql($$select tests.v('n') = '2'$$,
                    'BETA-NOTIFY-2: the sender claims one notice per audience member');
select tests.ok_sql(format($$select push_tokens = array['ExponentPushToken[gma_riv]'] and channel = 'push'
                                    and actor_first_names = array['Alex'] and post_ids = array[%L::uuid]
                             from tests.batches where recipient_id = %L$$, tests.v('p1'), :gma_riv),
                    'BETA-NOTIFY-2: the notice carries the poster''s first name, the post id and only that member''s token');
select tests.ok_sql($$select bool_and(b::text not like '%tooth%' and b::text not like '%Sam%'
                                      and b::text not like '%secret-%' and b::text not like '%http%')
                      from tests.batches b$$,
                    'BETA-NOTIFY-2: the claimed payload has no caption, no child''s name and no media key or URL');
select tests.ok_sql(format($$select tests.claim(%L::timestamptz + interval '1 hour') = 0$$, tests.v('t0')),
                    'BETA-NOTIFY-2: a claimed notice is never sent twice');

-- removed from the group before the sender runs -> nothing
:as_admin
delete from public.notification_outbox;
select tests.setv('p2', format('select tests.mkpost(%L, %L, 1, %L)', :alex, :c_a_gp, 'x'));
delete from public.circle_members where circle_id = :c_a_gp and user_id = :gpa_riv;
select tests.setv('n', format($$select tests.claim(%L::timestamptz + interval '1 day')$$, tests.v('t0')));
select tests.ok_sql(format($$select tests.v('n') = '1' and tests.batch_count(%L) = 0$$, :gpa_riv),
                    'BETA-NOTIFY-2: someone removed from the group before sending gets no notice');
insert into public.circle_members (circle_id, user_id) values (:c_a_gp, :gpa_riv);

-- ======================================================================
-- BETA-NOTIFY-4: 5 photos in one post, or 3 posts in 10 minutes -> 1 notice each
-- ======================================================================
:as_admin
delete from public.notification_outbox;
select tests.setv('t1', format($$select %L::timestamptz + interval '2 days'$$, tests.v('t0')));
select tests.mkpost(:alex, :c_a_gp, 5, 'five photos');
select tests.ok_sql(format($$select tests.claim(%L) = 2 and tests.batch_count(%L) = 1$$, tests.v('t1'), :gma_riv),
                    'BETA-NOTIFY-4: a post with 5 photos gives each recipient 1 notice, not 5');
:as_admin
select tests.mkpost(:alex, :c_a_gp, 1, 'a');
select tests.mkpost(:alex, :c_a_gp, 1, 'b');
select tests.mkpost(:alex, :c_a_gp, 1, 'c');
select tests.ok_sql(format($$select tests.claim(%L::timestamptz + interval '4 minutes') = 0$$, tests.v('t1')),
                    'BETA-NOTIFY-4: posts within 10 minutes of the last notice wait (no second buzz)');
select tests.setv('n', format($$select tests.claim(%L::timestamptz + interval '11 minutes')$$, tests.v('t1')));
select tests.ok_sql(format($$select tests.v('n') = '2'
                             and (select cardinality(post_ids) from tests.batches where recipient_id = %L) = 3$$, :gma_riv),
                    'BETA-NOTIFY-4: after the 10-minute window, 3 posts arrive as 1 notice per recipient');
:as_admin
delete from public.notification_outbox;
select tests.setv('t2', format($$select %L::timestamptz + interval '3 days'$$, tests.v('t0')));
select tests.mkpost(:alex, :c_a_gp, 1, 'a');
select tests.mkpost(:alex, :c_a_gp, 1, 'b');
select tests.mkpost(:alex, :c_a_gp, 1, 'c');
select tests.setv('n', format($$select tests.claim(%L)$$, tests.v('t2')));
select tests.ok_sql($$select tests.v('n') = '2' and bool_and(cardinality(post_ids) = 3) from tests.batches$$,
                    'BETA-NOTIFY-4: 3 posts queued together go out as 1 notice per recipient');

-- ======================================================================
-- BETA-REPLY-3: hearts and comments notify the poster, never the reactor
-- ======================================================================
:as_admin
delete from public.notification_outbox;
select tests.setv('p3', format('select tests.mkpost(%L, %L, 1, %L)', :alex, :c_a_gp, 'y'));
delete from public.notification_outbox;
:as_gma_riv
select tests.lives(format('select public.add_comment(gen_random_uuid(), %L, %L)', tests.v('p3'), 'So cute'), 'setup: Grandma Rivera comments');
:as_gpa_riv
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Grandpa Rivera hearts');
:as_admin
select tests.setv('n', format($$select tests.claim(%L::timestamptz + interval '4 days')$$, tests.v('t0')));
select tests.ok_sql(format($$select tests.v('n') = '1'
                             and (select comment_count = 1 and heart_count = 1 and post_count = 0
                                         and actor_first_names = array['Grandma','Grandpa'] and channel = 'push'
                                    from tests.batches where recipient_id = %L)$$, :alex),
                    'BETA-REPLY-3: a comment and a heart on Alex''s post reach Alex as 1 notice');
select tests.ok_sql(format('select tests.batch_count(%L) = 0 and tests.batch_count(%L) = 0', :gma_riv, :gpa_riv),
                    'BETA-REPLY-3: the people who reacted get nothing about their own reaction');
select tests.ok_sql($$select bool_and(b::text not like '%So cute%') from tests.batches b$$,
                    'BETA-REPLY-3: the comment text is not in the notice');
:as_alex
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Alex hearts the post they made');
:as_admin
select tests.ok_sql(format('select not exists (select 1 from public.notification_outbox where recipient_id = %L and sent_at is null)', :alex),
                    'BETA-REPLY-3: hearting your own post queues nothing');
:as_gpa_riv
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Grandpa un-hearts');
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Grandpa hearts again');
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Grandpa un-hearts again');
select tests.lives(format('select public.toggle_heart(%L)', tests.v('p3')), 'setup: Grandpa hearts a third time');
:as_admin
select tests.ok_sql(format('select count(*) = 1 from public.notification_outbox where recipient_id = %L and sent_at is null', :alex),
                    'BETA-NOTIFY-4: hearting on and off repeatedly queues 1 notice, not one per tap');

-- ======================================================================
-- Channels: push vs email digest vs nothing (notification_prefs)
-- ======================================================================
:as_admin
delete from public.notification_outbox;
insert into public.notification_prefs (user_id, space_id, push, email_digest) values
  (:gma_riv, :space_a, false, 'daily'),
  (:gpa_riv, :space_a, false, 'off');
-- Emails go out at the times the Help screen promises (Eastern):
-- "every evening" = 6 pm, "every Sunday morning" = 8 am.
select tests.mkpost(:alex, :c_a_gp, 1, 'z');
select tests.queued_at('2026-11-07 10:00 America/New_York');
select tests.ok_sql($$select tests.claim('2026-11-07 12:00 America/New_York') = 0$$,
                    'BETA-NOTIFY-5: a daily email waits for the evening (nothing at noon)');
select tests.ok_sql(format('select exists (select 1 from public.notification_outbox where recipient_id = %L and channel = ''none'' and sent_at is not null)', :gpa_riv),
                    'prefs: push off and email off -> nothing sent, and the notice is closed out (no pile-up)');
select tests.setv('n', $$select tests.claim('2026-11-07 18:05 America/New_York')$$);
select tests.ok_sql($$select tests.v('n') = '1' and (select channel = 'email' and email = 'grandma.rivera@example.com'
                                                    and push_tokens = '{}' from tests.batches)$$,
                    'BETA-NOTIFY-5: push off + daily email -> one email at 6 pm, no push tokens');
:as_admin
select tests.mkpost(:alex, :c_a_gp, 1, 'z2');
select tests.queued_at('2026-11-07 19:00 America/New_York');
select tests.ok_sql($$select tests.claim('2026-11-07 20:00 America/New_York') = 0
                         and tests.claim('2026-11-08 17:59 America/New_York') = 0
                         and tests.claim('2026-11-08 18:01 America/New_York') = 1$$,
                    'BETA-NOTIFY-5: one evening email per day; later photos wait for the next evening');
:as_admin
update public.notification_prefs set email_digest = 'weekly' where user_id = :gma_riv;
select tests.mkpost(:alex, :c_a_gp, 1, 'w');
select tests.queued_at('2026-11-14 19:00 America/New_York');
select tests.ok_sql($$select tests.claim('2026-11-14 20:00 America/New_York') = 0
                         and tests.claim('2026-11-15 07:59 America/New_York') = 0
                         and tests.claim('2026-11-15 08:30 America/New_York') = 1$$,
                    'BETA-NOTIFY-5: the Sunday email waits for Sunday 8 am');
:as_admin
delete from public.notification_prefs;
delete from public.push_tokens where user_id = :gma_riv;
select tests.mkpost(:alex, :c_a_gp, 1, 'z3');
select tests.setv('n', $$select tests.claim('2026-11-16 18:30 America/New_York')$$);
select tests.ok_sql(format($$select tests.v('n')::int >= 1
                             and (select channel = 'email' from tests.batches where recipient_id = %L)$$, :gma_riv),
                    'prefs: push wanted but no phone registered -> falls back to the evening email');

-- ======================================================================
-- Sender-only functions are not callable by app users
-- ======================================================================
:as_gma_riv
select tests.throws_code('select * from public.claim_notification_batches(now())', 'security: a signed-in user cannot claim notices', '42501');
select tests.throws_code('select public.release_notifications(array[gen_random_uuid()])', 'security: a signed-in user cannot release notices', '42501');
select tests.throws_code('select count(*) from public.notification_outbox', 'security: a signed-in user cannot read the outbox', '42501');
:as_anon
select tests.throws_code('select * from public.claim_notification_batches(now())', 'security: anon cannot claim notices', '42501');

-- Expo says a phone is gone (DeviceNotRegistered) -> the sender forgets that token
:as_admin
select public.forget_push_tokens(array['ExponentPushToken[gpa_riv]']);
select tests.ok_sql(format('select not exists (select 1 from public.push_tokens where user_id = %L)', :gpa_riv),
                    'sender: forget_push_tokens drops a token Expo reports as no longer registered');
insert into public.push_tokens (user_id, expo_token, platform) values (:gpa_riv, 'ExponentPushToken[gpa_riv]', 'ios');
:as_gma_riv
select tests.throws_code($$select public.forget_push_tokens(array['ExponentPushToken[alex]'])$$, 'security: a signed-in user cannot delete tokens', '42501');

-- release puts a failed send back in the queue
:as_admin
delete from public.notification_outbox;
select tests.mkpost(:alex, :c_a_gp, 1, 'r');
select tests.setv('t4', $$select '2026-11-20 19:00 America/New_York'::timestamptz$$);
select tests.claim(tests.v('t4')::timestamptz);
select public.release_notifications((select array_agg(o) from tests.batches, unnest(outbox_ids) o));
select tests.ok_sql(format($$select tests.claim(%L::timestamptz + interval '1 minute') = 2$$, tests.v('t4')),
                    'sender: release_notifications puts a failed send back, and it goes out on the next run');

-- ======================================================================
-- App RPCs: register_push_token, set_notification_prefs (API.md)
-- ======================================================================
:as_gma_chen
select tests.lives($$select public.register_push_token('ExponentPushToken[chen]', 'android')$$, 'register_push_token: a member saves her phone''s token');
select tests.lives($$select public.register_push_token('ExponentPushToken[chen]', 'android')$$, 'register_push_token: saving it again is a no-op (idempotent)');
select tests.throws_code($$select public.register_push_token('ExponentPushToken[x]', 'fax')$$, 'register_push_token: unknown platform is 23514', '23514');
select tests.throws_code($$select public.register_push_token('not-a-token', 'ios')$$, 'register_push_token: a malformed token is 23514', '23514');
:as_aunt_jo
select tests.lives($$select public.register_push_token('ExponentPushToken[chen]', 'android')$$, 'register_push_token: the same phone signed in by someone else');
:as_admin
select tests.ok_sql(format($$select user_id = %L from public.push_tokens where expo_token = 'ExponentPushToken[chen]'$$, :aunt_jo),
                    'register_push_token: the token moves to whoever signed in last (shared phone gets one person''s notices)');
:as_anon
select tests.throws_code($$select public.register_push_token('ExponentPushToken[y]', 'ios')$$, 'register_push_token: anon is 42501', '42501');

:as_gma_chen
select tests.lives(format($$select public.set_notification_prefs(%L, false, 'daily')$$, :space_a), 'set_notification_prefs: a member turns push off and picks a daily email');
select tests.ok_sql(format($$select push = false and email_digest = 'daily' from public.notification_prefs where user_id = %L and space_id = %L$$, :gma_chen, :space_a),
                    'set_notification_prefs: the choice is saved on the server');
select tests.lives(format($$select public.set_notification_prefs(%L, true, 'off')$$, :space_a), 'set_notification_prefs: changing it again overwrites');
select tests.throws_code(format($$select public.set_notification_prefs(%L, true, 'hourly')$$, :space_a), 'set_notification_prefs: unknown email choice is 23514', '23514');
:as_gma_riv
select tests.throws_code(format($$select public.set_notification_prefs(%L, true, 'off')$$, :space_b), 'set_notification_prefs: a space you are not in is P0002', 'P0002');

-- ======================================================================
-- Summary
-- ======================================================================
reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo NOTIFY RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
