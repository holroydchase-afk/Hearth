-- GRP-1 step 2 (after 0013 and later are applied on top of grp1/before.sql's snapshot), plus GRP-2 backfill.
-- 0013 must be access-neutral: for every member x post x reply, can_view_post, can_see_reply, reply_ok at the
-- reply's own time and reply_readers answer exactly as before. No widening, no narrowing.
-- Until 0013 exists, run.sh applies nothing here and every check below fails with "0013 not applied".
\set ON_ERROR_STOP 1
\pset footer off
\ir ../harness.sql

select tests.setv('applied', $$select exists (select 1 from information_schema.columns
                                              where table_schema = 'public' and table_name = 'circles' and column_name = 'comment_mode')::text$$);
create function tests.applied() returns boolean language sql stable as $$ select coalesce(tests.v('applied')::boolean, false) $$;
create function tests.tag() returns text language sql stable as $$
  select case when tests.applied() then '' else '  [0013 not applied: circles.comment_mode missing; app-engineer adds supabase/migrations/0013_*.sql and reruns tests/run.sh]' end $$;

select tests.ok(tests.applied(), 'GRP-1: migration 0013 was applied (circles.comment_mode exists), so the diffs below compare before/after 0013' || tests.tag());

create table tests.post_diff (user_id uuid, post_id uuid);
create table tests.reply_diff (user_id uuid, kind text, reply_id text);
create table tests.ok_diff (user_id uuid, comment_id uuid);
create table tests.readers_diff (user_id uuid, post_id uuid);
do $$
declare u record;
begin
  for u in select distinct user_id from grp1.members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into tests.post_diff select s.user_id, s.post_id from grp1.posts s
      where s.user_id = u.user_id and s.visible is distinct from public.can_view_post(s.post_id);
    insert into tests.reply_diff select s.user_id, s.kind, s.reply_id from grp1.replies s join public.comments c on c.id::text = s.reply_id
      where s.user_id = u.user_id and s.kind = 'comment' and s.readable is distinct from public.can_see_reply(c.post_id, c.author_id);
    insert into tests.reply_diff select s.user_id, s.kind, s.reply_id from grp1.replies s join public.reactions r on r.post_id || '/' || r.user_id = s.reply_id
      where s.user_id = u.user_id and s.kind = 'heart' and s.readable is distinct from public.can_see_reply(r.post_id, r.user_id);
    insert into tests.ok_diff select s.user_id, s.comment_id from grp1.comment_ok s join public.comments c on c.id = s.comment_id
      where s.user_id = u.user_id and s.ok is distinct from private.reply_ok(u.user_id, c.post_id, c.author_id, c.created_at);
    insert into tests.readers_diff select s.user_id, s.post_id from grp1.readers s
      where s.user_id = u.user_id and s.readers is distinct from public.reply_readers(s.post_id);
  end loop;
end $$;

select tests.ok(tests.applied() and (select count(*) from grp1.posts) > 0 and (select count(*) from tests.post_diff) = 0,
                format('GRP-1: can_view_post unchanged for every (member, post): %s changes', (select count(*) from tests.post_diff)) || tests.tag());
select tests.ok(tests.applied() and (select count(*) from grp1.replies) > 0 and (select count(*) from tests.reply_diff) = 0,
                format('GRP-1: can_see_reply unchanged for every (member, comment or heart): %s changes', (select count(*) from tests.reply_diff)) || tests.tag());
select tests.ok(tests.applied() and (select count(*) from grp1.comment_ok) > 0 and (select count(*) from tests.ok_diff) = 0,
                format('GRP-1: reply_ok at each comment''s own time unchanged for every (member, comment): %s changes', (select count(*) from tests.ok_diff)) || tests.tag());
select tests.ok(tests.applied() and (select count(*) from grp1.readers) > 0 and (select count(*) from tests.readers_diff) = 0,
                format('GRP-1: reply_readers unchanged for every (member, post): %s changes', (select count(*) from tests.readers_diff)) || tests.tag());
select tests.ok((select count(*) from grp1.comment_ok where ok) > (select count(*) from grp1.comment_ok where ok
                   and user_id in (select user_id from public.space_members where role in ('owner', 'adult'))),
                'GRP-1 setup: the snapshot includes replies relatives read through a household or event (not only parents)');

-- GRP-2: every circle that existed before 0013 got the setting for its kind, and one log row at its creation time
select tests.ok_sql($q$select count(*) = (select count(*) from grp1.circles)
                         and count(*) filter (where g.kind = 'household') > 0 and count(*) filter (where g.kind = 'event') > 0
                         and bool_and(c.comment_mode = case g.kind when 'household' then 'always' when 'event' then 'on_group_posts' else 'private' end)
                      from grp1.circles g join public.circles c on c.id = g.id$q$,
                    'GRP-2 backfill: household -> always, event -> on_group_posts, group and everyone -> private' || tests.tag());
select tests.ok_sql(format($q$select count(*) = (select count(*) from grp1.circles) and count(distinct l.circle_id) = count(*)
                         and bool_and(l.set_at = g.created_at)
                      from grp1.circles g join %s l on l.circle_id = g.id$q$,
                    coalesce((select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where c.relname = 'comment_mode_log' and n.nspname in ('public', 'private') limit 1), 'public.comment_mode_log')),
                    'GRP-2 comment_mode_log backfill: one row per circle, set_at = circles.created_at' || tests.tag());

reset role;
\o
\echo
\echo 'GRP-1 differences (should be none):'
select 'post' as what, pr.display_name as reader, d.post_id::text as item from tests.post_diff d join public.profiles pr on pr.id = d.user_id
union all select 'reply', pr.display_name, d.reply_id from tests.reply_diff d join public.profiles pr on pr.id = d.user_id
union all select 'reply_ok', pr.display_name, d.comment_id::text from tests.ok_diff d join public.profiles pr on pr.id = d.user_id
union all select 'readers', pr.display_name, d.post_id::text from tests.readers_diff d join public.profiles pr on pr.id = d.user_id
order by 1, 2, 3;
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo GRP-1 RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
