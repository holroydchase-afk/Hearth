-- BETA-AUD-16 step 1 (run on migrations 0001-0010 + seed, BEFORE 0011): snapshot who sees what.
-- tests/run.sh then applies 0011 and later, and runs aud16/after.sql to diff. privacy review item 12.
-- Extra replies so every reply rule is exercised, and the 0009 switch is ON for one group so the
-- one expected narrowing (the switch is dropped, BETA-REPLY-12) shows up and is listed for Chase.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create schema snap;

-- more replies on the seed posts (a1 grandparents, a2 co-parent, a3 Everyone; b1, b2 in space B)
insert into public.comments (post_id, author_id, body) values
  ('55555555-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000b1', 'Go Sam!'),            -- Grandma Chen, Everyone post
  ('55555555-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a1', 'So proud'),           -- Grandma Rivera
  ('55555555-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'Thanks all'),         -- Alex (parent)
  ('55555555-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000b', 'Got it'),             -- Blair, co-parent post
  ('55555555-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'Wobbly!'),            -- Grandma Rivera, grandparents post
  ('55555555-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', 'Yum');
insert into public.reactions (post_id, user_id, emoji) values
  ('55555555-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000c1', '❤️'),  -- Aunt Jo
  ('55555555-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a2', '❤️'),  -- Grandpa Rivera
  ('55555555-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2', '❤️');
update public.circles set replies_shared = true where id = '33333333-0000-0000-0000-0000000000a1';
-- a few dated posts so get_timeline order is non-trivial
update public.posts set taken_at = '2024-07-04 15:00Z' where id = '55555555-0000-0000-0000-0000000000a1';
update public.posts set taken_at = '2025-12-25 15:00Z' where id = '55555555-0000-0000-0000-0000000000a3';

create table snap.members as select space_id, user_id from public.space_members;
create table snap.everyone as
  select cm.circle_id, cm.user_id from public.circle_members cm join public.circles c on c.id = cm.circle_id where c.name = 'Everyone';
create table snap.posts (user_id uuid, post_id uuid, visible boolean);
create table snap.feed (user_id uuid, space_id uuid, n int, post_id uuid);
create table snap.timeline (user_id uuid, space_id uuid, n int, post_id uuid);
create table snap.replies (user_id uuid, kind text, reply_id text, readable boolean, readable_without_switch boolean);

do $$
declare u record; s record;
begin
  for u in select distinct user_id from public.space_members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into snap.posts select u.user_id, p.id, public.can_view_post(p.id) from public.posts p;
    for s in select space_id from public.space_members where user_id = u.user_id loop
      insert into snap.feed select u.user_id, s.space_id, row_number() over (), f.post_id from public.get_feed(s.space_id, null, null, 50) f;
      insert into snap.timeline select u.user_id, s.space_id, row_number() over (), t.post_id from public.get_timeline(s.space_id, null, null, 50) t;
    end loop;
    insert into snap.replies select u.user_id, 'comment', c.id::text, public.can_see_reply(c.post_id, c.author_id), null from public.comments c;
    insert into snap.replies select u.user_id, 'heart', r.post_id || '/' || r.user_id, public.can_see_reply(r.post_id, r.user_id), null from public.reactions r;
  end loop;
  -- the same, with the 0009 switch off everywhere: what 0011 must still allow
  update public.circles set replies_shared = false;
  for u in select distinct user_id from public.space_members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    update snap.replies x set readable_without_switch = public.can_see_reply(c.post_id, c.author_id)
      from public.comments c where x.user_id = u.user_id and x.kind = 'comment' and x.reply_id = c.id::text;
    update snap.replies x set readable_without_switch = public.can_see_reply(r.post_id, r.user_id)
      from public.reactions r where x.user_id = u.user_id and x.kind = 'heart' and x.reply_id = r.post_id || '/' || r.user_id;
  end loop;
  update public.circles set replies_shared = true where id = '33333333-0000-0000-0000-0000000000a1';
end $$;
