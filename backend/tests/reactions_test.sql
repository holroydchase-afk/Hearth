-- REACT-1..6 (Chase, Oct 25): Love, Haha and Like on a moment, migration 0017. Written FIRST: red until 0017 lands.
-- One reaction per person per post (the reactions table's key is unchanged): tapping the same one again takes it
-- back, tapping another switches to it. Only ❤️ 😂 👍. Counts follow the same reply rules as hearts (AUD-8,
-- can_see_reply), so a reaction you couldn't read as a reply isn't counted for you. toggle_heart stays for older
-- app builds. Seed: Alex owns space A and post a1 (Dad's side); Grandma Rivera (ma) is a viewer there and has
-- already hearted a1; Jo is in space B and can't see a1.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_ma    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_alex  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_jo    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''c0000000-0000-0000-0000-0000000000c1'', false);'
\set p1       '''55555555-0000-0000-0000-0000000000a1'''

-- ---------- REACT-1 switch, take back ----------
:as_ma
select tests.ok_sql(format($$select r.my_reaction = '❤️' and r.counts = '{"❤️": 1}'::jsonb
                               from public.reaction_summary(array[%L]::uuid[]) r$$, :p1),
                    'REACT-1 the summary says Grandma''s heart is hers and counts it');
select tests.ok_sql(format($$select (s).my_reaction = '😂' and (s).heart_count = 1 and (s).counts = '{"😂": 1}'::jsonb
                               from (select public.set_reaction(%L, '😂') s) x$$, :p1),
                    'REACT-1 tapping Haha switches her heart to Haha (still one reaction)');
select tests.ok_sql(format($$select (s).my_reaction is null and (s).heart_count = 0 and (s).counts = '{}'::jsonb
                               from (select public.set_reaction(%L, '😂') s) x$$, :p1),
                    'REACT-1 tapping Haha again takes it back');
select tests.ok_sql(format($$select (s).my_reaction = '👍' from (select public.set_reaction(%L, '👍') s) x$$, :p1),
                    'REACT-1 Like works from nothing');

-- ---------- REACT-2 counts per kind, and the old feed fields still agree ----------
:as_alex
select tests.lives(format($$select public.set_reaction(%L, '❤️')$$, :p1), 'setup: Alex loves his own post');
select tests.ok_sql(format($$select r.my_reaction = '❤️' and r.counts = '{"❤️": 1, "👍": 1}'::jsonb
                               from public.reaction_summary(array[%L]::uuid[]) r$$, :p1),
                    'REACT-2 the summary counts each kind');
select tests.ok_sql(format($$select f.heart_count = 2 and f.i_hearted from public.get_feed('22222222-0000-0000-0000-00000000000a') f
                              where f.post_id = %L$$, :p1),
                    'REACT-2 the feed''s heart_count is every reaction, and i_hearted means "I reacted" (old apps keep working)');

-- ---------- REACT-3 only three kinds ----------
select tests.throws_code(format($$select public.set_reaction(%L, '🔥')$$, :p1), 'REACT-3 any other emoji is refused', '22023');
select tests.throws_code(format($$select public.set_reaction(%L, null)$$, :p1), 'REACT-3 an empty reaction is refused', '22023');

-- ---------- REACT-4 a post you can't see is "not found" ----------
:as_jo
select tests.throws_code(format($$select public.set_reaction(%L, '❤️')$$, :p1), 'REACT-4 Jo can''t react to a post she can''t see', 'P0002');
select tests.ok_sql(format($$select not exists (select 1 from public.reaction_summary(array[%L]::uuid[]))$$, :p1),
                    'REACT-4 ...and the summary leaves it out (no counts leak)');

-- ---------- REACT-5 switching kinds doesn't notify twice ----------
:as_admin
delete from public.notification_outbox where post_id = :p1;
:as_ma
select tests.lives(format($$select public.set_reaction(%L, '❤️')$$, :p1), 'setup: Grandma switches Like to Love');
:as_admin
select tests.ok_sql(format($$select count(*) = 0 from public.notification_outbox where post_id = %L and kind = 'heart'$$, :p1),
                    'REACT-5 switching kinds queues no new notice (only the first reaction does)');

-- ---------- REACT-6 reactions off for viewers ----------
:as_admin
update public.spaces set viewers_can_comment = false where id = '22222222-0000-0000-0000-00000000000a';
:as_ma
select tests.throws_code(format($$select public.set_reaction(%L, '😂')$$, :p1),
                         'REACT-6 when the family turns replies off for viewers, Grandma can''t react either', '42501');
:as_admin
update public.spaces set viewers_can_comment = true where id = '22222222-0000-0000-0000-00000000000a';

-- ---------- HARD-12 (migration 0018): reactions change only through set_reaction / toggle_heart ----------
-- Before 0018 a member could write the table straight through PostgREST: any short word as the "emoji",
-- even with replies turned off, which reaction_summary then showed to everyone (a free-text side channel).
:as_ma
select tests.lives(format($$select public.set_reaction(%L, '👍')$$, :p1), 'setup: Grandma likes a1');
select tests.throws_any(format($$update public.reactions set emoji = 'ugly' where post_id = %L$$, :p1),
                        'HARD-12 a direct update to a made-up reaction is refused', array['42501']);
select tests.ok_sql(format($$select r.my_reaction = '👍' from public.reaction_summary(array[%L]::uuid[]) r$$, :p1),
                    'HARD-12 her Like is unchanged');
select tests.lives(format($$select public.set_reaction(%L, '👍')$$, :p1), 'setup: Grandma takes it back');
select tests.throws_any(format($$insert into public.reactions (post_id, user_id, emoji) values (%L, 'a0000000-0000-0000-0000-0000000000a1', 'ugly')$$, :p1),
                        'HARD-12 a direct insert of a made-up reaction is refused', array['42501']);
:as_admin
select tests.throws_any(format($$insert into public.reactions (post_id, user_id, emoji) values (%L, 'a0000000-0000-0000-0000-00000000000a', 'ugly')$$,
                        '55555555-0000-0000-0000-0000000000a2'),
                        'HARD-12 even the database refuses a reaction that isn''t ❤️ 😂 or 👍', array['23514']);

-- ---------- report ----------
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo REACTIONS RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
