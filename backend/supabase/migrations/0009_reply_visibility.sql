-- 0009: who reads replies (Chase, Oct 16). Replies = comments and hearts.
-- Safe default: a relative's reply is read only by the parents (the space's owners and
-- adults) and the post's author. A group can let its members read each other's replies
-- ("members see each other's replies"), but only on posts shared to that group. The
-- owner can open replies to everyone the post went to. Parents' own replies reach
-- everyone the post went to. Counts follow the same rule, so nothing gives anyone away (A2).

alter table public.spaces add column reply_audience text not null default 'parents'
  check (reply_audience in ('parents', 'everyone'));
alter table public.circles add column replies_shared boolean not null default false;

-- May the caller read a reply (comment or heart) that p_author left on p_post?
create or replace function public.can_see_reply(p_post uuid, p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select public.can_view_post(p_post) and (
       p_author = auth.uid()
    or exists (select 1 from public.posts p where p.id = p_post and (p.author_id = auth.uid() or p.author_id = p_author))
    or exists (select 1 from public.posts p join public.space_members sm on sm.space_id = p.space_id
               where p.id = p_post and sm.role in ('owner', 'adult') and sm.user_id in (auth.uid(), p_author))
    or exists (select 1 from public.posts p join public.spaces s on s.id = p.space_id
               where p.id = p_post and s.reply_audience = 'everyone')
    or exists (select 1 from public.post_audiences pa
               join public.circles c on c.id = pa.circle_id and c.deleted_at is null and c.replies_shared
               join public.circle_members a on a.circle_id = c.id and a.user_id = p_author
               join public.circle_members v on v.circle_id = c.id and v.user_id = auth.uid()
               where pa.post_id = p_post))
$fn$;

-- Who will read the caller's own replies on this post: 'everyone' | 'group' | 'parents'.
-- The app words the comment box from this.
create or replace function public.reply_scope(p_post uuid) returns text
language sql stable security definer set search_path = '' as $fn$
  select case
    when not public.can_view_post(p_post) then null     -- not found: says nothing about the family's setting
    when exists (select 1 from public.posts p where p.id = p_post and p.author_id = auth.uid())
      or exists (select 1 from public.posts p join public.space_members sm on sm.space_id = p.space_id
                 where p.id = p_post and sm.user_id = auth.uid() and sm.role in ('owner', 'adult'))
      or exists (select 1 from public.posts p join public.spaces s on s.id = p.space_id
                 where p.id = p_post and s.reply_audience = 'everyone') then 'everyone'
    when exists (select 1 from public.post_audiences pa
                 join public.circles c on c.id = pa.circle_id and c.deleted_at is null and c.replies_shared
                 join public.circle_members v on v.circle_id = c.id and v.user_id = auth.uid()
                 where pa.post_id = p_post) then 'group'
    else 'parents' end
$fn$;

-- privacy-security review: the raw counters on posts would give hidden replies away.
-- App users read every posts column except reaction_count and comment_count.
do $do$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'posts' and column_name not in ('reaction_count', 'comment_count');
  revoke select on public.posts from authenticated, anon;
  execute format('grant select (%s) on public.posts to authenticated', cols);
end $do$;

-- privacy-security review: replying must not make someone's profile visible to a relative
-- who isn't allowed to read that reply.
create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select p_user = auth.uid()
  or exists (
    select 1 from public.space_members me
    join public.space_members them on them.space_id = me.space_id
    join public.spaces s on s.id = me.space_id and s.deleted_at is null
    where me.user_id = auth.uid() and them.user_id = p_user
      and (me.role in ('owner','adult') or them.role in ('owner','adult')))
  or exists (
    select 1 from public.circle_members a
    join public.circle_members b on b.circle_id = a.circle_id
    where a.user_id = auth.uid() and b.user_id = p_user)
  or exists (select 1 from public.comments c
             where c.author_id = p_user and c.deleted_at is null and public.can_see_reply(c.post_id, p_user))
  or exists (select 1 from public.reactions r
             where r.user_id = p_user and public.can_see_reply(r.post_id, p_user))
$fn$;

drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (deleted_at is null and public.can_see_reply(post_id, author_id));
drop policy reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_see_reply(post_id, user_id));

create or replace function public.get_comments(p_post uuid, p_limit integer default 50)
returns table (comment_id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  return query
  select c.id, c.author_id, pr.display_name, c.body, c.created_at
  from public.comments c join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post and c.deleted_at is null and public.can_see_reply(p_post, c.author_id)
  order by c.created_at, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.toggle_heart(p_post uuid) returns public.heart_state
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.heart_state;
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if not public.can_comment_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'reactions are turned off here' using errcode = '42501';
  end if;
  delete from public.reactions where post_id = p_post and user_id = v_uid;
  if not found then
    insert into public.reactions (post_id, user_id, emoji) values (p_post, v_uid, '❤️') on conflict do nothing;
  end if;
  select exists (select 1 from public.reactions where post_id = p_post and user_id = v_uid),
         (select count(*)::integer from public.reactions x where x.post_id = p_post and public.can_see_reply(p_post, x.user_id))
    into r;
  return r;
end $$;

drop function public.my_spaces();
create or replace function public.my_spaces()
returns table (space_id uuid, name text, role public.member_role, inviter_name text, can_post boolean, reply_audience text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, sm.role, inv.display_name,
         case sm.role when 'viewer' then s.viewers_can_post else true end,
         s.reply_audience
  from public.space_members sm
  join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  left join public.profiles inv on inv.id = sm.invited_by
  where sm.user_id = auth.uid()
  order by sm.joined_at, s.id
$$;

drop function public.my_circles(uuid);
create or replace function public.my_circles(p_space uuid)
returns table (circle_id uuid, name text, member_count integer, member_names text[], replies_shared boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, count(cm.user_id)::integer,
         coalesce(array_agg(pr.display_name order by pr.display_name) filter (where cm.user_id is not null), '{}'),
         c.replies_shared
  from public.circles c
  left join public.circle_members cm on cm.circle_id = c.id
  left join public.profiles pr on pr.id = cm.user_id
  where c.space_id = p_space and c.deleted_at is null
    and p_space = any ((select private.my_managed_space_ids())::uuid[])
  group by c.id, c.name, c.created_at, c.replies_shared
  order by c.created_at, c.name, c.id
$$;

drop function public.get_feed(uuid, timestamptz, uuid, integer);
create or replace function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ts  timestamptz := coalesce(p_before_ts, 'infinity');
  v_id  uuid := coalesce(p_before_id, '00000000-0000-0000-0000-000000000000');
begin
  if v_uid is null or not exists (
       select 1 from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
       where sm.space_id = p_space and sm.user_id = v_uid) then
    return;
  end if;
  return query
  with circ as (
    select cm.circle_id
    from public.circle_members cm join public.circles c on c.id = cm.circle_id
    where cm.user_id = v_uid and c.space_id = p_space and c.deleted_at is null
  ), cand as (
    select x.post_id as pid, x.feed_at as ts
    from circ cross join lateral (
      select pa.post_id, pa.feed_at from public.post_audiences pa
      where pa.circle_id = circ.circle_id and pa.feed_at is not null
        and (pa.feed_at, pa.post_id) < (v_ts, v_id)
      order by pa.feed_at desc, pa.post_id desc
      limit v_lim) x
    union
    select mine.id, mine.published_at from (
      select p.id, p.published_at from public.posts p
      where p.author_id = v_uid and p.space_id = p_space and p.status = 'published' and p.deleted_at is null
        and (p.published_at, p.id) < (v_ts, v_id)
      order by p.published_at desc, p.id desc
      limit v_lim) mine
  ), page as (
    select pid, ts from cand order by ts desc, pid desc limit v_lim
  )
  select p.id, p.author_id, pr.display_name, p.caption, p.published_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'media_id', m.id, 'kind', m.kind, 'width', m.width, 'height', m.height,
                            'duration_ms', m.duration_ms, 'status', m.upload_status) order by m.position)
                   from public.media_items m
                   where m.post_id = p.id and (m.upload_status = 'ready' or p.author_id = v_uid)), '[]'::jsonb),
         -- counts show only what this viewer may see (AUD-8): hearts and comments follow the reply rule
         (select count(*)::integer from public.reactions r
           where r.post_id = p.id and public.can_see_reply(p.id, r.user_id)),
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = v_uid),
         (select count(*)::integer from public.comments cc
           where cc.post_id = p.id and cc.deleted_at is null and public.can_see_reply(p.id, cc.author_id)),
         case when p.author_id = v_uid then aud.audience end,
         case when p.author_id = v_uid then aud.seen end,
         case when p.author_id = v_uid then aud.reach end,
         public.reply_scope(p.id)
  from page
  join public.posts p     on p.id = page.pid and p.deleted_at is null and p.status = 'published'
  join public.profiles pr on pr.id = p.author_id
  left join lateral (
    select (select jsonb_agg(jsonb_build_object(
                     'circle_id', c.id, 'name', c.name,
                     'member_count', (select count(*) from public.circle_members cm2 where cm2.circle_id = c.id))
                   order by c.name, c.id)
            from public.post_audiences pa join public.circles c on c.id = pa.circle_id and c.deleted_at is null
            where pa.post_id = p.id and p.author_id = v_uid) as audience,
           r.seen, r.reach
    from (select count(*)::integer as reach, count(pv.user_id)::integer as seen
          from (select distinct cm.user_id
                from public.post_audiences pa
                join public.circles c on c.id = pa.circle_id and c.deleted_at is null
                join public.circle_members cm on cm.circle_id = pa.circle_id
                where pa.post_id = p.id and cm.user_id <> p.author_id
                  and p.author_id = v_uid) u                   -- one-time filter: skipped for non-authors
          left join public.post_views pv on pv.post_id = p.id and pv.user_id = u.user_id) r
  ) aud on true
  order by page.ts desc, page.pid desc;
end $$;

-- Posters flip the switch on a group; anyone else gets "not found".
create or replace function public.set_group_replies_shared(p_circle uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v_space uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select space_id into v_space from public.circles where id = p_circle and deleted_at is null;
  if v_space is null or not public.is_space_manager(v_space) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update public.circles set replies_shared = coalesce(p_on, false) where id = p_circle;
end $fn$;

-- The family's default; only the owner may change it.
create or replace function public.set_reply_audience(p_space uuid, p_choice text) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not public.is_space_member(p_space) then raise exception 'not found' using errcode = 'P0002'; end if;
  if not public.is_space_owner(p_space) then raise exception 'only the owner can change this' using errcode = '42501'; end if;
  if p_choice is null or p_choice not in ('parents', 'everyone') then
    raise exception 'choose parents or everyone' using errcode = '23514';
  end if;
  update public.spaces set reply_audience = p_choice where id = p_space;
end $fn$;

revoke execute on function public.can_see_reply(uuid, uuid), public.reply_scope(uuid),
  public.set_group_replies_shared(uuid, boolean), public.set_reply_audience(uuid, text),
  public.my_spaces(), public.my_circles(uuid), public.get_feed(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.can_see_reply(uuid, uuid), public.reply_scope(uuid),
  public.set_group_replies_shared(uuid, boolean), public.set_reply_audience(uuid, text),
  public.my_spaces(), public.my_circles(uuid), public.get_feed(uuid, timestamptz, uuid, integer)
  to authenticated, service_role;
