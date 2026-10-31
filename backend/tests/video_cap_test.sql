-- S14 (Test Log, Low): the free video cap counted per family space, so making a second space reset it.
-- Fixed in migration 0020: the cap counts each person's videos this month across every free space they post in.
-- Written FIRST: red until 0020 lands. Seed: Alex owns space A (free) and already has 1 video there this month;
-- Blair owns space B (family plan, no cap). Video posting is off by default (FLAG-1), so this suite turns it on.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_alex  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_blair 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''b0000000-0000-0000-0000-00000000000b'', false);'
\set space_a  '''22222222-0000-0000-0000-00000000000a'''
\set house_a  '''11111111-0000-0000-0000-00000000000a'''
\set dad_side '''33333333-0000-0000-0000-0000000000a1'''

-- One video item, as sign-media sends it.
create function tests.videos(p_post text, p_n integer) returns text language sql as $$
  select format($q$select * from public.prepare_media_upload(%L, %L::jsonb)$q$, p_post,
    (select jsonb_agg(jsonb_build_object('kind','video','mime_type','video/mp4','width',1280,'height',720,'duration_ms',5000,
                                         'byte_size',1000,'thumb_byte_size',10,'exif_stripped',true))
       from generate_series(1, p_n))::text)
$$;

:as_admin
insert into private.feature_flags (feature, enabled) values ('video_posting', true) on conflict (feature) do update set enabled = true;
insert into public.space_features (space_id, feature, enabled) values (:space_a, 'video_posting', true);

-- Alex makes a second free space in his own household (the S14 trick).
:as_alex
select tests.setv('space_x', format($$select public.create_space(%L, 'Extra space')$$, :house_a));
:as_admin
insert into public.space_features (space_id, feature, enabled) values (tests.v('space_x')::uuid, 'video_posting', true);
:as_alex
select tests.setv('post_a', format($$select public.create_post(gen_random_uuid(), %L, null, array[%L]::uuid[])$$, :space_a, :dad_side));
select tests.setv('post_x', format($$select public.create_post(gen_random_uuid(), %L, null,
                                     array[(select id from public.circles where space_id = %L and kind = 'everyone')]::uuid[])$$,
                                   tests.v('space_x'), tests.v('space_x')));
select tests.ok(tests.v('space_x') is not null and tests.v('post_x') is not null, 'S14 setup: Alex has a second free space and a post in it');

-- ---------- S14-1: the cap is per person, across spaces ----------
select tests.lives(tests.videos(tests.v('post_a'), 4), 'S14-1 Alex sends 4 more videos in space A (5 of 10 this month)');
select tests.lives(tests.videos(tests.v('post_x'), 5), 'S14-1 and 5 in his new space (10 of 10)');
select tests.throws_code(tests.videos(tests.v('post_x'), 1),
                         'S14-1 the 11th video is refused even in a brand-new space', 'P0001');
select tests.throws_code(tests.videos(tests.v('post_a'), 1),
                         'S14-1 and in the first space too', 'P0001');
select tests.ok_sql(format($$select (public.space_upload_quota(%L)->>'videos_this_month')::int = 10$$, tests.v('space_x')),
                    'S14-2 the new space''s quota shows Alex''s own 10 of 10, not a fresh 0');
select tests.ok_sql(format($$select (public.space_upload_quota(%L)->>'videos_this_month')::int = 10$$, :space_a),
                    'S14-2 and so does space A');

-- ---------- S14-3: a refused video leaves nothing behind ----------
select tests.ok_sql(format($$select count(*) = 5 from public.media_items where post_id = %L and kind = 'video'$$, tests.v('post_x')),
                    'S14-3 the refused video made no media row');

-- ---------- S14-4: one person's videos don't use up anyone else's ----------
:as_admin
select tests.ok_sql($$select count(*) = 1 from private.video_usage where month = date_trunc('month', now() at time zone 'utc')::date$$,
                    'S14-4 one usage row this month: Alex''s (Blair has sent none)');
select tests.ok_sql($$select videos = 10 from private.video_usage where user_id = 'a0000000-0000-0000-0000-00000000000a'$$,
                    'S14-4 Alex''s row says 10');

-- ---------- S14-5: a paid family's videos are not capped and not counted ----------
insert into public.space_features (space_id, feature, enabled) values ('22222222-0000-0000-0000-00000000000b', 'video_posting', true);
:as_blair
select tests.setv('post_b', $$select public.create_post(gen_random_uuid(), '22222222-0000-0000-0000-00000000000b', null,
                                array['33333333-0000-0000-0000-0000000000b1']::uuid[])$$);
select tests.lives(tests.videos(tests.v('post_b'), 12), 'S14-5 a paid family can send more than 10 videos');
:as_admin
select tests.ok_sql($$select not exists (select 1 from private.video_usage where user_id = 'b0000000-0000-0000-0000-00000000000b')$$,
                    'S14-5 and they don''t count toward the free cap');

-- ---------- S14-6: the usage table is private ----------
:as_alex
select tests.throws_code('select * from private.video_usage', 'S14-6 an app user can''t read or change the usage table', '42501');

-- ---------- S14-7: the hint names a person, not a space ----------
:as_admin
create function tests.cap_hint(p_sql text) returns text language plpgsql as $$
declare h text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return h;
end $$;
:as_alex
select tests.ok_sql(format($$select tests.cap_hint(%L) = 'Each person can send 10 videos a month on the free plan.'$$, tests.videos(tests.v('post_a'), 1)),
                    'S14-7 the refusal says the cap is per person');

-- ---------- report ----------
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo VIDEO CAP RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
