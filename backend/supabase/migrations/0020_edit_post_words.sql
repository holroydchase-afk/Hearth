-- 0020: the sender changes the words after posting (CAP-6..8; docs/product/SPEC-CAPTIONS.md, DEC-39 CAP-D2), and
-- HARD-18: the words change only through that one call.
-- edit_post_words(p_post, p_title, p_caption) changes the title and caption together and stamps words_edited_at, so
-- every card can say "Edited". Only the sender, only while the post is theirs to send: someone who can't see the post
-- (or a deleted one) gets P0002 "not found"; anyone else, or a sender who can no longer send to any of the post's
-- groups, gets 42501 (S12, BETA-REPLY-4). No notice trigger watches caption or title, so nobody is pinged (CAP-8),
-- and comments and reactions are untouched. Photos never change.
-- HARD-18: 0001 let authors UPDATE caption and taken_at straight in the table, which would skip the "Edited" mark and
-- the length rules. Nothing in the app uses it; it is revoked here.
-- get_feed and get_timeline gain words_edited_at as their last column; older app builds ignore it.

alter table public.posts add column words_edited_at timestamptz;

revoke update (caption, taken_at) on public.posts from authenticated;

create function public.edit_post_words(p_post uuid, p_title text, p_caption text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v public.posts; v_title text := nullif(btrim(p_title), ''); v_caption text := nullif(btrim(p_caption), '');
        v_at timestamptz := now();
begin
  select * into v from public.posts where id = p_post for update;
  if not found or v.deleted_at is not null or not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v.author_id is distinct from auth.uid() then
    raise exception 'only the sender can change the words' using errcode = '42501';
  end if;
  if not exists (select 1 from public.post_audiences pa where pa.post_id = p_post and public.can_send_to(pa.circle_id)) then
    raise exception 'you can no longer send to this post''s groups' using errcode = '42501';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'a title is 80 characters at most' using errcode = '23514';
  end if;
  if char_length(v_caption) > 2000 then
    raise exception 'a caption is 2000 characters at most' using errcode = '23514';
  end if;
  update public.posts set title = v_title, caption = v_caption, words_edited_at = v_at where id = p_post;
  return v_at;
end $$;

drop function public.get_feed(uuid, timestamptz, uuid, integer);
drop function public.get_timeline(uuid, timestamptz, uuid, integer);
create function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz,
               event_id uuid, event_name text, title text, words_edited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope, f.taken_at, f.event_id, f.event_name, p.title, p.words_edited_at
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'shared', p_before_ts, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  join public.posts p on p.id = f.post_id
  order by f.published_at desc, f.post_id desc;
end $$;

create function public.get_timeline(
  p_space uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text,
               taken_at timestamptz, sort_at timestamptz, event_id uuid, event_name text, title text, words_edited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope,
         f.taken_at, coalesce(f.taken_at, f.published_at), f.event_id, f.event_name, p.title, p.words_edited_at
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'taken', p_before_at, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  join public.posts p on p.id = f.post_id
  order by coalesce(f.taken_at, f.published_at) desc, f.post_id desc;
end $$;

revoke all on function public.edit_post_words(uuid, text, text) from public, anon;
revoke all on function public.get_feed(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_timeline(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.edit_post_words(uuid, text, text) to authenticated;
grant execute on function public.get_feed(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_timeline(uuid, timestamptz, uuid, integer) to authenticated;
