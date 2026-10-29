-- CAP-1..3, CAP-5, CAP-10, CAP-11 (docs/product/SPEC-CAPTIONS.md, DEC-39): an optional title of up to 80 characters
-- for the whole set, migration 0019. CAP-6..8 and HARD-18: the sender changes the words after posting, migration 0021. Written FIRST: red until 0019 lands. Seed: Alex owns space A; Grandma Rivera
-- (ma) is a viewer on Dad's side (a1); Grandma Chen (chen) follows space A's Everyone only, so she can't see Dad's-side posts.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_alex  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_ma    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_chen  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-0000000000b1'', false);'
\set space_a  '''22222222-0000-0000-0000-00000000000a'''
\set dad_side '''33333333-0000-0000-0000-0000000000a1'''

-- ---------- CAP-1/2 create_post takes an optional title; 80 characters at most ----------
:as_alex
select tests.setv('titled', format($$select public.create_post(gen_random_uuid(), %L, 'Cake, candles, a nap', array[%L]::uuid[],
                                      p_title => 'Lily''s 5th birthday')$$, :space_a, :dad_side));
select tests.ok(tests.v('titled') is not null, 'CAP-1 create_post takes a title');
select tests.setv('plain', format($$select public.create_post(gen_random_uuid(), %L, 'No title here', array[%L]::uuid[])$$, :space_a, :dad_side));
select tests.ok(tests.v('plain') is not null, 'CAP-1 old app builds: create_post without a title still works');
select tests.setv('blank', format($$select public.create_post(gen_random_uuid(), %L, null, array[%L]::uuid[], p_title => '   ')$$, :space_a, :dad_side));
select tests.throws_code(format($$select public.create_post(gen_random_uuid(), %L, null, array[%L]::uuid[], p_title => %L)$$,
                                :space_a, :dad_side, repeat('x', 81)),
                         'CAP-2 a title over 80 characters is refused', '23514');
select tests.lives(format($$select public.create_post(gen_random_uuid(), %L, null, array[%L]::uuid[], p_title => %L)$$,
                          :space_a, :dad_side, repeat('é', 80)),
                   'CAP-2 exactly 80 characters (not bytes) is fine');

:as_admin
update public.posts set status = 'published', published_at = now() where id in (tests.v('titled')::uuid, tests.v('plain')::uuid, tests.v('blank')::uuid);
select tests.ok((select title is null from public.posts where id = tests.v('blank')::uuid), 'CAP-5 a blank title is stored as no title');

-- ---------- CAP-3/5/11 the feed and the timeline carry the title ----------
:as_ma
select tests.ok_sql(format($$select title = 'Lily''s 5th birthday' from public.get_feed(%L) where post_id = %L$$, :space_a, tests.v('titled')),
                    'CAP-3 the feed row carries the title');
select tests.ok_sql(format($$select title is null from public.get_feed(%L) where post_id = %L$$, :space_a, tests.v('plain')),
                    'CAP-5 no title: the feed row says null, nothing to show');
select tests.ok_sql(format($$select title = 'Lily''s 5th birthday' from public.get_timeline(%L) where post_id = %L$$, :space_a, tests.v('titled')),
                    'CAP-11 the timeline row carries the title');

-- ---------- CAP-R4 same audience as the photos ----------
:as_chen
select tests.ok_sql(format($$select count(*) = 0 from public.get_feed(%L) where post_id = %L or title is not null$$, :space_a, tests.v('titled')),
                    'CAP-R4 someone who can''t see the post never gets its title');

-- ---------- CAP-10 no words in the notice outbox (it holds ids only) ----------
:as_admin
select tests.ok((select count(*) = 0 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notification_outbox' and column_name in ('title', 'caption', 'body')),
                'CAP-10 the notice outbox has no column that could carry a title');

-- ---------- CAP-6 the sender changes the words; the card says "Edited" ----------
:as_ma
select tests.try(format($$select public.add_comment(gen_random_uuid(), %L, 'Lovely')$$, tests.v('titled')));
select tests.try(format($$select public.set_reaction(%L, '❤️')$$, tests.v('titled')));
:as_admin
select tests.setv('outbox_before', 'select count(*) from public.notification_outbox');
select tests.setv('comments_before', format('select count(*) from public.comments where post_id = %L', tests.v('titled')));
select tests.setv('reactions_before', format('select count(*) from public.reactions where post_id = %L', tests.v('titled')));
:as_alex
select tests.ok_sql(format($$select words_edited_at is null from public.get_feed(%L) where post_id = %L$$, :space_a, tests.v('titled')),
                    'CAP-6 a post nobody changed has no "Edited" time');
select tests.lives(format($$select public.edit_post_words(%L, '  Lily turns 5  ', 'Cake, candles, then a long nap')$$, tests.v('titled')),
                   'CAP-6 the sender can change the title and the caption');
:as_ma
select tests.ok_sql(format($$select title = 'Lily turns 5' and caption = 'Cake, candles, then a long nap' and words_edited_at is not null
                             from public.get_feed(%L) where post_id = %L$$, :space_a, tests.v('titled')),
                    'CAP-6 everyone who sees the post gets the new words and the "Edited" time');
select tests.ok_sql(format($$select words_edited_at is not null from public.get_timeline(%L) where post_id = %L$$, :space_a, tests.v('titled')),
                    'CAP-6 By date carries the "Edited" time too');
:as_alex
select tests.lives(format($$select public.edit_post_words(%L, '   ', null)$$, tests.v('titled')),
                   'CAP-6 clearing both boxes is allowed');
:as_admin
select tests.ok((select title is null and caption is null from public.posts where id = tests.v('titled')::uuid),
                'CAP-5 a cleared title and caption are stored as none');
:as_alex
select tests.throws_code(format($$select public.edit_post_words(%L, %L, null)$$, tests.v('titled'), repeat('x', 81)),
                         'CAP-2 a changed title over 80 characters is refused', '23514');
select tests.throws_code(format($$select public.edit_post_words(%L, null, %L)$$, tests.v('titled'), repeat('x', 2001)),
                         'CAP-6 a changed caption over 2000 characters is refused', '23514');

-- ---------- CAP-8 no notice; comments and reactions stay ----------
:as_admin
select tests.ok((select count(*) from public.notification_outbox) = tests.v('outbox_before')::bigint,
                'CAP-8 changing the words sends no notice');
select tests.ok((select count(*) from public.comments where post_id = tests.v('titled')::uuid) = tests.v('comments_before')::bigint
                and tests.v('comments_before')::bigint > 0,
                'CAP-8 comments on the card stay as they were');
select tests.ok((select count(*) from public.reactions where post_id = tests.v('titled')::uuid) = tests.v('reactions_before')::bigint
                and tests.v('reactions_before')::bigint > 0,
                'CAP-8 reactions on the card stay as they were');

-- ---------- CAP-7 only the sender, and only while they can still send there ----------
:as_ma
select tests.throws_code(format($$select public.edit_post_words(%L, 'Mine now', null)$$, tests.v('plain')),
                         'CAP-7 someone who sees the post but didn''t send it is refused', '42501');
:as_chen
select tests.throws_code(format($$select public.edit_post_words(%L, 'Mine now', null)$$, tests.v('plain')),
                         'CAP-7 someone who can''t see the post gets "not found"', 'P0002');
select tests.throws_code($$select public.edit_post_words('99999999-0000-0000-0000-000000000000', 'x', null)$$,
                         'CAP-7 a post that doesn''t exist is "not found"', 'P0002');
:as_admin
update public.posts set deleted_at = now() where id = tests.v('blank')::uuid;
:as_alex
select tests.throws_code(format($$select public.edit_post_words(%L, 'Back again', null)$$, tests.v('blank')),
                         'CAP-7 a deleted post is "not found", even for its sender', 'P0002');

-- A viewer who may post (viewers_can_post) sends to Dad's side, then is taken out of that group: refused.
:as_admin
update public.spaces set viewers_can_post = true where id = :space_a;
:as_ma
select tests.setv('ma_post', format($$select public.create_post(gen_random_uuid(), %L, 'From Grandma', array[%L]::uuid[])$$, :space_a, :dad_side));
:as_admin
update public.posts set status = 'published', published_at = now() where id = tests.v('ma_post')::uuid;
:as_ma
select tests.lives(format($$select public.edit_post_words(%L, 'Grandma''s garden', null)$$, tests.v('ma_post')),
                   'CAP-6 a relative who may post can change their own words');
:as_admin
delete from public.circle_members where circle_id = :dad_side and user_id = 'a0000000-0000-0000-0000-0000000000a1';
:as_ma
select tests.throws_code(format($$select public.edit_post_words(%L, 'Still mine?', null)$$, tests.v('ma_post')),
                         'CAP-7 a sender taken out of every group the post went to is refused', '42501');
:as_admin
delete from public.space_members where space_id = :space_a and user_id = 'a0000000-0000-0000-0000-0000000000a1';
:as_ma
select tests.throws_code(format($$select public.edit_post_words(%L, 'Still mine?', null)$$, tests.v('ma_post')),
                         'CAP-7 / S12 a sender removed from the family gets "not found"', 'P0002');
:as_admin
select tests.ok((select title = 'Grandma''s garden' from public.posts where id = tests.v('ma_post')::uuid),
                'CAP-7 refused changes leave the words as they were');

-- ---------- HARD-18 the words change only through edit_post_words ----------
:as_alex
select tests.throws_code(format($$update public.posts set caption = 'quiet change' where id = %L$$, tests.v('plain')),
                         'HARD-18 a sender can''t change the caption straight in the table (no "Edited" mark)', '42501');
select tests.throws_code(format($$update public.posts set taken_at = now() where id = %L$$, tests.v('plain')),
                         'HARD-18 nor the date the photos were taken', '42501');
select tests.throws_code(format($$update public.posts set title = 'quiet' where id = %L$$, tests.v('plain')),
                         'HARD-18 nor the title', '42501');

-- ---------- report ----------
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo CAPTIONS RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
