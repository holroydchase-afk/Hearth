-- Capture dates after the share date (grandparent-ux finding, Oct 17). A phone with a wrong clock, or an
-- edited EXIF date, can say a photo was "taken" in 2027. The server must not let it float to the top of
-- the timeline or invent a future year: taken_at after published_at counts as published_at for
-- timeline order (sort_at) and for "Pick a year". (The phone side, BETA-BULK-1, ignores capture dates
-- more than 1 day in the future: app/src/media/__tests__/captureDate.test.ts.)
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set space_a '''22222222-0000-0000-0000-00000000000a'''
\set c_a_all '''33333333-0000-0000-0000-0000000000a0'''
\set as_gma_riv 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'

create function tests.mk(p_key text, p_taken timestamptz, p_published timestamptz) returns void language plpgsql as $$
declare v_post uuid := gen_random_uuid();
begin
  insert into public.posts (id, space_id, author_id, caption, taken_at)
  values (v_post, '22222222-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'future ' || p_key, p_taken);
  insert into public.post_audiences (post_id, circle_id) values (v_post, '33333333-0000-0000-0000-0000000000a0');
  insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                  width, height, byte_size, thumb_byte_size, exif_stripped)
  values (v_post, '22222222-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 0, 'photo', 'image/jpeg', 'k', 't', 100, 100, 1000, 100, true);
  update public.media_items set upload_status = 'ready' where post_id = v_post;
  update public.posts set status = 'published' where id = v_post;
  update public.posts set published_at = p_published where id = v_post;
  insert into tests.vars values (p_key, v_post::text) on conflict (k) do update set v = excluded.v;
end $$;

-- Everyone posts in space A. Seed posts are pinned to Oct 2026.
update public.posts set published_at = '2026-10-10 12:00Z' where space_id = :space_a;
select tests.mk('f_future', '2027-03-01 12:00Z', '2026-10-15 12:00Z');   -- "taken" 4.5 months after it was shared
select tests.mk('f_today',  '2026-10-16 09:00Z', '2026-10-16 12:00Z');   -- normal: taken the same morning
select tests.mk('f_old',    '2024-07-04 15:00Z', '2026-10-17 08:00Z');   -- normal bulk import

:as_gma_riv
select tests.ok_sql(format($$select sort_at = published_at from public.get_timeline(%L, null, null, 50) where post_id = %L$$,
                           :space_a, tests.v('f_future')),
                    'BETA-TIME-2 future date: a post "taken" after it was shared sorts by its shared date (sort_at = published_at)');
select tests.ok_sql(format($$select array_position(arr, %L::uuid) > array_position(arr, %L::uuid)
                             from (select array_agg(post_id order by n) arr from (select post_id, row_number() over () n
                                   from public.get_timeline(%L, null, null, 50)) t) x$$,
                           tests.v('f_future'), tests.v('f_today'), :space_a),
                    'BETA-TIME-2 future date: it does not jump above a photo taken (and shared) after it was shared');
select tests.ok_sql(format($$select sort_at = '2026-10-16 09:00Z' from public.get_timeline(%L, null, null, 50) where post_id = %L$$,
                           :space_a, tests.v('f_today')),
                    'BETA-TIME-2 guard: a normal post still sorts by when it was taken');
select tests.ok_sql(format($$select not exists (select 1 from public.get_timeline_years(%L, 'UTC') where year = 2027)$$, :space_a),
                    'BETA-TIME-4 future date: "Pick a year" shows no 2027 (the post counts in the year it was shared)');
select tests.ok_sql(format($$select (select post_count from public.get_timeline_years(%L, 'UTC') where year = 2026) = 4$$, :space_a),
                    'BETA-TIME-4 future date: 2026 counts it, with the 3 other posts Grandma Rivera can see from 2026 (seed a1, a3, f_today)');
-- keyset paging still has no gaps or duplicates with the clamped sort key
create temp table pages (n serial, post_id uuid);
grant all on pages to authenticated;
grant usage on sequence pages_n_seq to authenticated;
do $$
declare v_at timestamptz; v_id uuid; r record; got int; guard int := 0;
begin
  loop
    got := 0;
    for r in execute 'select post_id, sort_at from public.get_timeline($1, $2, $3, 1)'
               using '22222222-0000-0000-0000-00000000000a'::uuid, v_at, v_id loop
      insert into pages (post_id) values (r.post_id);
      v_at := r.sort_at; v_id := r.post_id; got := got + 1;
    end loop;
    guard := guard + 1;
    exit when got < 1 or guard > 50;
  end loop;
end $$;
select tests.ok((select count(*) from pages) = (select count(distinct post_id) from pages)
                and (select count(*) from pages) = (select count(*) from public.get_timeline(:space_a, null, null, 50)),
                'BETA-TIME-2 future date: pages of 1 cover the timeline with no gaps or duplicates');

reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo TIMELINE-FUTURE RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
