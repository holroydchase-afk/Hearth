-- Scale fixture: ~50k spaces, ~1M posts, realistic circles/audiences/media.
-- Space #1 ("Big family") is the hot space: 20,000 posts, 33 members.
-- Every other space: owner + 3 viewers (2 grandparents, 1 co-parent), ~20 posts.
-- Triggers (including FK checks) are off while loading; the derived columns they
-- would maintain (feed_at, counters, object keys) are filled in set-wise below.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
set session_replication_role = replica;
set synchronous_commit = off;
set maintenance_work_mem = '512MB';
set work_mem = '64MB';

create schema perf;
-- deterministic ids: perf.id('u', 7) = md5('u7')::uuid
create function perf.id(p text, n bigint) returns uuid language sql immutable as $$ select md5(p || n)::uuid $$;

-- users 1..50000 own space n; 50000+3(n-1)+k are space n's viewers (k=1,2 grandparents, k=3 co-parent);
-- 200001..200030 are extra relatives in space 1; 200031 is space 1's co-parent.
insert into auth.users (id, email)
select perf.id('u', g), 'u' || g || '@perf.test' from generate_series(1, 200031) g;
insert into public.profiles (id, display_name)
select perf.id('u', g), 'User ' || g from generate_series(1, 200031) g;

insert into public.households (id, name, created_by)
select perf.id('h', s), 'Home ' || s, perf.id('u', s) from generate_series(1, 50000) s;
insert into public.household_members (household_id, user_id, role)
select perf.id('h', s), perf.id('u', s), 'admin'::public.household_role from generate_series(1, 50000) s;
insert into public.spaces (id, household_id, name, created_by)
select perf.id('s', s), perf.id('h', s), case s when 1 then 'Big family' else 'Space ' || s end, perf.id('u', s)
from generate_series(1, 50000) s;

insert into public.space_members (space_id, user_id, role, invited_by)
select perf.id('s', s), perf.id('u', s), 'owner'::public.member_role, null from generate_series(1, 50000) s
union all
select perf.id('s', s), perf.id('u', 50000 + 3 * (s - 1) + k), 'viewer'::public.member_role, perf.id('u', s)
from generate_series(1, 50000) s, generate_series(1, 3) k
union all
select perf.id('s', 1), perf.id('u', g), 'viewer', perf.id('u', 1) from generate_series(200001, 200031) g;

-- circles: E(veryone), G(randparents), K (co-parent)
insert into public.circles (id, space_id, name, created_by)
select perf.id('c' || c, s), perf.id('s', s),
       case c when 'E' then 'Everyone' when 'G' then 'Grandparents' else 'Co-parent' end, perf.id('u', s)
from generate_series(1, 50000) s, unnest(array['E', 'G', 'K']) c;

insert into public.circle_members (circle_id, user_id)
select perf.id('cE', s), perf.id('u', s) from generate_series(1, 50000) s                             -- owner in Everyone
union all
select perf.id('c' || c, s), perf.id('u', 50000 + 3 * (s - 1) + k)                                     -- grandparents in E + G
from generate_series(1, 50000) s, generate_series(1, 2) k, unnest(array['E', 'G']) c
union all
select perf.id('cK', s), perf.id('u', 50000 + 3 * (s - 1) + 3) from generate_series(1, 50000) s       -- co-parent only in K
union all
select perf.id('cE', 1), perf.id('u', g) from generate_series(200001, 200030) g                         -- extra relatives in E
union all
select perf.id('cG', 1), perf.id('u', g) from generate_series(200021, 200030) g                         -- ...10 of them also in G
union all
select perf.id('cK', 1), perf.id('u', 200031);

-- posts: n = 1..20000 in space 1; n = 20001..1000000 spread over spaces 2..50000.
-- ~1% deleted, ~0.5% drafts. Space 1 posts are ~1.3 h apart (about 3 years).
insert into public.posts (id, space_id, author_id, caption, status, published_at, created_at, deleted_at, media_count, taken_at)
select perf.id('p', n),
       perf.id('s', sp),
       perf.id('u', sp),
       'Post ' || n,
       case when n % 200 = 7 then 'draft' else 'published' end::public.post_status,
       case when n % 200 = 7 then null else ts end,
       ts,
       case when n % 100 = 3 then ts + interval '1 day' end,
       1 + (n % 4 = 0)::int,
       -- 0010: 70% carry a capture date, up to ~4 years before sharing (bulk imports of old photos)
       case when n % 10 < 7 then ts - make_interval(secs => (n::bigint * 104729) % 126144000) end
from (select n,
             case when n <= 20000 then 1 else 2 + (n % 49999) end as sp,
             case when n <= 20000 then now() - make_interval(secs => n * 4733)
                  else now() - make_interval(secs => (n::bigint * 7919) % 94608000) end as ts
      from generate_series(1, 1000000) n) x;

-- audiences: 60% Everyone, 30% Grandparents, 10% Co-parent; every 7th post also to Grandparents.
insert into public.post_audiences (post_id, circle_id, feed_at, timeline_at)
select p.id, perf.id(c, x.sp),
       case when p.status = 'published' and p.deleted_at is null then p.published_at end,
       case when p.status = 'published' and p.deleted_at is null then coalesce(p.taken_at, p.published_at) end
from (select n, case when n <= 20000 then 1 else 2 + (n % 49999) end as sp,
             case when n % 10 < 6 then 'cE' when n % 10 < 9 then 'cG' else 'cK' end as c1
      from generate_series(1, 1000000) n) x
join public.posts p on p.id = perf.id('p', x.n)
cross join lateral (select x.c1 as c union select 'cG' where x.n % 7 = 0) cc;

-- media: 1 or 2 items per post (1.25 avg), keys derived like the trigger does
insert into public.media_items (id, post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                width, height, duration_ms, byte_size, thumb_byte_size, exif_stripped, upload_status)
select perf.id('m' || k, n), perf.id('p', n), perf.id('s', sp), perf.id('u', sp), k,
       case when n % 9 = 0 and k = 0 then 'video' else 'photo' end::public.media_kind,
       case when n % 9 = 0 and k = 0 then 'video/mp4' else 'image/jpeg' end,
       format('s/%s/p/%s/m/%s/display', perf.id('s', sp), perf.id('p', n), perf.id('m' || k, n)),
       format('s/%s/p/%s/m/%s/thumb',   perf.id('s', sp), perf.id('p', n), perf.id('m' || k, n)),
       2048, 1536, case when n % 9 = 0 and k = 0 then 30000 end, 400000, 40000, true, 'ready'
from (select n, case when n <= 20000 then 1 else 2 + (n % 49999) end as sp from generate_series(1, 1000000) n) x,
     generate_series(0, 1) k
where k = 0 or n % 4 = 0;

-- interactions in the hot space: hearts from 2 relatives on 30% of posts, a comment on 10%, seen receipts
insert into public.reactions (post_id, user_id, emoji)
select perf.id('p', n), perf.id('u', u), '❤️'
from generate_series(1, 20000) n, (values (200021), (200022)) v(u)
where n % 10 < 3;   -- Everyone posts (both relatives can see them)
insert into public.comments (post_id, author_id, body, created_at)
select perf.id('p', n), perf.id('u', 200021), 'Lovely!', now() - make_interval(secs => n * 4733) + interval '1 hour'
from generate_series(1, 20000) n where n % 10 = 1;
insert into public.post_views (post_id, user_id)
select perf.id('p', n), perf.id('u', u)
from generate_series(1, 20000) n, generate_series(200001, 200020) u
where n % 10 < 6 and (n + u) % 3 = 0;

update public.posts p set reaction_count = r.c
  from (select post_id, count(*) c from public.reactions group by post_id) r where r.post_id = p.id;
update public.posts p set comment_count = r.c
  from (select post_id, count(*) c from public.comments group by post_id) r where r.post_id = p.id;

reset session_replication_role;
vacuum analyze;
