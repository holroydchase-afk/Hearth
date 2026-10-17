-- BETA-AUD-16 step 2 (after 0011 and later are applied on top of aud16/before.sql's snapshot).
-- 0011 must be access-neutral: for every user, can_view_post, get_feed and get_timeline answer exactly
-- as before (0 changes), Everyone keeps exactly today's members (the co-parent is NOT added: privacy
-- review item 12), and no reply becomes readable that wasn't. The only allowed narrowing is replies
-- that were readable only through the dropped 0009 switch (BETA-REPLY-12); they are listed for Chase.
\set ON_ERROR_STOP 1
\pset footer off
\ir ../harness.sql

-- 0011 ran (otherwise every diff below is trivially empty)
select tests.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'circles' and column_name = 'kind'),
                'BETA-AUD-16: migration 0011 was applied (circles.kind exists), so the diffs below compare before/after 0011');
select tests.ok_sql($$select bool_and(n = 1) and count(*) = (select count(*) from public.spaces)
                      from (select s.id, (select count(*) from public.circles c where c.space_id = s.id and c.kind = 'everyone' and c.deleted_at is null) n
                            from public.spaces s) x$$,
                    'BETA-AUD-16: exactly one Everyone per space');
select tests.ok_sql($$select bool_and(kind = 'everyone') from public.circles where name = 'Everyone'$$,
                    'BETA-AUD-16: today''s "Everyone" groups became kind everyone');
select tests.ok_sql($$select bool_and(kind = 'group') and count(*) = 4 from public.circles where name <> 'Everyone'$$,
                    'BETA-AUD-16: every other existing group became kind group (4 in seed)');

-- Everyone keeps exactly today's members (the co-parent case)
select tests.ok((select count(*) from (select circle_id, user_id from snap.everyone
                                         except select cm.circle_id, cm.user_id from public.circle_members cm
                                                join public.circles c on c.id = cm.circle_id where c.name = 'Everyone') a) = 0
                and (select count(*) from (select cm.circle_id, cm.user_id from public.circle_members cm
                                             join public.circles c on c.id = cm.circle_id where c.name = 'Everyone'
                                           except select circle_id, user_id from snap.everyone) b) = 0,
                'BETA-AUD-16 / privacy item 12: each Everyone has exactly the members it had before (none added, none lost)');
select tests.ok(not exists (select 1 from public.circle_members where circle_id = '33333333-0000-0000-0000-0000000000a0'
                            and user_id = 'b0000000-0000-0000-0000-00000000000b'),
                'BETA-AUD-16 / privacy item 12: Blair (co-parent, a member of Sam at Dad''s) is still NOT in its Everyone');

create table tests.post_diff (user_id uuid, post_id uuid, before boolean, after boolean);
do $$
declare u record;
begin
  for u in select distinct user_id from snap.members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into tests.post_diff select s.user_id, s.post_id, s.visible, public.can_view_post(s.post_id)
    from snap.posts s where s.user_id = u.user_id and s.visible is distinct from public.can_view_post(s.post_id);
  end loop;
end $$;
select tests.ok((select count(*) from tests.post_diff) = 0,
                format('BETA-AUD-16: can_view_post unchanged for every (member, post): %s changes', (select count(*) from tests.post_diff)));

create table tests.list_diff (what text, user_id uuid, space_id uuid);
do $$
declare u record; a uuid[]; b uuid[];
begin
  for u in select user_id, space_id from snap.members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    select coalesce(array_agg(post_id order by n), '{}') into a from snap.feed where user_id = u.user_id and space_id = u.space_id;
    select coalesce(array_agg(post_id), '{}') into b from public.get_feed(u.space_id, null, null, 50);
    if a <> b then insert into tests.list_diff values ('feed', u.user_id, u.space_id); end if;
    select coalesce(array_agg(post_id order by n), '{}') into a from snap.timeline where user_id = u.user_id and space_id = u.space_id;
    select coalesce(array_agg(post_id), '{}') into b from public.get_timeline(u.space_id, null, null, 50);
    if a <> b then insert into tests.list_diff values ('timeline', u.user_id, u.space_id); end if;
  end loop;
end $$;
select tests.ok((select count(*) from tests.list_diff where what = 'feed') = 0,
                format('BETA-AUD-16: get_feed unchanged (same posts, same order) for every member of every space: %s changes',
                       (select count(*) from tests.list_diff where what = 'feed')));
select tests.ok((select count(*) from tests.list_diff where what = 'timeline') = 0,
                format('BETA-AUD-16: get_timeline unchanged for every member of every space: %s changes',
                       (select count(*) from tests.list_diff where what = 'timeline')));

create table tests.reply_after (user_id uuid, kind text, reply_id text, readable boolean);
do $$
declare u record;
begin
  for u in select distinct user_id from snap.members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into tests.reply_after select u.user_id, 'comment', c.id::text, public.can_see_reply(c.post_id, c.author_id) from public.comments c;
    insert into tests.reply_after select u.user_id, 'heart', r.post_id || '/' || r.user_id, public.can_see_reply(r.post_id, r.user_id) from public.reactions r;
  end loop;
end $$;
select tests.ok((select count(*) from tests.reply_after) = (select count(*) from snap.replies)
                and (select count(*) from tests.reply_after a join snap.replies b using (user_id, kind, reply_id)
                     where a.readable and not b.readable) = 0,
                format('BETA-AUD-16 / privacy item 12: no reply widens (readable now but not before): %s',
                       (select count(*) from tests.reply_after a join snap.replies b using (user_id, kind, reply_id) where a.readable and not b.readable)));
select tests.ok((select count(*) from tests.reply_after a join snap.replies b using (user_id, kind, reply_id)
                 where b.readable_without_switch and not a.readable) = 0,
                'BETA-AUD-16: the only narrowing is replies that were readable through the dropped 0009 switch (nothing else is lost)');

reset role;
\o
\echo
\echo 'Narrowing for Chase (readable before 0011 only through "members see each other''s replies"):'
select pr.display_name as reader, a.kind, a.reply_id
from tests.reply_after a join snap.replies b using (user_id, kind, reply_id) join public.profiles pr on pr.id = a.user_id
where b.readable and not a.readable order by 1, 2, 3;
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo AUD-16 RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
