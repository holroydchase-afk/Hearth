-- Messenger relay: MSG-2, 3, 5, 6, 7 (+ device/key-package plumbing for MSG-1, 8). docs/product/SPEC-MESSENGER.md,
-- migration 0015. Written FIRST: red until 0015 lands. The server only relays MLS bytes (base64 text); it never sees
-- plaintext, so MSG-1's "no words on the server" half is the app's test (src/messenger).
-- Seed people (space A, "Sam at Dad's"): Grandma Rivera (ma) and Grandpa Rivera (pa) are the group
-- "Grandparents – Dad's side" (a1). Aunt Jo (jo) is in Everyone (a0) but not a1. Blair is only in Co-parent.
-- Alex owns the family (a parent), so he is in every chat (REPLY-10's "parents read every reply").
-- Interpretations (staff-pm; change the test first):
--   * Every chat RPC answers P0002 "not found" for a circle the caller isn't in, or a household, or a deleted circle.
--   * chat_claim skips anyone not in the circle (no error, so it can't probe membership elsewhere).
--   * A member only fetches rows created at or after they joined the circle (they couldn't decrypt older ones anyway).
--   * Tables are RPC-only: no direct table access for app users.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_ma    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_pa    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a2'', false);'
\set as_jo    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''c0000000-0000-0000-0000-0000000000c1'', false);'
\set as_alex  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_blair 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-00000000000b'', false);'
\set g        '''33333333-0000-0000-0000-0000000000a1'''
\set ma       '''a0000000-0000-0000-0000-0000000000a1'''
\set pa       '''a0000000-0000-0000-0000-0000000000a2'''
\set jo       '''c0000000-0000-0000-0000-0000000000c1'''

-- an event (ma + jo) and a household (ma + pa) in space A
insert into public.circles (id, space_id, name, kind, created_by) values
  ('33333333-0000-0000-0000-0000000000e1', '22222222-0000-0000-0000-00000000000a', 'Charleston trip', 'event', 'a0000000-0000-0000-0000-00000000000a'),
  ('33333333-0000-0000-0000-0000000000d1', '22222222-0000-0000-0000-00000000000a', 'Rivera house',    'household', 'a0000000-0000-0000-0000-00000000000a');
insert into public.circle_members (circle_id, user_id) values
  ('33333333-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000a1'),
  ('33333333-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000c1'),
  ('33333333-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a1'),
  ('33333333-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2')
on conflict do nothing;
-- the seed predates kinds: make Dad's "Everyone" the family's Everyone, as 0011 does for real families
update public.circles set kind = 'everyone' where id = '33333333-0000-0000-0000-0000000000a0';
-- the group was made an hour ago, so the joined-at rule has room
update public.circle_members set added_at = now() - interval '1 hour' where circle_id in (:g, '33333333-0000-0000-0000-0000000000e1');

-- ---------- devices and key packages ----------
:as_ma
select tests.lives($$select public.chat_publish_device('c2lnLW1h', array['a3AtbWEtMQ==', 'a3AtbWEtMg=='])$$,
                   'MSG-1 a person publishes their phone''s signing key and key packages');
:as_pa
select tests.lives($$select public.chat_publish_device('c2lnLXBh', array['a3AtcGEtMQ=='])$$, 'MSG-1 ...and so does Grandpa');
select tests.throws_code($$select public.chat_publish_device('', array['a3A='])$$, 'MSG-1 an empty signing key is refused', '23514');
select tests.throws_code($$select public.chat_publish_device('bm90IGJhc2U2NA', array['%%%'])$$, 'MSG-1 a key package that is not base64 is refused', '23514');
:as_admin
select tests.throws_code($$select public.chat_publish_device('c2ln', array['a3A='])$$, 'MSG-1 publishing needs a signed-in person', '42501');

-- ---------- MSG-2: outsiders get "not found" for everything ----------
:as_jo
select tests.throws_code(format('select public.chat_start(%L)', :g), 'MSG-2 Aunt Jo (not in the group) can''t start its chat', 'P0002');
select tests.throws_code(format('select * from public.chat_fetch(%L, 0)', :g), 'MSG-2 ...can''t fetch it', 'P0002');
select tests.throws_code(format('select public.chat_send(%L, ''message'', 0, ''eA=='', null)', :g), 'MSG-2 ...can''t send to it', 'P0002');
select tests.throws_code(format('select * from public.chat_roster(%L)', :g), 'MSG-2 ...can''t read who is in it', 'P0002');
select tests.throws_code(format('select * from public.chat_claim(%L, array[%L]::uuid[])', :g, :pa), 'MSG-2 ...can''t claim keys through it', 'P0002');
select tests.throws_code(format('select * from public.chat_fetch(%L, 0)', gen_random_uuid()), 'MSG-2 a group that doesn''t exist looks the same', 'P0002');
:as_ma
select tests.throws_code($$select public.chat_start('33333333-0000-0000-0000-0000000000d1')$$, 'MSG-2 households have no chat (groups and events first)', 'P0002');
select tests.throws_code($$select * from public.chat_fetch('33333333-0000-0000-0000-0000000000d1', 0)$$, 'MSG-2 ...not even to fetch', 'P0002');

-- ---------- the list of chats ----------
:as_ma
select tests.ok_sql($$select array_agg(kind order by kind) = array['event', 'everyone', 'group'] from public.chat_list('22222222-0000-0000-0000-00000000000a')$$,
                    'MSG-1 Grandma''s chats: Everyone, her group and her event (no household, nothing she isn''t in)');
select tests.ok_sql($$select title = 'Alex and Grandpa Rivera' and member_count = 3 from public.chat_list('22222222-0000-0000-0000-00000000000a') where kind = 'group'$$,
                    'AUD-14 a relative sees a group chat titled by its people (the parent included), never the group''s name');
select tests.ok_sql($$select title = 'Charleston trip' from public.chat_list('22222222-0000-0000-0000-00000000000a') where kind = 'event'$$,
                    'MSG-7 an event chat keeps the event''s name');
:as_blair
select tests.ok_sql($$select not exists (select 1 from public.chat_list('22222222-0000-0000-0000-00000000000a') where title like 'Grandparents%' or circle_id = '33333333-0000-0000-0000-0000000000a1')$$,
                    'AUD-14 Blair never sees the grandparents'' group');
:as_jo
select tests.throws_code($$select * from public.chat_list('22222222-0000-0000-0000-00000000000b')$$, 'MSG-2 a family you aren''t in is "not found"', 'P0002');
:as_alex
select tests.ok_sql($$select array_agg(title order by title) = array['Charleston trip', 'Co-parent', 'Everyone', 'Grandparents – Dad''s side'] from public.chat_list('22222222-0000-0000-0000-00000000000a')$$,
                    'REPLY-10 the parent is in every chat of the family (not households), by its real names');

-- ---------- starting, roster, claiming ----------
:as_ma
select tests.ok_sql(format('select public.chat_start(%L)', :g), 'MSG-1 the first member to open Messages starts the group (true)');
:as_pa
select tests.ok_sql(format('select not public.chat_start(%L)', :g), 'MSG-1 the next one finds it already started (false)');
select tests.ok_sql(format('select count(*) = 3 and count(signature_key) = 2 and bool_or(name = ''Grandma Rivera'') and bool_or(name = ''Alex'') from public.chat_roster(%L)', :g),
                    'MSG-1 the roster lists the group''s two people plus the parent, with signing keys for those who have opened Messages');
select tests.ok_sql(format('select not exists (select 1 from public.chat_roster(%L) where user_id = %L)', :g, :jo),
                    'MSG-2 ...and nobody outside it');
:as_ma
select tests.ok_sql(format('select count(*) = 1 and bool_and(key_package = ''a3AtcGEtMQ=='') from public.chat_claim(%L, array[%L, %L]::uuid[])', :g, :pa, :jo),
                    'MSG-1 Grandma claims one of Grandpa''s key packages; Aunt Jo (not in the group) is skipped silently');
select tests.ok_sql(format('select count(*) = 0 from public.chat_claim(%L, array[%L]::uuid[])', :g, :pa),
                    'MSG-1 a claimed key package is never handed out twice');
:as_pa
select tests.lives($$select public.chat_publish_device('c2lnLXBh', array['a3AtcGEtMg==', 'a3AtcGEtMw=='])$$, 'MSG-1 Grandpa tops up his key packages');
:as_ma
select tests.ok_sql(format('select count(*) = 1 and bool_and(key_package in (''a3AtcGEtMg=='', ''a3AtcGEtMw=='')) from public.chat_claim(%L, array[%L]::uuid[])', :g, :pa),
                    'MSG-1 ...and the new ones are claimable');

-- ---------- MSG-5: one commit per epoch ----------
:as_ma
select tests.setv('c0', format('select public.chat_send(%L, ''commit'', 0, ''Y29tbWl0LW1h'', null)', :g));
select tests.ok(tests.v('c0') is not null, 'MSG-5 Grandma''s key change for epoch 0 is accepted');
:as_pa
select tests.throws_code(format('select public.chat_send(%L, ''commit'', 0, ''Y29tbWl0LXBh'', null)', :g),
                         'MSG-5 Grandpa''s key change for the same epoch loses (23505), so the group can''t split', '23505');
:as_ma
select tests.setv('w0', format('select public.chat_send(%L, ''welcome'', 0, ''d2VsY29tZQ=='', %L)', :g, :pa));
select tests.ok(tests.v('w0') is not null, 'MSG-6 a welcome addressed to Grandpa is accepted');
select tests.throws_code(format('select public.chat_send(%L, ''welcome'', 0, ''d2VsY29tZQ=='', %L)', :g, :jo),
                         'MSG-6 a welcome to someone outside the group is refused', '23514');
select tests.throws_code(format('select public.chat_send(%L, ''welcome'', 0, ''d2VsY29tZQ=='', null)', :g),
                         'MSG-6 a welcome must name who it is for', '23514');
select tests.throws_code(format('select public.chat_send(%L, ''message'', 1, ''eA=='', %L)', :g, :pa),
                         'MSG-6 ...and only a welcome may name one', '23514');
select tests.throws_code(format('select public.chat_send(%L, ''shout'', 1, ''eA=='', null)', :g), 'MSG-1 unknown kinds are refused', '23514');
select tests.throws_code(format('select public.chat_send(%L, ''message'', 1, ''not base64!'', null)', :g), 'MSG-1 a body that is not base64 is refused', '23514');
select tests.throws_code(format('select public.chat_send(%L, ''message'', 1, %L, null)', :g, repeat('QUFB', 30000)),
                         'MSG-1 a body over 64 KB is refused', '23514');
select tests.setv('m1', format('select public.chat_send(%L, ''message'', 1, ''c2VhbGVk'', null)', :g));
select tests.ok(tests.v('m1') is not null, 'MSG-1 a sealed message is accepted');

-- ---------- MSG-6: welcomes reach only their person ----------
:as_pa
select tests.ok_sql(format('select array_agg(kind order by id) = array[''commit'', ''welcome'', ''message''] from public.chat_fetch(%L, 0)', :g),
                    'MSG-6 Grandpa fetches the key change, his welcome and the message, in order');
select tests.ok_sql(format('select count(*) = 1 and bool_and(kind = ''message'') from public.chat_fetch(%L, %s)', :g, tests.v('w0')),
                    'MSG-1 fetching after a cursor returns only newer rows');
select tests.ok_sql(format('select bool_and(sender_id = %L) from public.chat_fetch(%L, 0)', :ma, :g), 'MSG-1 each row says who sent it');
:as_ma
select tests.ok_sql(format('select not exists (select 1 from public.chat_fetch(%L, 0) where kind = ''welcome'')', :g),
                    'MSG-6 Grandma (the sender) does not get Grandpa''s welcome back');

-- ---------- tables are RPC-only ----------
:as_pa
select tests.throws_any('select count(*) from public.chat_messages', 'PRIV app users can''t read the message table directly', array['42501', '42P01']);
select tests.throws_any('select count(*) from public.chat_key_packages', 'PRIV ...nor the key packages', array['42501', '42P01']);
select tests.throws_any($$insert into public.chat_messages (circle_id, sender_id, kind, epoch, body) values ('33333333-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2', 'message', 1, 'eA==')$$,
                        'PRIV ...nor write to it', array['42501', '42P01']);

-- ---------- joined-at: newcomers fetch only what came after them ----------
:as_admin
update public.chat_messages set created_at = created_at - interval '30 minutes' where circle_id = :g;
insert into public.circle_members (circle_id, user_id) values (:g, :jo);
:as_jo
select tests.ok_sql(format('select count(*) = 0 from public.chat_fetch(%L, 0)', :g), 'MSG-1 Aunt Jo, added now, fetches none of the older rows');
select tests.setv('m2', format('select public.chat_send(%L, ''message'', 2, ''c2VhbGVkMg=='', null)', :g));
select tests.ok_sql(format('select count(*) = 1 from public.chat_fetch(%L, 0)', :g), 'MSG-1 ...but does fetch what comes after');

-- ---------- MSG-3: removed means cut off at once ----------
:as_admin
delete from public.circle_members where circle_id = :g and user_id = :pa;
:as_pa
select tests.throws_code(format('select * from public.chat_fetch(%L, 0)', :g), 'MSG-3 Grandpa, removed from the group, fetches nothing ("not found")', 'P0002');
select tests.throws_code(format('select public.chat_send(%L, ''message'', 2, ''eA=='', null)', :g), 'MSG-3 ...and can''t send', 'P0002');
:as_ma
select tests.ok_sql(format('select not exists (select 1 from public.chat_roster(%L) where user_id = %L)', :g, :pa),
                    'MSG-3 Grandpa leaves the roster, so the others'' phones remove him at the next key change');
select tests.ok_sql(format('select count(*) = 0 from public.chat_claim(%L, array[%L]::uuid[])', :g, :pa), 'MSG-3 ...and his key packages can''t be claimed through it');

-- ---------- MSG-7: events work like groups ----------
:as_ma
select tests.ok_sql($$select public.chat_start('33333333-0000-0000-0000-0000000000e1')$$, 'MSG-7 an event''s chat starts like a group''s');
:as_jo
select tests.ok_sql($$select public.chat_send('33333333-0000-0000-0000-0000000000e1', 'message', 0, 'ZXZlbnQ=', null) > 0$$, 'MSG-7 an event-mate sends');
:as_ma
select tests.ok_sql($$select count(*) = 1 from public.chat_fetch('33333333-0000-0000-0000-0000000000e1', 0)$$, 'MSG-7 ...and the other reads');
:as_blair
select tests.throws_code($$select * from public.chat_fetch('33333333-0000-0000-0000-0000000000e1', 0)$$, 'MSG-7 someone not at the event gets "not found"', 'P0002');

-- ---------- MSG-8: a new phone replaces the old one ----------
:as_ma
select tests.lives($$select public.chat_publish_device('c2lnLW1hLW5ldw==', array['a3AtbWEtbmV3'])$$, 'MSG-8 Grandma signs in on a new phone');
select tests.ok_sql(format('select signature_key = ''c2lnLW1hLW5ldw=='' from public.chat_roster(%L) where user_id = %L', :g, :ma),
                    'MSG-8 the roster shows her new signing key, so the others swap her phone at the next key change');
:as_jo
select tests.ok_sql(format('select count(*) = 1 and bool_and(key_package = ''a3AtbWEtbmV3'') from public.chat_claim(%L, array[%L]::uuid[])', :g, :ma),
                    'MSG-8 ...and only the new phone''s key packages are handed out');

reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo CHAT RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
