-- get_feed benchmark on the generate.sql fixture.
-- 1) EXPLAIN (ANALYZE, BUFFERS) of the statement inside get_feed (via auto_explain,
--    since a plpgsql function only shows as "Function Scan" from the outside).
-- 2) 200 timed calls per scenario after 5 warm-up calls; p50/p95/p99/max in ms.
\set ON_ERROR_STOP 1
\pset footer off
set client_min_messages = notice;

-- p_fn: 'feed' (get_feed) or 'timeline' (get_timeline, 0010)
create or replace function perf.bench(p_label text, p_user uuid, p_space uuid, p_ts timestamptz, p_id uuid, p_n int default 200,
                                      p_fn text default 'feed')
returns table (scenario text, calls int, rows_per_page int, p50_ms numeric, p95_ms numeric, p99_ms numeric, max_ms numeric)
language plpgsql as $$
declare t0 timestamptz; d float8[] := '{}'; c int;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  for i in 1..5 loop
    if p_fn = 'timeline' then perform count(*) from public.get_timeline(p_space, p_ts, p_id, 20);
    else perform count(*) from public.get_feed(p_space, p_ts, p_id, 20); end if;
  end loop;
  for i in 1..p_n loop
    t0 := clock_timestamp();
    if p_fn = 'timeline' then select count(*) into c from public.get_timeline(p_space, p_ts, p_id, 20);
    else select count(*) into c from public.get_feed(p_space, p_ts, p_id, 20); end if;
    d := d || (extract(epoch from clock_timestamp() - t0) * 1000)::float8;
  end loop;
  return query
  select p_label, p_n, c,
         round(percentile_cont(0.50) within group (order by x)::numeric, 2),
         round(percentile_cont(0.95) within group (order by x)::numeric, 2),
         round(percentile_cont(0.99) within group (order by x)::numeric, 2),
         round(max(x)::numeric, 2)
  from unnest(d) x;
end $$;
grant usage on schema perf to authenticated;
grant execute on all functions in schema perf to authenticated;

-- Cursors for the deep pages (computed as superuser straight from the tables).
select feed_at as v_deep_ts, post_id as v_deep_id from (
  select distinct pa.post_id, pa.feed_at from public.post_audiences pa
  where pa.circle_id in (perf.id('cE', 1), perf.id('cG', 1)) and pa.feed_at is not null) x
order by feed_at desc, post_id desc offset 15000 limit 1 \gset
select published_at as a_deep_ts, id as a_deep_id from public.posts
where space_id = perf.id('s', 1) and author_id = perf.id('u', 1) and status = 'published' and deleted_at is null
order by published_at desc, id desc offset 19000 limit 1 \gset
select feed_at as k_deep_ts, post_id as k_deep_id from public.post_audiences
where circle_id = perf.id('cK', 1) and feed_at is not null
order by feed_at desc, post_id desc offset 1800 limit 1 \gset
-- timeline cursors (sort_at = coalesce(taken_at, published_at))
select timeline_at as tv_deep_ts, post_id as tv_deep_id from (
  select distinct pa.post_id, pa.timeline_at from public.post_audiences pa
  where pa.circle_id in (perf.id('cE', 1), perf.id('cG', 1)) and pa.timeline_at is not null) x
order by timeline_at desc, post_id desc offset 15000 limit 1 \gset
select coalesce(taken_at, published_at) as ta_deep_ts, id as ta_deep_id from public.posts
where space_id = perf.id('s', 1) and author_id = perf.id('u', 1) and status = 'published' and deleted_at is null
order by coalesce(taken_at, published_at) desc, id desc offset 19000 limit 1 \gset

\echo
\echo ==== Fixture size
select (select count(*) from public.spaces) as spaces, (select count(*) from public.posts) as posts,
       (select count(*) from public.post_audiences) as audiences, (select count(*) from public.media_items) as media,
       (select count(*) from public.circle_members) as circle_members,
       (select count(*) from public.posts where space_id = perf.id('s', 1)) as hot_space_posts,
       (select count(distinct pa.post_id) from public.post_audiences pa
         where pa.circle_id in (perf.id('cE', 1), perf.id('cG', 1)) and pa.feed_at is not null) as viewer_visible,
       pg_size_pretty(pg_database_size(current_database())) as db_size;

\echo
\echo ==== EXPLAIN (ANALYZE, BUFFERS) of get_feed internals
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_timing = on;
set auto_explain.log_nested_statements = on;
set auto_explain.log_level = notice;
set role authenticated;

\echo ---- viewer (grandparent in Everyone + Grandparents), first page
select set_config('request.jwt.claim.sub', perf.id('u', 200021)::text, false) \g /dev/null
select count(*) from public.get_feed(perf.id('s', 1));
\echo ---- viewer, deep page (cursor at visible post #15,000)
select count(*) from public.get_feed(perf.id('s', 1), :'v_deep_ts', :'v_deep_id', 20);
\echo ---- author, first page
select set_config('request.jwt.claim.sub', perf.id('u', 1)::text, false) \g /dev/null
select count(*) from public.get_feed(perf.id('s', 1));
\echo ---- author, deep page (cursor at own post #19,000)
select count(*) from public.get_feed(perf.id('s', 1), :'a_deep_ts', :'a_deep_id', 20);
\echo ---- timeline (0010): viewer, first page
select set_config('request.jwt.claim.sub', perf.id('u', 200021)::text, false) \g /dev/null
select count(*) from public.get_timeline(perf.id('s', 1));

reset role;
set auto_explain.log_min_duration = -1;
set role authenticated;

\echo
\echo ==== Latency: 200 calls each (after 5 warm-up calls), limit 20
select * from perf.bench('viewer   first page', perf.id('u', 200021), perf.id('s', 1), null, null)
union all
select * from perf.bench('viewer   deep page ', perf.id('u', 200021), perf.id('s', 1), :'v_deep_ts', :'v_deep_id')
union all
select * from perf.bench('author   first page', perf.id('u', 1), perf.id('s', 1), null, null)
union all
select * from perf.bench('author   deep page ', perf.id('u', 1), perf.id('s', 1), :'a_deep_ts', :'a_deep_id')
union all
select * from perf.bench('co-parent first page (sees 10%)', perf.id('u', 200031), perf.id('s', 1), null, null)
union all
select * from perf.bench('co-parent deep page (#1,800)', perf.id('u', 200031), perf.id('s', 1), :'k_deep_ts', :'k_deep_id')
union all
select * from perf.bench('small space viewer first page', perf.id('u', 50000 + 3 * (777 - 1) + 1), perf.id('s', 777), null, null);

\echo
\echo ==== get_timeline (0010) latency: 200 calls each, limit 20. Target p95 < 5 ms
select * from perf.bench('timeline viewer   first page', perf.id('u', 200021), perf.id('s', 1), null, null, 200, 'timeline')
union all
select * from perf.bench('timeline viewer   deep page ', perf.id('u', 200021), perf.id('s', 1), :'tv_deep_ts', :'tv_deep_id', 200, 'timeline')
union all
select * from perf.bench('timeline author   first page', perf.id('u', 1), perf.id('s', 1), null, null, 200, 'timeline')
union all
select * from perf.bench('timeline author   deep page ', perf.id('u', 1), perf.id('s', 1), :'ta_deep_ts', :'ta_deep_id', 200, 'timeline')
union all
select * from perf.bench('timeline co-parent first page', perf.id('u', 200031), perf.id('s', 1), null, null, 200, 'timeline');
reset role;
