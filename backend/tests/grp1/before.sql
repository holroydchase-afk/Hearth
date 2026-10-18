-- GRP-1 step 1 (run on migrations 0001-0012 + seed, BEFORE 0013): snapshot who sees what and who reads what.
-- tests/run.sh then applies 0013 and later and runs grp1/after.sql to diff (SPEC-GROUPS v2, GRP-1 and GRP-2).
-- Adds a family in today's (0011) shape so every reply rule 0013 replaces is exercised: households with people,
-- a side linked over households, an event linked over households, a "new photos only" relative, a person placed
-- after replies were written (readers fixed at write time), and replies on posts to each kind.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create schema grp1;

-- ---------- a family in the 0011 shape ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1000000-0000-0000-0000-000000000001', 'dad@grp1.test',  '{"display_name":"Dad"}'),
  ('d1000000-0000-0000-0000-000000000002', 'mom@grp1.test',  '{"display_name":"Mom"}'),
  ('d1000000-0000-0000-0000-000000000011', 'nana@grp1.test', '{"display_name":"Nana"}'),
  ('d1000000-0000-0000-0000-000000000012', 'papa@grp1.test', '{"display_name":"Papa"}'),
  ('d1000000-0000-0000-0000-000000000013', 'may@grp1.test',  '{"display_name":"Aunt May"}'),
  ('d1000000-0000-0000-0000-000000000014', 'lee@grp1.test',  '{"display_name":"Uncle Lee"}'),
  ('d1000000-0000-0000-0000-000000000015', 'kit@grp1.test',  '{"display_name":"Cousin Kit"}'),
  ('d1000000-0000-0000-0000-000000000016', 'bea@grp1.test',  '{"display_name":"Gran Bea"}');
insert into public.households (id, name, created_by) values ('11111111-0000-0000-0000-0000000000d0', 'GRP-1 home', 'd1000000-0000-0000-0000-000000000001');
insert into public.household_members (household_id, user_id, role) values ('11111111-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000001', 'admin');
insert into public.spaces (id, household_id, name, plan, created_by)
values ('22222222-0000-0000-0000-0000000000d0', '11111111-0000-0000-0000-0000000000d0', 'GRP-1 family', 'family', 'd1000000-0000-0000-0000-000000000001');
insert into public.circles (id, space_id, name, kind, created_by) values
  ('33333333-0000-0000-0000-0000000000d0', '22222222-0000-0000-0000-0000000000d0', 'Everyone',      'everyone',  'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d1', '22222222-0000-0000-0000-0000000000d0', 'Nana and Papa', 'household', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d2', '22222222-0000-0000-0000-0000000000d0', 'May and Lee',   'household', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d3', '22222222-0000-0000-0000-0000000000d0', 'Kit''s place',  'household', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d4', '22222222-0000-0000-0000-0000000000d0', 'Dad''s side',   'group',     'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d5', '22222222-0000-0000-0000-0000000000d0', 'Beach week',    'event',     'd1000000-0000-0000-0000-000000000001');
insert into public.space_members (space_id, user_id, role, invited_by, in_everyone, sees_from) values
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000001', 'owner',  null, false, null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000002', 'adult',  'd1000000-0000-0000-0000-000000000001', false, null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000011', 'viewer', 'd1000000-0000-0000-0000-000000000001', true,  null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000012', 'viewer', 'd1000000-0000-0000-0000-000000000001', true,  null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000013', 'viewer', 'd1000000-0000-0000-0000-000000000001', true,  null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000015', 'viewer', 'd1000000-0000-0000-0000-000000000001', false, null),
  ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000016', 'viewer', 'd1000000-0000-0000-0000-000000000001', true,  null);
insert into public.circle_people (circle_id, user_id, added_by) values
  ('33333333-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d2', 'd1000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d3', 'd1000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000001');
insert into public.circle_links (parent_id, child_id, added_by) values
  ('33333333-0000-0000-0000-0000000000d4', '33333333-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d4', '33333333-0000-0000-0000-0000000000d2', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d5', '33333333-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-0000000000d5', '33333333-0000-0000-0000-0000000000d3', 'd1000000-0000-0000-0000-000000000001');

create function grp1.post(p_id uuid, p_author uuid, p_targets uuid[]) returns void language plpgsql as $$
begin
  insert into public.posts (id, space_id, author_id, caption) values (p_id, '22222222-0000-0000-0000-0000000000d0', p_author, 'grp1');
  insert into public.post_audiences (post_id, circle_id) select p_id, unnest(p_targets);
  insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type, display_key, thumb_key,
                                  width, height, byte_size, thumb_byte_size, exif_stripped)
  values (p_id, '22222222-0000-0000-0000-0000000000d0', p_author, 0, 'photo', 'image/jpeg', 'k', 't', 10, 10, 100, 10, true);
  update public.media_items set upload_status = 'ready' where post_id = p_id;
  insert into public.media_keys (media_id, wrapped_dek) select id, '\x00' from public.media_items where post_id = p_id;
  update public.posts set status = 'published' where id = p_id;
end $$;

-- q0 before Uncle Lee joins with "Only new photos"
select grp1.post('d5000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', array['33333333-0000-0000-0000-0000000000d0']::uuid[]);
insert into public.space_members (space_id, user_id, role, invited_by, in_everyone, sees_from)
values ('22222222-0000-0000-0000-0000000000d0', 'd1000000-0000-0000-0000-000000000014', 'viewer', 'd1000000-0000-0000-0000-000000000001', true, now());
insert into public.circle_people (circle_id, user_id, sees_from, added_by)
values ('33333333-0000-0000-0000-0000000000d2', 'd1000000-0000-0000-0000-000000000014', now(), 'd1000000-0000-0000-0000-000000000001');

select grp1.post('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', array['33333333-0000-0000-0000-0000000000d1']::uuid[]);  -- household
select grp1.post('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', array['33333333-0000-0000-0000-0000000000d4']::uuid[]);  -- side
select grp1.post('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', array['33333333-0000-0000-0000-0000000000d5']::uuid[]);  -- event
select grp1.post('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', array['33333333-0000-0000-0000-0000000000d0']::uuid[]);  -- Everyone
select grp1.post('d5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', array['33333333-0000-0000-0000-0000000000d2']::uuid[]);  -- household 2
select grp1.post('d5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001',
                 array['33333333-0000-0000-0000-0000000000d5', '33333333-0000-0000-0000-0000000000d0']::uuid[]);                                         -- event + Everyone

-- replies, one statement each so each has its own time
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000011', 'n4');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000012', 'p4');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000013', 'm4');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000014', 'l4');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000016', 'b4');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000013', 'm0');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000011', 'n3');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000015', 'k3');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000015', 'k6');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000016', 'b6');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000011', 'n2');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000013', 'm2');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000012', 'p1');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000014', 'l5');
insert into public.reactions (post_id, user_id, emoji) values ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000012', '❤️');
insert into public.reactions (post_id, user_id, emoji) values ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000013', '❤️');
insert into public.reactions (post_id, user_id, emoji) values ('d5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000015', '❤️');
-- Cousin Kit moves in with May and Lee after those replies (old replies keep their readers)
insert into public.circle_people (circle_id, user_id, added_by)
values ('33333333-0000-0000-0000-0000000000d2', 'd1000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000001');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000015', 'k2');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000013', 'm5');
insert into public.comments (post_id, author_id, body) values ('d5000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000011', 'n6');
-- seed replies too (space A: grandparents group, co-parent, Everyone)
insert into public.comments (post_id, author_id, body) values ('55555555-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000b1', 'Go Sam!');
insert into public.comments (post_id, author_id, body) values ('55555555-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a1', 'So proud');
insert into public.reactions (post_id, user_id, emoji) values ('55555555-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000c1', '❤️');

-- ---------- the snapshot ----------
create table grp1.circles as select id, kind, created_at from public.circles;
create table grp1.members as select space_id, user_id from public.space_members;
create table grp1.posts (user_id uuid, post_id uuid, visible boolean);
create table grp1.replies (user_id uuid, kind text, reply_id text, readable boolean);
create table grp1.comment_ok (user_id uuid, comment_id uuid, ok boolean);
create table grp1.readers (user_id uuid, post_id uuid, readers text[]);
do $$
declare u record;
begin
  for u in select distinct user_id from public.space_members loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    insert into grp1.posts select u.user_id, p.id, public.can_view_post(p.id) from public.posts p;
    insert into grp1.replies select u.user_id, 'comment', c.id::text, public.can_see_reply(c.post_id, c.author_id) from public.comments c;
    insert into grp1.replies select u.user_id, 'heart', r.post_id || '/' || r.user_id, public.can_see_reply(r.post_id, r.user_id) from public.reactions r;
    insert into grp1.comment_ok select u.user_id, c.id, private.reply_ok(u.user_id, c.post_id, c.author_id, c.created_at) from public.comments c;
    insert into grp1.readers select u.user_id, p.id, public.reply_readers(p.id) from public.posts p;
  end loop;
end $$;
