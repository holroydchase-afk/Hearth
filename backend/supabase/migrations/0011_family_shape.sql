-- 0011: family shape (docs/product/SPEC-GROUPS.md, incl. section 10 "Privacy review (Oct 17)").
-- BETA-AUD-11..21, BETA-REPLY-7..13. Tests: tests/groups_test.sql, tests/aud16/, tests/timeline_future_test.sql.
--
-- * Every container is a circles row with a kind: everyone | group | household | event (the app says "group").
--   Allowed links (private.link_allowed, the one place): household -> group, household -> event, group -> event.
--   circle_links (parent, child, sees_from) and circle_people (household, person, sees_from) are the sources;
--   circle_members is DERIVED from them by trigger in the same transaction (privacy item 3). Rows that existed
--   before 0011 are kept exactly as they were (circle_members.derived = false: "direct" rows) so this migration
--   changes nobody's access (AUD-16, privacy item 12: today's Everyone keeps today's members, the co-parent is
--   not added). Direct rows are written only by redeem_invite for a legacy group (a group with nothing under
--   it) until 0012 makes households-only placement hard after the family-setup v2 re-seed.
-- * Everyone (one per space) holds the parents plus every member with space_members.in_everyone (set when a
--   household invite is redeemed: invite redeemers join Everyone).
-- * Parents (owner, adult) see every published post in their space and read every reply. They are not
--   materialized into circle_members; the shared predicate checks the role (so a demoted parent loses it at once).
-- * Share history: invites.history 'all' | 'new' (required for relatives); placements and links carry sees_from
--   (null = all past photos; else the moment it was added). Per path the latest cutoff wins; across paths the
--   earliest. The cutoff compares published_at only, never taken_at (privacy item 8).
-- * ONE visibility predicate, private.sees_post(user, post): can_view_post (and so sign-media, RLS on posts,
--   media, comments, hearts), private.visible_posts (feed, timeline, years), claim_notification_batches and the
--   publish notice all call it (privacy item 9).
-- * ONE send check, can_send_to(circle), via can(space, capability): create_post, the post_audiences insert
--   policy and publish_post (privacy item 2). Only parents send to Everyone; relatives only to containers they
--   are in, and only when the family lets relatives post.
-- * Reply rule (section 6): parents, the post's author, the writer themself, the same household (direct
--   placements, no relay), the same event on the post's audience, or the owner's "everyone" setting. Readers are
--   FIXED WHEN THE REPLY IS WRITTEN (privacy item 5): for the household and event rules, the reader and writer
--   must both have been placed by the reply's created_at, and the reader must already have been able to see the
--   post then. Narrowing is read-time. The 0009 per-group switch is dropped (BETA-REPLY-12).
-- * Future capture dates: a taken_at later than published_at is clamped to published_at (timeline order, years).
-- NO CONTENT IS USED FOR AI/ML TRAINING, ADVERTISING OR PROFILING (see 0001 header).

-- ---------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------
alter table public.circles add column kind text not null default 'group'
  check (kind in ('everyone', 'group', 'household', 'event'));
alter table public.circles add column starts_on date;     -- events; unused by the app in the first build
alter table public.circles add column ends_on date;
update public.circles set kind = 'everyone' where name = 'Everyone';
-- a space with no Everyone gets an empty one (nobody's access changes)
insert into public.circles (space_id, name, kind, created_by)
select s.id, 'Everyone', 'everyone', s.created_by from public.spaces s
where not exists (select 1 from public.circles c where c.space_id = s.id and (c.kind = 'everyone' or c.name = 'Everyone'));
create unique index circles_one_everyone on public.circles (space_id) where kind = 'everyone' and deleted_at is null;

alter table public.space_members add column sees_from timestamptz;              -- share-history cutoff (null = all)
alter table public.space_members add column in_everyone boolean not null default false;
alter table public.invites add column history text check (history in ('all', 'new'));
alter table public.circle_members add column sees_from timestamptz;
alter table public.circle_members add column derived boolean not null default false;
-- S-0011-6: when a membership's cutoff is widened in place (e.g. placed again with "Share all past photos"),
-- the moment and the cutoff before it, so replies written before the widening keep the readers they had.
alter table public.circle_members add column widened_at timestamptz;
alter table public.circle_members add column sees_from_before timestamptz;

create table public.circle_links (
  parent_id  uuid not null references public.circles(id) on delete cascade,
  child_id   uuid not null references public.circles(id) on delete cascade,
  sees_from  timestamptz,
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (parent_id, child_id)
);
create index on public.circle_links (child_id);
create index on public.circle_links (added_by);

create table public.circle_people (
  circle_id  uuid not null references public.circles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sees_from  timestamptz,
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index on public.circle_people (user_id);
create index on public.circle_people (added_by);

-- ---------------------------------------------------------------------------
-- Shape rules (triggers, so even a direct insert is refused: privacy item 3)
-- ---------------------------------------------------------------------------
create or replace function private.link_allowed(p_parent_kind text, p_child_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_parent_kind, p_child_kind) in (('group', 'household'), ('event', 'household'), ('event', 'group'))
$$;

create or replace function private.tg_link_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.circles; c public.circles;
begin
  select * into p from public.circles where id = new.parent_id;
  select * into c from public.circles where id = new.child_id;
  if p.id is null or c.id is null or p.deleted_at is not null or c.deleted_at is not null then
    raise exception 'not found' using errcode = '23514';
  end if;
  if p.space_id <> c.space_id then
    raise exception 'both must be in the same family' using errcode = '23514';
  end if;
  if not private.link_allowed(p.kind, c.kind) then
    raise exception 'a % can''t go under a %', c.kind, p.kind using errcode = '23514';
  end if;
  if new.parent_id = new.child_id or exists (
       with recursive down(id) as (
         select l.child_id from public.circle_links l where l.parent_id = new.child_id
         union
         select l.child_id from public.circle_links l join down on l.parent_id = down.id)
       select 1 from down where id = new.parent_id) then
    raise exception 'that would make a loop' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger link_check before insert or update on public.circle_links
  for each row execute function private.tg_link_check();

create or replace function private.tg_people_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.circles c where c.id = new.circle_id and c.kind = 'household' and c.deleted_at is null) then
    raise exception 'people go only in households' using errcode = '23514';
  end if;
  if not exists (select 1 from public.circles c join public.space_members sm on sm.space_id = c.space_id and sm.user_id = new.user_id
                 where c.id = new.circle_id) then
    raise exception 'not a member of this family' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger people_check before insert or update on public.circle_people
  for each row execute function private.tg_people_check();

-- S-0011-6: a widened cutoff is recorded, never silently back-dated. Until widened_at the earlier cutoff applies
-- (after several widenings the first one is kept: that can only narrow old replies, never widen them).
create or replace function private.tg_members_widen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.sees_from is not null and (new.sees_from is null or new.sees_from < old.sees_from) then
    new.widened_at := now();
    new.sees_from_before := coalesce(old.sees_from_before, old.sees_from);
  else
    new.widened_at := old.widened_at;
    new.sees_from_before := old.sees_from_before;
  end if;
  return new;
end $$;
create trigger members_widen before update on public.circle_members
  for each row execute function private.tg_members_widen();

-- S-0011-7: Everyone stays, however it is updated (retire_level says so too; a parent's direct UPDATE of
-- circles.deleted_at must not get round it).
create or replace function private.tg_everyone_stays() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.kind = 'everyone' and old.deleted_at is null and new.deleted_at is not null then
    raise exception 'Everyone stays' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger everyone_stays before update of deleted_at on public.circles
  for each row execute function private.tg_everyone_stays();

-- ---------------------------------------------------------------------------
-- Derived membership (circle_members.derived), rebuilt per family in the same transaction
-- ---------------------------------------------------------------------------
create or replace function private.rebuild_members(p_space uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_space is null then return; end if;
  with recursive base as (
    select cp.circle_id, cp.user_id, coalesce(cp.sees_from, '-infinity'::timestamptz) as sf
    from public.circle_people cp
    join public.circles h on h.id = cp.circle_id and h.space_id = p_space and h.kind = 'household' and h.deleted_at is null
    join public.space_members sm on sm.space_id = p_space and sm.user_id = cp.user_id
    union all
    select e.id, sm.user_id, coalesce(sm.sees_from, '-infinity'::timestamptz)
    from public.circles e
    join public.space_members sm on sm.space_id = e.space_id and sm.in_everyone
    where e.space_id = p_space and e.kind = 'everyone' and e.deleted_at is null
  ), up as (
    select circle_id, user_id, sf, 0 as depth from base
    union all
    select l.parent_id, up.user_id, greatest(up.sf, coalesce(l.sees_from, '-infinity'::timestamptz)), up.depth + 1
    from up
    join public.circle_links l on l.child_id = up.circle_id
    join public.circles pc on pc.id = l.parent_id and pc.deleted_at is null
    where up.depth < 8
  ), want as (
    select circle_id, user_id, min(sf) as sf from up group by circle_id, user_id
  ), del as (
    delete from public.circle_members cm using public.circles c
    where c.id = cm.circle_id and c.space_id = p_space and cm.derived
      and not exists (select 1 from want w where w.circle_id = cm.circle_id and w.user_id = cm.user_id)
    returning 1
  ), upd as (
    update public.circle_members cm set sees_from = nullif(w.sf, '-infinity'::timestamptz)
    from want w
    where w.circle_id = cm.circle_id and w.user_id = cm.user_id and cm.derived
      and cm.sees_from is distinct from nullif(w.sf, '-infinity'::timestamptz)
    returning 1
  )
  insert into public.circle_members (circle_id, user_id, sees_from, derived)
  select w.circle_id, w.user_id, nullif(w.sf, '-infinity'::timestamptz), true from want w
  where not exists (select 1 from public.circle_members cm where cm.circle_id = w.circle_id and cm.user_id = w.user_id);
end $$;

create or replace function private.tg_rebuild_members() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_space uuid;
begin
  if tg_table_name = 'circle_people' then
    select space_id into v_space from public.circles where id = coalesce(new.circle_id, old.circle_id);
  elsif tg_table_name = 'circle_links' then
    select space_id into v_space from public.circles where id = coalesce(new.parent_id, old.parent_id);
  elsif tg_table_name = 'space_members' then
    v_space := coalesce(new.space_id, old.space_id);
  else
    v_space := coalesce(new.space_id, old.space_id);
  end if;
  perform private.rebuild_members(v_space);
  return null;
end $$;
create trigger members_rebuild after insert or update or delete on public.circle_people
  for each row execute function private.tg_rebuild_members();
create trigger members_rebuild after insert or update or delete on public.circle_links
  for each row execute function private.tg_rebuild_members();
create trigger members_rebuild after insert or delete or update of in_everyone, sees_from on public.space_members
  for each row execute function private.tg_rebuild_members();
create trigger members_rebuild after update of deleted_at, kind on public.circles
  for each row execute function private.tg_rebuild_members();

-- leaving / removal: placements go too (privacy item 10: a re-invite gets a fresh choice)
create or replace function public.tg_space_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.circle_people cp using public.circles c
   where cp.circle_id = c.id and c.space_id = old.space_id and cp.user_id = old.user_id;
  delete from public.circle_members cm using public.circles c
   where cm.circle_id = c.id and c.space_id = old.space_id and cm.user_id = old.user_id;
  delete from public.notification_prefs where space_id = old.space_id and user_id = old.user_id;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- Future capture dates (BETA-TIME-2/4): never later than the share date
-- ---------------------------------------------------------------------------
create or replace function public.tg_posts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.space_id <> old.space_id or new.author_id <> old.author_id then
      raise exception 'space_id and author_id are immutable' using errcode = '42501';
    end if;
    if new.status = 'draft' and old.status = 'published' then
      raise exception 'cannot unpublish; change the audience or delete instead' using errcode = '23514';
    end if;
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if new.taken_at is not null and new.published_at is not null and new.taken_at > new.published_at then
    new.taken_at := new.published_at;
  end if;
  return new;
end $$;
update public.posts set taken_at = published_at where taken_at > published_at;

-- ---------------------------------------------------------------------------
-- THE visibility predicate (privacy item 9)
-- ---------------------------------------------------------------------------
-- p_user may see p_post: their own post while still a member; or a published post when they are a parent
-- (owner/adult) of its family, or a member of a live container on its audience whose cutoff it passes.
create or replace function private.sees_post(p_user uuid, p_post uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select exists (
    select 1
    from public.posts p
    join public.spaces s on s.id = p.space_id and s.deleted_at is null
    join public.space_members sm on sm.space_id = p.space_id and sm.user_id = p_user
    where p.id = p_post
      and p.deleted_at is null
      and (p.author_id = p_user
           or (p.status = 'published'
               and (sm.role in ('owner', 'adult')
                    or exists (select 1
                               from public.post_audiences pa
                               join public.circles c on c.id = pa.circle_id and c.deleted_at is null
                               join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = p_user
                               where pa.post_id = p.id
                                 and (cm.sees_from is null or p.published_at >= cm.sees_from)))))));
end $$;

create or replace function public.can_view_post(p_post uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.sees_post(auth.uid(), p_post);
end $$;

-- posts RLS reads the same predicate (0002's copy had no cutoff and no parent rule)
drop policy posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using (deleted_at is null
         and space_id = any ((select private.my_space_ids())::uuid[])
         and (author_id = (select auth.uid()) or public.can_view_post(id)));

-- ---------------------------------------------------------------------------
-- Roles: the one permission check (AUD-21)
-- ---------------------------------------------------------------------------
create or replace function public.can(p_space uuid, p_capability text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role := public.space_role(p_space);
begin
  if p_capability is null or p_capability not in ('post', 'send_to_everyone', 'make_events', 'invite', 'set_up_family', 'family_settings') then
    raise exception 'unknown capability' using errcode = '22023';
  end if;
  if v_role is null then return false; end if;
  return case p_capability
    when 'post' then public.can_post_in_space(p_space)
    when 'family_settings' then v_role = 'owner'
    else v_role in ('owner', 'adult') end;
end $$;

-- May the caller send a post to this container? (privacy item 2)
create or replace function public.can_send_to(p_circle uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c public.circles;
begin
  select * into c from public.circles where id = p_circle and deleted_at is null;
  if c.id is null or not public.can(c.space_id, 'post') then return false; end if;
  if c.kind = 'everyone' then return public.can(c.space_id, 'send_to_everyone'); end if;
  if public.is_space_manager(c.space_id) then return true; end if;
  return c.id = any (private.my_circle_ids());
end $$;

drop policy post_audiences_insert on public.post_audiences;
create policy post_audiences_insert on public.post_audiences for insert to authenticated
  with check (public.is_post_author(post_id) and public.can_send_to(circle_id));

-- ---------------------------------------------------------------------------
-- create_post / publish_post: both call can_send_to
-- ---------------------------------------------------------------------------
create or replace function public.create_post(
  p_client_id uuid, p_space uuid, p_caption text, p_circle_ids uuid[],
  p_taken_at timestamptz default null, p_child_ids uuid[] default '{}',
  p_batch_id uuid default null, p_batch_size integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_post uuid; v_cid uuid; v_kind text;
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
  insert into public.posts (space_id, author_id, caption, taken_at, client_id, batch_id, batch_size)
  values (p_space, v_uid, p_caption, p_taken_at, p_client_id, p_batch_id, p_batch_size)
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

create or replace function public.publish_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.posts;
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  select * into v from public.posts where id = p_post for update;
  if v.author_id is distinct from auth.uid() then
    raise exception 'only the author can publish' using errcode = '42501';
  end if;
  if v.status = 'published' then return; end if;     -- idempotent
  if not public.can_post_in_space(v.space_id) then
    raise exception 'you cannot post in this space' using errcode = '42501';
  end if;
  -- re-checked at publish: a parent demoted after drafting to Everyone can't publish it
  if exists (select 1 from public.post_audiences pa where pa.post_id = p_post and not public.can_send_to(pa.circle_id)) then
    raise exception 'you can''t send there' using errcode = '42501';
  end if;
  if exists (select 1 from public.media_items where post_id = p_post and upload_status <> 'ready')
     or not exists (select 1 from public.media_items where post_id = p_post) then
    raise exception 'all media must finish uploading first' using errcode = '23514';
  end if;
  update public.posts set status = 'published' where id = p_post;
end $$;

-- ---------------------------------------------------------------------------
-- Lists of posts: feed, timeline, years (0010's one function, now with parents and the cutoff)
-- ---------------------------------------------------------------------------
create or replace function private.visible_posts(
  p_space uuid, p_order text default 'shared', p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default null)
returns table (post_id uuid, published_at timestamptz, taken_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_lim integer := least(greatest(p_limit, 1), 50);
  v_at  timestamptz := coalesce(p_before_at, 'infinity');
  v_id  uuid := coalesce(p_before_id, '00000000-0000-0000-0000-000000000000');
  v_role public.member_role;
  v_circles uuid[];
  v_from timestamptz[];
begin
  if p_order is null or p_order not in ('shared', 'taken') then
    raise exception 'order must be shared or taken' using errcode = '22023';
  end if;
  select sm.role into v_role
  from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  where sm.space_id = p_space and sm.user_id = v_uid;
  if v_uid is null or v_role is null then return; end if;

  -- parents see every published post in their family
  if v_role in ('owner', 'adult') then
    if p_limit is null then
      return query select p.id, p.published_at, p.taken_at from public.posts p
      where p.space_id = p_space and p.status = 'published' and p.deleted_at is null;
    elsif p_order = 'shared' then
      return query select p.id, p.published_at, p.taken_at from public.posts p
      where p.space_id = p_space and p.status = 'published' and p.deleted_at is null
        and (p.published_at, p.id) < (v_at, v_id)
      order by p.published_at desc, p.id desc limit v_lim;
    else
      return query select p.id, p.published_at, p.taken_at from public.posts p
      where p.space_id = p_space and p.status = 'published' and p.deleted_at is null
        and (coalesce(p.taken_at, p.published_at), p.id) < (v_at, v_id)
      order by coalesce(p.taken_at, p.published_at) desc, p.id desc limit v_lim;
    end if;
    return;
  end if;

  -- everyone else: the live containers they are in, each with its share-history cutoff
  select coalesce(array_agg(cm.circle_id order by cm.circle_id), '{}'),
         coalesce(array_agg(cm.sees_from order by cm.circle_id), '{}')
    into v_circles, v_from
  from public.circle_members cm join public.circles c on c.id = cm.circle_id
  where cm.user_id = v_uid and c.space_id = p_space and c.deleted_at is null;

  if p_limit is null then
    return query
    select p.id, p.published_at, p.taken_at from public.posts p
    where p.space_id = p_space and p.status = 'published' and p.deleted_at is null
      and (p.author_id = v_uid
           or exists (select 1 from public.post_audiences pa
                      join unnest(v_circles, v_from) circ(id, sees_from) on circ.id = pa.circle_id
                      where pa.post_id = p.id and (circ.sees_from is null or p.published_at >= circ.sees_from)));
  elsif p_order = 'shared' then
    return query
    with cand as (
      select x.post_id as pid, x.feed_at as ts
      from unnest(v_circles, v_from) circ(id, sees_from) cross join lateral (
        select pa.post_id, pa.feed_at from public.post_audiences pa
        where pa.circle_id = circ.id and pa.feed_at is not null
          and (circ.sees_from is null or pa.feed_at >= circ.sees_from)
          and (pa.feed_at, pa.post_id) < (v_at, v_id)
        order by pa.feed_at desc, pa.post_id desc
        limit v_lim) x
      union
      select mine.id, mine.published_at from (
        select p.id, p.published_at from public.posts p
        where p.author_id = v_uid and p.space_id = p_space and p.status = 'published' and p.deleted_at is null
          and (p.published_at, p.id) < (v_at, v_id)
        order by p.published_at desc, p.id desc
        limit v_lim) mine
    ), page as (
      select pid, ts from cand order by ts desc, pid desc limit v_lim
    )
    select p.id, p.published_at, p.taken_at
    from page join public.posts p on p.id = page.pid and p.deleted_at is null and p.status = 'published'
    order by page.ts desc, page.pid desc;
  else
    return query
    with cand as (
      select x.post_id as pid, x.timeline_at as ts
      from unnest(v_circles, v_from) circ(id, sees_from) cross join lateral (
        select pa.post_id, pa.timeline_at from public.post_audiences pa
        where pa.circle_id = circ.id and pa.timeline_at is not null
          and (circ.sees_from is null or pa.feed_at >= circ.sees_from)
          and (pa.timeline_at, pa.post_id) < (v_at, v_id)
        order by pa.timeline_at desc, pa.post_id desc
        limit v_lim) x
      union
      select mine.id, mine.ts from (
        select p.id, coalesce(p.taken_at, p.published_at) as ts from public.posts p
        where p.author_id = v_uid and p.space_id = p_space and p.status = 'published' and p.deleted_at is null
          and (coalesce(p.taken_at, p.published_at), p.id) < (v_at, v_id)
        order by coalesce(p.taken_at, p.published_at) desc, p.id desc
        limit v_lim) mine
    ), page as (
      select pid, ts from cand order by ts desc, pid desc limit v_lim
    )
    select p.id, p.published_at, p.taken_at
    from page join public.posts p on p.id = page.pid and p.deleted_at is null and p.status = 'published'
    order by page.ts desc, page.pid desc;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reply rule (SPEC-GROUPS section 6; privacy items 4, 5, 7)
-- ---------------------------------------------------------------------------
-- May p_reader read a reply that p_writer wrote on p_post at p_at? Not granted to app users.
create or replace function private.reply_ok(p_reader uuid, p_post uuid, p_writer uuid, p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_post public.posts; v_aud text; v_since timestamptz;
begin
  if p_reader is null or not private.sees_post(p_reader, p_post) then return false; end if;
  select * into v_post from public.posts where id = p_post;
  if p_reader = p_writer or p_reader = v_post.author_id or p_writer = v_post.author_id then return true; end if;
  if exists (select 1 from public.space_members sm where sm.space_id = v_post.space_id
             and sm.user_id in (p_reader, p_writer) and sm.role in ('owner', 'adult')) then
    return true;
  end if;
  select reply_audience into v_aud from public.spaces where id = v_post.space_id;
  if v_aud = 'everyone' then return true; end if;
  -- household and event rules, fixed when the reply was written: the reader could already see the post (through a
  -- container that was already on its audience: S-0011-1) ...
  -- (S-0011-6: through a membership widened in place, only from the widening for posts the old cutoff hid)
  select min(greatest(case when cm.widened_at is not null and v_post.published_at < cm.sees_from_before
                           then cm.widened_at else cm.added_at end, pa.added_at)) into v_since
  from public.post_audiences pa
  join public.circles c on c.id = pa.circle_id and c.deleted_at is null
  join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = p_reader
  where pa.post_id = p_post and (cm.sees_from is null or v_post.published_at >= cm.sees_from);
  if v_since is null or v_since > p_at then return false; end if;
  -- ... and both were already in one household (direct placements only: no relay) ...
  if exists (select 1 from public.circle_people r
             join public.circles h on h.id = r.circle_id and h.kind = 'household' and h.deleted_at is null
                                  and h.space_id = v_post.space_id
             join public.circle_people w on w.circle_id = r.circle_id and w.user_id = p_writer
             where r.user_id = p_reader and r.added_at <= p_at and w.added_at <= p_at) then
    return true;
  end if;
  -- ... or both in an event on this post's audience
  return exists (select 1 from public.post_audiences pa
                 join public.circles e on e.id = pa.circle_id and e.kind = 'event' and e.deleted_at is null
                 join public.circle_members r on r.circle_id = e.id and r.user_id = p_reader and r.added_at <= p_at
                 join public.circle_members w on w.circle_id = e.id and w.user_id = p_writer and w.added_at <= p_at
                 where pa.post_id = p_post and pa.added_at <= p_at);
end $$;

-- The caller reading one reply at its written time (RLS on comments and reactions).
create or replace function private.reply_visible(p_post uuid, p_writer uuid, p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.reply_ok(auth.uid(), p_post, p_writer, p_at);
end $$;

-- May the caller read p_author's replies on p_post? Judged as of p_author's first reply there (their heart or
-- their earliest live comment); with none yet, as of now (the reply they would write next). Comments and hearts
-- themselves are judged at their own created_at (RLS, get_comments, feed_rows).
create or replace function public.can_see_reply(p_post uuid, p_author uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return private.reply_ok(auth.uid(), p_post, p_author,
    coalesce(least((select r.created_at from public.reactions r where r.post_id = p_post and r.user_id = p_author),
                   (select min(c.created_at) from public.comments c
                     where c.post_id = p_post and c.author_id = p_author and c.deleted_at is null)),
             now()));
end $fn$;

-- Who reads the caller's replies on this post: 'everyone' (author, parent or the family's setting), 'group'
-- (someone in their household or in an event on this post as well), else 'parents'. The comment box names
-- people from reply_readers; this stays for the feed row.
create or replace function public.reply_scope(p_post uuid) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); v_post public.posts;
begin
  if not public.can_view_post(p_post) then return null; end if;   -- not found: says nothing
  select * into v_post from public.posts where id = p_post;
  if v_post.author_id = v_uid
     or exists (select 1 from public.space_members sm where sm.space_id = v_post.space_id and sm.user_id = v_uid and sm.role in ('owner', 'adult'))
     or exists (select 1 from public.spaces s where s.id = v_post.space_id and s.reply_audience = 'everyone') then
    return 'everyone';
  end if;
  if exists (select 1 from public.circle_people r
             join public.circles h on h.id = r.circle_id and h.kind = 'household' and h.deleted_at is null and h.space_id = v_post.space_id
             join public.circle_people w on w.circle_id = r.circle_id and w.user_id <> v_uid
             where r.user_id = v_uid)
     or exists (select 1 from public.post_audiences pa
                join public.circles e on e.id = pa.circle_id and e.kind = 'event' and e.deleted_at is null
                join public.circle_members r on r.circle_id = e.id and r.user_id = v_uid
                join public.circle_members w on w.circle_id = e.id and w.user_id <> v_uid
                where pa.post_id = p_post) then
    return 'group';
  end if;
  return 'parents';
end $fn$;

-- REPLY-11: the names the family uses for everyone who will read the caller's reply on this post (never the
-- caller). Only people who can see the post now. Null ("not found") for a post the caller can't see.
create or replace function public.reply_readers(p_post uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.can_view_post(p_post) then return null; end if;
  return array(
    select pr.display_name
    from public.posts p
    join public.space_members sm on sm.space_id = p.space_id and sm.user_id <> v_uid
    join public.profiles pr on pr.id = sm.user_id and pr.deleted_at is null
    where p.id = p_post and private.reply_ok(sm.user_id, p_post, v_uid, now())
    order by pr.display_name);
end $fn$;

drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (deleted_at is null and private.reply_visible(post_id, author_id, created_at));
drop policy reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (private.reply_visible(post_id, user_id, created_at));
-- a heart's time decides who reads it: app users can't choose it
revoke insert on public.reactions from authenticated;
grant insert (post_id, user_id, emoji) on public.reactions to authenticated;
-- an audience row's time decides who reads earlier replies (S-0011-1): app users can't choose it either
revoke insert on public.post_audiences from authenticated;
grant insert (post_id, circle_id) on public.post_audiences to authenticated;

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
  where c.post_id = p_post and c.deleted_at is null and private.reply_ok(auth.uid(), p_post, c.author_id, c.created_at)
  order by c.created_at, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- The feed/timeline row builder works the reply rule out per page (reply_test "AUD-8 perf"; privacy item 7):
-- a reply by W written at t is counted for the caller R when R reads everything on the post (author, parent,
-- the family's setting), or W is R, the post's author or a parent, or W is R's household- or event-mate on this
-- post and t is at or after both the moment they became mates and the moment R could first see the post.
-- groups_test "privacy item 7 parity" and reply_test check it equals can_see_reply; change both together.
create or replace function private.feed_rows(p_posts uuid[])
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  return query
  with pg as (
    select p.id, p.space_id, p.author_id, p.published_at
    from public.posts p where p.id = any (p_posts) and p.deleted_at is null and p.status = 'published'
  ), peers as (
    select x.pid, x.user_id, min(x.since) as since from (
      select p.id as pid, w.user_id, greatest(r.added_at, w.added_at) as since
      from pg p
      join public.circle_people r on r.user_id = v_uid
      join public.circles h on h.id = r.circle_id and h.kind = 'household' and h.deleted_at is null and h.space_id = p.space_id
      join public.circle_people w on w.circle_id = r.circle_id and w.user_id <> v_uid
      union all
      select p.id, w.user_id, greatest(r.added_at, w.added_at, pa.added_at)
      from pg p
      join public.post_audiences pa on pa.post_id = p.id
      join public.circles e on e.id = pa.circle_id and e.kind = 'event' and e.deleted_at is null
      join public.circle_members r on r.circle_id = e.id and r.user_id = v_uid
      join public.circle_members w on w.circle_id = e.id and w.user_id <> v_uid
    ) x group by x.pid, x.user_id
  )
  select p.id, p.author_id, pr.display_name, p.caption, p.published_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'media_id', m.id, 'kind', m.kind, 'width', m.width, 'height', m.height,
                            'duration_ms', m.duration_ms, 'status', m.upload_status) order by m.position)
                   from public.media_items m
                   where m.post_id = p.id and (m.upload_status = 'ready' or p.author_id = v_uid)), '[]'::jsonb),
         (select count(*)::integer from public.reactions r
           where r.post_id = p.id
             and (rr.reads_all or r.user_id = v_uid or r.user_id = p.author_id or r.user_id = any (rr.parents)
                  or (rr.r_since is not null and r.created_at >= rr.r_since
                      and exists (select 1 from peers q where q.pid = p.id and q.user_id = r.user_id and r.created_at >= q.since)))),
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = v_uid),
         (select count(*)::integer from public.comments cc
           where cc.post_id = p.id and cc.deleted_at is null
             and (rr.reads_all or cc.author_id = v_uid or cc.author_id = p.author_id or cc.author_id = any (rr.parents)
                  or (rr.r_since is not null and cc.created_at >= rr.r_since
                      and exists (select 1 from peers q where q.pid = p.id and q.user_id = cc.author_id and cc.created_at >= q.since)))),
         case when p.author_id = v_uid then aud.audience end,
         case when p.author_id = v_uid then aud.seen end,
         case when p.author_id = v_uid then aud.reach end,
         case when rr.reads_all then 'everyone'
              when exists (select 1 from peers q where q.pid = p.id) then 'group'
              else 'parents' end,
         p.taken_at
  from public.posts p
  join pg on pg.id = p.id
  join public.profiles pr on pr.id = p.author_id
  join public.spaces s on s.id = p.space_id
  cross join lateral (
    select (p.author_id = v_uid
            or s.reply_audience = 'everyone'
            or exists (select 1 from public.space_members sm
                       where sm.space_id = p.space_id and sm.user_id = v_uid and sm.role in ('owner', 'adult')))
             as reads_all,
           array(select sm.user_id from public.space_members sm
                 where sm.space_id = p.space_id and sm.role in ('owner', 'adult')) as parents,
           (select min(greatest(case when cm.widened_at is not null and p.published_at < cm.sees_from_before
                                     then cm.widened_at else cm.added_at end, pa.added_at))
              from public.post_audiences pa
              join public.circles c on c.id = pa.circle_id and c.deleted_at is null
              join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = v_uid
             where pa.post_id = p.id and (cm.sees_from is null or p.published_at >= cm.sees_from)) as r_since
  ) rr
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
                  and p.author_id = v_uid) u              -- one-time filter: skipped for non-authors
          left join public.post_views pv on pv.post_id = p.id and pv.user_id = u.user_id) r
  ) aud on true;
end $$;

-- ---------------------------------------------------------------------------
-- Notices: the publish notice and the sender read the one predicate
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_post_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or new.deleted_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return null; end if;
  insert into public.notification_outbox (recipient_id, post_id, actor_id, kind)
  select sm.user_id, new.id, new.author_id, 'post'::public.notice_kind
  from public.space_members sm
  where sm.space_id = new.space_id and sm.user_id <> new.author_id and private.sees_post(sm.user_id, new.id)
  on conflict do nothing;
  return null;
end $$;

drop function public.claim_notification_batches(timestamptz);
create function public.claim_notification_batches(p_now timestamptz default now())
returns table (
  recipient_id      uuid,
  channel           text,
  actor_names       text[],
  post_ids          uuid[],
  latest_post_id    uuid,
  post_count        int,
  comment_count     int,
  heart_count       int,
  outbox_ids        uuid[],
  push_tokens       text[],
  email             text,
  is_batch          boolean,
  photo_count       int,
  taken_from        timestamptz,
  taken_to          timestamptz
)
language sql security definer set search_path = '' as $$
  with cand as (
    select o.id, o.recipient_id, o.post_id, o.actor_id, o.kind, o.created_at, p.batch_id, p.taken_at,
           ( p.deleted_at is null and p.status = 'published'
             and case when o.kind = 'post' then private.sees_post(o.recipient_id, p.id)
                      else o.recipient_id = p.author_id
                           and exists (select 1 from public.space_members sm
                                       where sm.space_id = p.space_id and sm.user_id = o.recipient_id) end ) as valid,
           coalesce(np.push, true) as want_push,
           coalesce(np.email_digest, 'off') as digest,
           exists (select 1 from public.push_tokens t where t.user_id = o.recipient_id) as has_token
    from public.notification_outbox o
    join public.posts p on p.id = o.post_id
    left join public.notification_prefs np on np.user_id = o.recipient_id and np.space_id = p.space_id
    where o.sent_at is null
      -- BETA-BULK-6: hold an unfinished bulk batch (under 30 minutes old)
      and not (o.kind = 'post' and p.batch_id is not null
               and (select count(*) from public.posts b
                    where b.author_id = p.author_id and b.batch_id = p.batch_id and b.status = 'published') < p.batch_size
               and (select min(o2.created_at) from public.notification_outbox o2
                    join public.posts b2 on b2.id = o2.post_id
                    where b2.author_id = p.author_id and b2.batch_id = p.batch_id and o2.kind = 'post')
                   > p_now - interval '30 minutes')
    for update of o skip locked
  ), classified as (
    select c.*,
           case when not c.valid then 'none'
                when c.want_push and c.has_token then 'push'
                when c.want_push or c.digest <> 'off' then 'email'
                else 'none' end as ch
    from cand c
  ), clock as (
    select (p_now at time zone 'America/New_York') as l
  ), slots as (
    select (case when l >= date_trunc('day', l) + interval '18 hours' then date_trunc('day', l) + interval '18 hours'
                 else date_trunc('day', l) - interval '6 hours' end) at time zone 'America/New_York' as evening,
           (case when l >= date_trunc('day', l) - extract(dow from l) * interval '1 day' + interval '8 hours'
                 then date_trunc('day', l) - extract(dow from l) * interval '1 day' + interval '8 hours'
                 else date_trunc('day', l) - extract(dow from l) * interval '1 day' - interval '7 days' + interval '8 hours'
            end) at time zone 'America/New_York' as sunday
    from clock
  ), windowed as (
    select k.*,
           case when k.ch = 'push' then p_now - interval '10 minutes'
                when k.digest = 'weekly' and not k.want_push then (select sunday from slots)
                else (select evening from slots) end as since
    from classified k
  ), ready as (
    select g.recipient_id, g.ch
    from (select w.recipient_id, w.ch, max(w.since) as since,
                 bool_or(w.ch = 'push' or w.created_at <= w.since) as due
          from windowed w where w.ch <> 'none' group by 1, 2) g
    where g.due
      and not exists (select 1 from public.notification_outbox s
                      where s.recipient_id = g.recipient_id and s.channel = g.ch
                        and s.sent_at >= g.since)
  ), mark as (
    update public.notification_outbox o
    set sent_at = p_now, channel = w.ch
    from windowed w
    where o.id = w.id
      and (w.ch = 'none' or exists (select 1 from ready r where r.recipient_id = w.recipient_id and r.ch = w.ch))
    returning o.id
  )
  select w.recipient_id,
         w.ch,
         array_agg(distinct pr.display_name order by pr.display_name),
         array_agg(distinct w.post_id order by w.post_id),
         (array_agg(w.post_id order by w.created_at desc))[1],
         (count(distinct w.post_id) filter (where w.kind = 'post'))::int,
         (count(*) filter (where w.kind = 'comment'))::int,
         (count(*) filter (where w.kind = 'heart'))::int,
         array_agg(w.id order by w.id),
         case when w.ch = 'push'
              then coalesce((select array_agg(t.expo_token order by t.expo_token)
                             from public.push_tokens t where t.user_id = w.recipient_id), '{}')
              else '{}'::text[] end,
         case when w.ch = 'email' then (select u.email from auth.users u where u.id = w.recipient_id) end,
         coalesce(bool_and(w.batch_id is not null) filter (where w.kind = 'post'), false),
         (select count(*)::int from public.media_items m
           where m.post_id = any (array_agg(w.post_id) filter (where w.kind = 'post'))
             and m.kind = 'photo' and m.upload_status = 'ready'),
         min(w.taken_at) filter (where w.kind = 'post'),
         max(w.taken_at) filter (where w.kind = 'post')
  from windowed w
  join ready r on r.recipient_id = w.recipient_id and r.ch = w.ch
  join public.profiles pr on pr.id = w.actor_id
  group by w.recipient_id, w.ch
$$;

-- ---------------------------------------------------------------------------
-- Setup RPCs (parents only; anyone else gets "not found")
-- ---------------------------------------------------------------------------
create or replace function private.history_from(p_history text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  if p_history is null or p_history not in ('all', 'new') then
    raise exception 'choose "all" or "new" for past photos' using errcode = '23514';
  end if;
  return case when p_history = 'new' then now() end;
end $$;

create or replace function public.create_level(p_space uuid, p_kind text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or not public.is_space_manager(p_space) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_kind is null or p_kind not in ('group', 'household', 'event') then
    raise exception 'kind must be group, household or event (there is one Everyone)' using errcode = '23514';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'a name is 1-60 characters' using errcode = '23514';
  end if;
  if exists (select 1 from public.circles where space_id = p_space and name = v_name) then
    raise exception 'another group already has that name' using errcode = '23514';
  end if;
  insert into public.circles (space_id, name, kind, created_by) values (p_space, v_name, p_kind, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- the container must be live and in a family the caller manages
create or replace function private.managed_circle(p_circle uuid) returns public.circles
language plpgsql stable security definer set search_path = '' as $$
declare c public.circles;
begin
  select * into c from public.circles where id = p_circle and deleted_at is null;
  if c.id is null or auth.uid() is null or not public.is_space_manager(c.space_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return c;
end $$;

create or replace function public.link_level(p_parent uuid, p_child uuid, p_history text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_from timestamptz;
begin
  perform private.managed_circle(p_parent);
  perform private.managed_circle(p_child);
  v_from := private.history_from(p_history);
  insert into public.circle_links (parent_id, child_id, sees_from, added_by)
  values (p_parent, p_child, v_from, auth.uid())
  on conflict (parent_id, child_id) do nothing;
end $$;

create or replace function public.unlink_level(p_parent uuid, p_child uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.managed_circle(p_parent);
  delete from public.circle_links where parent_id = p_parent and child_id = p_child;
end $$;

create or replace function public.place_person(p_household uuid, p_user uuid, p_history text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_from timestamptz;
begin
  perform private.managed_circle(p_household);
  v_from := private.history_from(p_history);
  insert into public.circle_people (circle_id, user_id, sees_from, added_by)
  values (p_household, p_user, v_from, auth.uid())
  on conflict (circle_id, user_id) do nothing;
end $$;

-- Takes a person out of a household; for a group from before 0011 it also removes their direct membership.
create or replace function public.unplace_person(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.managed_circle(p_household);
  delete from public.circle_people where circle_id = p_household and user_id = p_user;
  delete from public.circle_members where circle_id = p_household and user_id = p_user and not derived;
end $$;

-- Retire a container (soft delete; its members lose its posts at once). Parents only. family-setup v2 uses it
-- to retire the v1 groups (a soft delete through a plain UPDATE is refused by RLS: the row stops being visible).
create or replace function public.retire_level(p_circle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.circles := private.managed_circle(p_circle);
begin
  if c.kind = 'everyone' then
    raise exception 'Everyone stays' using errcode = '23514';
  end if;
  update public.circles set deleted_at = now() where id = p_circle;
end $$;

-- ---------------------------------------------------------------------------
-- Invites: a share-history choice for every relative; a relative's invite names one household
-- ---------------------------------------------------------------------------
drop function public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text);
create or replace function public.create_invite(
  p_space uuid, p_role public.member_role, p_circle_ids uuid[],
  p_channel public.invite_channel default 'link', p_target_email text default null,
  p_target_phone text default null, p_ttl interval default interval '7 days', p_max_uses integer default 1,
  p_name text default null, p_history text default null)
returns public.invite_created
language plpgsql security definer set search_path = '' as $$
declare
  v_code  text;
  v_token text := encode(extensions.gen_random_bytes(20), 'hex');     -- 160 bits, for links
  v_id    uuid;
  v_exp   timestamptz := now() + least(p_ttl, interval '30 days');
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';     -- no 0/O/1/I/L/U
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_kind  text;
begin
  if not public.is_space_manager(p_space) then
    raise exception 'only space owners/adults can invite' using errcode = '42501';
  end if;
  if p_role <> 'viewer' and not public.is_space_owner(p_space) then
    raise exception 'only owners can invite owners/adults' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_circle_ids), 0) = 0 then
    raise exception 'invite must place the person in at least one circle' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_circle_ids) cid
             where not exists (select 1 from public.circles c
                               where c.id = cid and c.space_id = p_space and c.deleted_at is null)) then
    raise exception 'circle not in this space' using errcode = '23514';
  end if;
  if p_role = 'viewer' then
    if p_history is null or p_history not in ('all', 'new') then
      raise exception 'choose "all" or "new" for past photos' using errcode = '23514';
    end if;
    -- one household; until 0012 (after the family-setup v2 re-seed) also one group from before 0011
    -- (a group with nothing linked under it)
    select c.kind into v_kind from public.circles c where c.id = p_circle_ids[1];
    if cardinality(p_circle_ids) <> 1
       or not (v_kind = 'household'
               or (v_kind = 'group' and not exists (select 1 from public.circle_links l where l.parent_id = p_circle_ids[1]))) then
      raise exception 'an invite names one household' using errcode = '23514';
    end if;
  elsif p_history is not null and p_history not in ('all', 'new') then
    raise exception 'choose "all" or "new" for past photos' using errcode = '23514';
  end if;
  if p_name is not null and not private.valid_name(p_name) then
    raise exception 'a name is 1-40 characters, not an email address' using errcode = '23514';
  end if;
  if p_name is not null and exists (
       select 1 from public.space_members sm join public.profiles pr on pr.id = sm.user_id
       where sm.space_id = p_space and lower(pr.display_name) = lower(btrim(p_name))) then
    raise exception 'someone in this family already has that name' using errcode = '23514';
  end if;
  select string_agg(substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1), '' order by i)
    into v_code from generate_series(0, 9) i;
  insert into public.invites (space_id, role, channel, code_hash, link_hash, target_email, target_phone,
                              expires_at, max_uses, created_by, invitee_name, history)
  values (p_space, p_role, p_channel, private.invite_hash(v_code), private.invite_hash(v_token),
          lower(p_target_email), p_target_phone, v_exp, p_max_uses, auth.uid(), nullif(btrim(p_name), ''),
          case when p_role = 'viewer' then p_history end)
  returning id into v_id;
  insert into public.invite_circles (invite_id, circle_id) select distinct v_id, unnest(p_circle_ids);
  return (v_id, v_code,
          (select value from private.secrets where name = 'invite_link_base') || v_token,
          v_exp)::public.invite_created;
end $$;

-- An error body with details (the 0002 api_error has none). Same PostgREST behaviour: returned with
-- response.status under PostgREST, raised (with DETAIL) from plain SQL.
create or replace function private.api_error(p_code text, p_message text, p_http integer, p_details text) returns json
language plpgsql set search_path = '' as $$
begin
  if nullif(current_setting('request.method', true), '') is null then
    raise exception using errcode = p_code, message = p_message, detail = coalesce(p_details, '');
  end if;
  perform set_config('response.status', p_http::text, true);
  return json_build_object('code', p_code, 'details', p_details, 'hint', null, 'message', p_message);
end $$;

-- Would redeeming this (live, unused, unexpired) invite place the person somewhere? Parents always (they see
-- everything); a relative needs a live household, or (S-0011-3, until 0012) only live Everyone / groups with
-- nothing under them. One rule for redeem_invite and invite_preview (UX-G7).
create or replace function private.invite_places(p_inv public.invites) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_inv.role <> 'viewer'
      or exists (select 1 from public.invite_circles ic
                 join public.circles c on c.id = ic.circle_id and c.deleted_at is null and c.kind = 'household'
                 where ic.invite_id = p_inv.id)
      or (exists (select 1 from public.invite_circles ic join public.circles c on c.id = ic.circle_id and c.deleted_at is null
                  where ic.invite_id = p_inv.id)
          and not exists (select 1 from public.invite_circles ic join public.circles c on c.id = ic.circle_id
                          where ic.invite_id = p_inv.id
                            and (c.deleted_at is not null or c.kind not in ('everyone', 'group')
                                 or exists (select 1 from public.circle_links l join public.circles k on k.id = l.child_id and k.deleted_at is null
                                            where l.parent_id = c.id))))
$$;

-- UX-G7: the preview refuses (22023) every invite redeem_invite would refuse for the invite's own sake, so a
-- grandparent hears it before typing anything. A live, unused invite that no longer places anyone carries the
-- inviter's name in details ("Ask Chase for a new one."): the preview named them already. Unknown, expired, used
-- and revoked codes stay nameless (BETA-JOIN-3). Who is signed in is never checked here (anon).
create or replace function public.invite_preview(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_keys text[]; v_inv public.invites; v_inviter text; v_space text;
begin
  v_keys := private.rl_keys();
  if private.rl_blocked(v_keys) then
    return private.api_error('54000', 'Too many tries. Wait 10 minutes.', 429);
  end if;
  select i.* into v_inv
  from public.invites i
  join public.spaces s on s.id = i.space_id and s.deleted_at is null
  where (i.code_hash = private.invite_hash(p_code) or i.link_hash = private.invite_hash(p_code))
    and i.revoked_at is null and i.expires_at > now() and i.use_count < i.max_uses;
  if not found then
    perform private.rl_fail(v_keys, 'preview');
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;
  select pr.display_name into v_inviter from public.profiles pr where pr.id = v_inv.created_by;
  if not private.invite_places(v_inv) then
    return private.api_error('22023', 'invite is invalid or expired', 400, v_inviter);
  end if;
  select s.name into v_space from public.spaces s where s.id = v_inv.space_id;
  return json_build_object('inviter_name', v_inviter, 'space_name', v_space);
end $$;

create or replace function public.redeem_invite(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.invites;
  v_user  auth.users;
  v_keys  text[];
  v_ok    boolean;
  v_house uuid;
  v_from  timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_keys := private.rl_keys();
  if private.rl_blocked(v_keys) then
    return private.api_error('54000', 'Too many tries. Wait 10 minutes.', 429);
  end if;
  select * into v_inv from public.invites
   where code_hash = private.invite_hash(p_code) or link_hash = private.invite_hash(p_code)
   for update;
  v_ok := found;
  select * into v_user from auth.users where id = auth.uid();
  if not v_ok or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.use_count >= v_inv.max_uses
     or (v_inv.target_email is not null and lower(coalesce(v_user.email, '')) <> v_inv.target_email)
     or (v_inv.target_phone is not null and coalesce(v_user.phone, '') <> v_inv.target_phone)
     or not exists (select 1 from public.spaces where id = v_inv.space_id and deleted_at is null) then
    perform private.rl_fail(v_keys, 'redeem');
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;

  -- "Only new photos" starts when the invite was made ("from today on")
  v_from := case when v_inv.role = 'viewer' and v_inv.history = 'new' then v_inv.created_at end;
  select ic.circle_id into v_house from public.invite_circles ic
   join public.circles c on c.id = ic.circle_id and c.deleted_at is null and c.kind = 'household'
   where ic.invite_id = v_inv.id limit 1;
  -- S-0011-3 (until 0012): a relative's invite without a household places them straight into the groups it
  -- names. Only while each is still a live Everyone or a group with nothing under it; else the parent's choice
  -- no longer means the same thing (the group was retired, or now holds households): ask for a new invite.
  if not private.invite_places(v_inv) then
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;
  insert into public.space_members (space_id, user_id, role, invited_by, sees_from, in_everyone)
  values (v_inv.space_id, auth.uid(), v_inv.role, v_inv.created_by, v_from, v_house is not null)
  on conflict (space_id, user_id) do nothing;          -- never silently changes an existing role or choice
  if v_house is not null then
    insert into public.circle_people (circle_id, user_id, sees_from, added_by)
    values (v_house, auth.uid(), v_from, v_inv.created_by)
    on conflict do nothing;
  else
    insert into public.circle_members (circle_id, user_id, added_by, sees_from)
    select ic.circle_id, auth.uid(), v_inv.created_by, v_from from public.invite_circles ic
     join public.circles c on c.id = ic.circle_id and c.deleted_at is null
     where ic.invite_id = v_inv.id
    on conflict do nothing;
  end if;
  insert into public.notification_prefs (user_id, space_id, push, email_digest)
  values (auth.uid(), v_inv.space_id, true, case when v_inv.role = 'viewer' then 'weekly'::public.digest_freq else 'off' end)
  on conflict do nothing;
  if v_inv.invitee_name is not null then
    update public.profiles set display_name = v_inv.invitee_name, name_set = true
    where id = auth.uid() and not name_set;
  end if;
  update public.invites set use_count = use_count + 1 where id = v_inv.id;
  return to_json(v_inv.space_id);
end $$;

-- new families get a real Everyone
create or replace function public.create_space(p_household uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_space uuid; v_circle uuid;
begin
  if not public.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  insert into public.spaces (household_id, name, created_by) values (p_household, p_name, auth.uid()) returning id into v_space;
  insert into public.space_members (space_id, user_id, role) values (v_space, auth.uid(), 'owner');
  insert into public.circles (space_id, name, kind, created_by) values (v_space, 'Everyone', 'everyone', auth.uid()) returning id into v_circle;
  insert into public.circle_members (circle_id, user_id, added_by) values (v_circle, auth.uid(), auth.uid());
  insert into public.notification_prefs (user_id, space_id) values (auth.uid(), v_space);
  return v_space;
end $$;

-- ---------------------------------------------------------------------------
-- my_circles: + kind and parent_ids, - replies_shared (REPLY-12). Parents only; relatives get [] (AUD-14).
-- ---------------------------------------------------------------------------
drop function public.my_circles(uuid);
create function public.my_circles(p_space uuid)
returns table (circle_id uuid, name text, member_count integer, member_names text[], kind text, parent_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, count(cm.user_id)::integer,
         coalesce(array_agg(pr.display_name order by pr.display_name) filter (where cm.user_id is not null), '{}'),
         c.kind,
         array(select l.parent_id from public.circle_links l join public.circles pc on pc.id = l.parent_id and pc.deleted_at is null
               where l.child_id = c.id order by l.parent_id)
  from public.circles c
  left join public.circle_members cm on cm.circle_id = c.id
  left join public.profiles pr on pr.id = cm.user_id
  where c.space_id = p_space and c.deleted_at is null
    and p_space = any ((select private.my_managed_space_ids())::uuid[])
  group by c.id, c.name, c.created_at, c.kind
  order by c.created_at, c.name, c.id
$$;

-- ---------------------------------------------------------------------------
-- The 0009 switch is gone (REPLY-12)
-- ---------------------------------------------------------------------------
drop function public.set_group_replies_shared(uuid, boolean);
alter table public.circles drop column replies_shared;

-- ---------------------------------------------------------------------------
-- RLS and grants: links, placements and derived members are written only by triggers and the RPCs
-- ---------------------------------------------------------------------------
alter table public.circle_links  enable row level security;
alter table public.circle_people enable row level security;
create policy circle_links_select on public.circle_links for select to authenticated
  using (parent_id = any ((select private.my_managed_circle_ids())::uuid[]));
create policy circle_people_select on public.circle_people for select to authenticated
  using (user_id = (select auth.uid()) or circle_id = any ((select private.my_managed_circle_ids())::uuid[]));
drop policy circle_members_insert on public.circle_members;
drop policy circle_members_delete on public.circle_members;
revoke all on public.circle_links, public.circle_people from anon, authenticated;
revoke insert, update, delete on public.circle_members from anon, authenticated;
grant select on public.circle_links, public.circle_people to authenticated;
grant all on public.circle_links, public.circle_people to service_role;

revoke execute on function private.link_allowed(text, text), private.tg_link_check(), private.tg_people_check(),
  private.rebuild_members(uuid), private.tg_rebuild_members(), private.sees_post(uuid, uuid),
  private.reply_ok(uuid, uuid, uuid, timestamptz), private.reply_visible(uuid, uuid, timestamptz),
  private.history_from(text), private.managed_circle(uuid), private.tg_members_widen(), private.tg_everyone_stays(),
  private.invite_places(public.invites), private.api_error(text, text, integer, text)
  from public, anon, authenticated;
-- RLS policies on comments and reactions call reply_visible as the app user
grant execute on function private.reply_visible(uuid, uuid, timestamptz) to authenticated;

revoke execute on function public.can(uuid, text), public.can_send_to(uuid), public.reply_readers(uuid),
  public.create_level(uuid, text, text), public.link_level(uuid, uuid, text), public.unlink_level(uuid, uuid),
  public.place_person(uuid, uuid, text), public.unplace_person(uuid, uuid), public.my_circles(uuid),
  public.retire_level(uuid),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text, text),
  public.claim_notification_batches(timestamptz), public.tg_space_member_removed(), public.tg_posts_guard(),
  public.tg_notify_post_published()
  from public, anon, authenticated;
grant execute on function public.can(uuid, text), public.can_send_to(uuid), public.reply_readers(uuid),
  public.create_level(uuid, text, text), public.link_level(uuid, uuid, text), public.unlink_level(uuid, uuid),
  public.place_person(uuid, uuid, text), public.unplace_person(uuid, uuid), public.my_circles(uuid),
  public.retire_level(uuid),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text, text)
  to authenticated, service_role;
grant execute on function public.claim_notification_batches(timestamptz) to service_role;
