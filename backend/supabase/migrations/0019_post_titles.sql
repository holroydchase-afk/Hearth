-- 0019: an optional title for each post (CAP-1..3, CAP-5, CAP-11; docs/product/SPEC-CAPTIONS.md, DEC-39).
-- The title belongs to the whole set, like the caption: plain text, 80 characters at most, blank means none.
-- create_post gains p_title (default null, so older app builds keep working); get_feed and get_timeline return it
-- as their last column, read from posts (feed_rows is unchanged, and keeps JIT off from 0018). Like the caption,
-- the title never goes into a notice: the outbox holds ids only (CAP-10). Changing the words after posting
-- (CAP-6..8) and bulk titles (CAP-9) come later.

alter table public.posts add column title text check (char_length(title) between 1 and 80);

drop function public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[], uuid, integer);
create function public.create_post(
  p_client_id uuid, p_space uuid, p_caption text, p_circle_ids uuid[],
  p_taken_at timestamptz default null, p_child_ids uuid[] default '{}',
  p_batch_id uuid default null, p_batch_size integer default null, p_title text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_post uuid; v_cid uuid; v_kind text; v_title text := nullif(btrim(p_title), '');
begin
  if v_uid is null or not public.can_post_in_space(p_space) then
    raise exception 'you cannot post in this space' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '23514';
  end if;
  if (p_batch_id is null) <> (p_batch_size is null) then
    raise exception 'batch id and batch size go together' using errcode = '23514';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'a title is 80 characters at most' using errcode = '23514';
  end if;
  if p_batch_size is not null and (p_batch_size < 1 or p_batch_size > 100) then
    raise exception 'a batch is 1 to 100 posts' using errcode = '23514';
  end if;
  select id into v_post from public.posts where author_id = v_uid and client_id = p_client_id;
  if found then return v_post; end if;
  if coalesce(cardinality(p_circle_ids), 0) = 0 then
    raise exception 'choose at least one circle' using errcode = '23514';
  end if;
  foreach v_cid in array p_circle_ids loop
    select kind into v_kind from public.circles where id = v_cid and space_id = p_space and deleted_at is null;
    if v_kind is null then
      raise exception 'circle not found in this space' using errcode = '23514';
    end if;
    if not public.can_send_to(v_cid) then
      -- a container the caller isn't in stays "not found"; Everyone and their own ones say "not allowed"
      if v_kind = 'everyone' or v_cid = any (private.my_circle_ids()) then
        raise exception 'you can''t send there' using errcode = '42501';
      end if;
      raise exception 'circle not found in this space' using errcode = '23514';
    end if;
  end loop;
  insert into public.posts (space_id, author_id, caption, title, taken_at, client_id, batch_id, batch_size)
  values (p_space, v_uid, p_caption, v_title, p_taken_at, p_client_id, p_batch_id, p_batch_size)
  on conflict (author_id, client_id) do nothing
  returning id into v_post;
  if v_post is null then   -- lost a race with an identical retry
    select id into v_post from public.posts where author_id = v_uid and client_id = p_client_id;
    return v_post;
  end if;
  insert into public.post_audiences (post_id, circle_id) select distinct v_post, unnest(p_circle_ids);
  insert into public.post_children (post_id, child_id) select distinct v_post, unnest(coalesce(p_child_ids, '{}'));
  return v_post;
end $$;

drop function public.get_feed(uuid, timestamptz, uuid, integer);
drop function public.get_timeline(uuid, timestamptz, uuid, integer);
create function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz,
               event_id uuid, event_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope, f.taken_at, f.event_id, f.event_name, p.title
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
               taken_at timestamptz, sort_at timestamptz, event_id uuid, event_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope,
         f.taken_at, coalesce(f.taken_at, f.published_at), f.event_id, f.event_name, p.title
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'taken', p_before_at, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  join public.posts p on p.id = f.post_id
  order by coalesce(f.taken_at, f.published_at) desc, f.post_id desc;
end $$;

revoke all on function public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[], uuid, integer, text) from public, anon;
revoke all on function public.get_feed(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_timeline(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[], uuid, integer, text) to authenticated;
grant execute on function public.get_feed(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_timeline(uuid, timestamptz, uuid, integer) to authenticated;
