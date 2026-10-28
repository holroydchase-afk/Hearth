-- CAP-1..3, CAP-5, CAP-10, CAP-11 (docs/product/SPEC-CAPTIONS.md, DEC-39): an optional title of up to 80 characters
-- for the whole set, migration 0019. Written FIRST: red until 0019 lands. Seed: Alex owns space A; Grandma Rivera
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
