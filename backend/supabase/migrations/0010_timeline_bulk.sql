-- 0010: timeline by date taken (BETA-TIME-2..4) and bulk import batches (BETA-BULK-6).
-- * ONE visibility check: private.visible_posts(p_space, ...). get_feed, get_timeline and
--   get_timeline_years all read it; none has its own copy. 0011's share-history cutoff
--   (AUD-20) lands here, once.
-- * ONE row builder: private.feed_rows(post ids) builds the feed row (media, counts, the
--   author-only audience) for both get_feed and get_timeline.
-- * The timeline sorts by sort_at = coalesce(taken_at, published_at). Like feed_at, it is
--   denormalized onto post_audiences (timeline_at) so a page is a few short index scans.
-- * Bulk import: posts from one pick share batch_id/batch_size. Their notices wait for the
--   whole batch (or 30 minutes after the first was queued), then go out as 1 per person.
-- PRIVACY: only taken_at (a date) comes from the phone; no EXIF, GPS or device data is stored.
-- NO CONTENT IS USED FOR AI/ML TRAINING, ADVERTISING OR PROFILING (see 0001 header).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.posts add column batch_id uuid;
alter table public.posts add column batch_size smallint check (batch_size between 1 and 100);
alter table public.posts add constraint posts_batch_both check ((batch_id is null) = (batch_size is null));
-- = coalesce(posts.taken_at, posts.published_at) while published and not deleted, else null
alter table public.post_audiences add column timeline_at timestamptz;

-- ---------------------------------------------------------------------------
-- feed_at / timeline_at maintenance (replaces 0002's trigger functions)
-- ---------------------------------------------------------------------------
create or replace function private.tg_audience_feed_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select case when p.status = 'published' and p.deleted_at is null then p.published_at end,
         case when p.status = 'published' and p.deleted_at is null then coalesce(p.taken_at, p.published_at) end
    into new.feed_at, new.timeline_at from public.posts p where p.id = new.post_id;
  return new;
end $$;

create or replace function private.tg_post_feed_at() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_live_new boolean := new.status = 'published' and new.deleted_at is null;
  v_live_old boolean := old.status = 'published' and old.deleted_at is null;
  v_new  timestamptz := case when v_live_new then new.published_at end;
  v_old  timestamptz := case when v_live_old then old.published_at end;
  v_tnew timestamptz := case when v_live_new then coalesce(new.taken_at, new.published_at) end;
  v_told timestamptz := case when v_live_old then coalesce(old.taken_at, old.published_at) end;
begin
  if v_new is distinct from v_old or v_tnew is distinct from v_told then
    update public.post_audiences set feed_at = v_new, timeline_at = v_tnew where post_id = new.id;
  end if;
  return null;
end $$;
drop trigger post_feed_at on public.posts;
create trigger post_feed_at after update of status, published_at, deleted_at, taken_at on public.posts
  for each row execute function private.tg_post_feed_at();

update public.post_audiences pa set timeline_at = coalesce(p.taken_at, p.published_at)
  from public.posts p
 where p.id = pa.post_id and p.status = 'published' and p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index posts_timeline_idx on public.posts (space_id, (coalesce(taken_at, published_at)) desc, id desc)
  where deleted_at is null and status = 'published';
create index posts_author_timeline_idx on public.posts (author_id, space_id, (coalesce(taken_at, published_at)) desc, id desc)
  where deleted_at is null and status = 'published';
create index post_audiences_timeline_idx on public.post_audiences (circle_id, timeline_at desc, post_id desc)
  where timeline_at is not null;
create index posts_batch_idx on public.posts (author_id, batch_id) where batch_id is not null;

-- ---------------------------------------------------------------------------
-- THE visibility check for lists of posts (feed, timeline, years)
-- ---------------------------------------------------------------------------
-- Published, non-deleted posts in p_space that the caller may see: their own posts, or a
-- post shared to a live group they are in. Same rule as can_view_post for published posts.
-- Not a member of a live space: no rows. p_order 'shared' pages by (published_at, id),
-- 'taken' by (coalesce(taken_at, published_at), id), newest first, p_limit rows (1-50).
-- p_limit null: every visible post, unordered (years list, tests).
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
  v_circles uuid[];
begin
  if v_uid is null or not exists (
       select 1 from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
       where sm.space_id = p_space and sm.user_id = v_uid) then
    return;
  end if;
  -- the caller's live groups in this space
  select coalesce(array_agg(cm.circle_id), '{}') into v_circles
  from public.circle_members cm join public.circles c on c.id = cm.circle_id
  where cm.user_id = v_uid and c.space_id = p_space and c.deleted_at is null;

  if p_limit is null then
    return query
    select p.id, p.published_at, p.taken_at from public.posts p
    where p.space_id = p_space and p.status = 'published' and p.deleted_at is null
      and (p.author_id = v_uid
           or exists (select 1 from public.post_audiences pa where pa.post_id = p.id and pa.circle_id = any (v_circles)));
  elsif p_order = 'shared' then
    return query
    with cand as (
      select x.post_id as pid, x.feed_at as ts
      from unnest(v_circles) circ(id) cross join lateral (
        select pa.post_id, pa.feed_at from public.post_audiences pa
        where pa.circle_id = circ.id and pa.feed_at is not null
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
  elsif p_order = 'taken' then
    return query
    with cand as (
      select x.post_id as pid, x.timeline_at as ts
      from unnest(v_circles) circ(id) cross join lateral (
        select pa.post_id, pa.timeline_at from public.post_audiences pa
        where pa.circle_id = circ.id and pa.timeline_at is not null
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
  else
    raise exception 'order must be shared or taken' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Speed: the per-row privacy helpers become plpgsql (same bodies, same rules)
-- ---------------------------------------------------------------------------
-- A SQL function that can't be inlined (security definer) is re-planned on every call;
-- the feed calls these once per post, heart and comment, which put get_feed at ~50 ms
-- p95 on the 1M-post fixture after 0009. plpgsql caches the plan per session.
create or replace function public.can_view_post(p_post uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select exists (
    select 1
    from public.posts p
    join public.spaces s on s.id = p.space_id and s.deleted_at is null
    where p.id = p_post
      and p.deleted_at is null
      and (
        (p.author_id = auth.uid()        -- a removed author loses their old posts too
         and exists (select 1 from public.space_members am
                     where am.space_id = p.space_id and am.user_id = auth.uid()))
        or (
          p.status = 'published'
          and exists (
            select 1
            from public.post_audiences pa
            join public.circles c        on c.id = pa.circle_id and c.deleted_at is null
            join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = auth.uid()
            join public.space_members sm  on sm.space_id = p.space_id and sm.user_id = auth.uid()
            where pa.post_id = p.id)
        )
      )));
end $$;

create or replace function public.can_see_reply(p_post uuid, p_author uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select public.can_view_post(p_post) and (
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
               where pa.post_id = p_post)));
end $fn$;

create or replace function public.reply_scope(p_post uuid) returns text
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select case
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
    else 'parents' end);
end $fn$;

-- ---------------------------------------------------------------------------
-- THE feed row builder: callers pass only ids that visible_posts returned
-- ---------------------------------------------------------------------------
create or replace function private.feed_rows(p_posts uuid[])
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_id, pr.display_name, p.caption, p.published_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'media_id', m.id, 'kind', m.kind, 'width', m.width, 'height', m.height,
                            'duration_ms', m.duration_ms, 'status', m.upload_status) order by m.position)
                   from public.media_items m
                   where m.post_id = p.id and (m.upload_status = 'ready' or p.author_id = auth.uid())), '[]'::jsonb),
         -- counts show only what this viewer may see (AUD-8): hearts and comments follow the reply rule
         (select count(*)::integer from public.reactions r
           where r.post_id = p.id and public.can_see_reply(p.id, r.user_id)),
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()),
         (select count(*)::integer from public.comments cc
           where cc.post_id = p.id and cc.deleted_at is null and public.can_see_reply(p.id, cc.author_id)),
         case when p.author_id = auth.uid() then aud.audience end,
         case when p.author_id = auth.uid() then aud.seen end,
         case when p.author_id = auth.uid() then aud.reach end,
         public.reply_scope(p.id),
         p.taken_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  left join lateral (
    select (select jsonb_agg(jsonb_build_object(
                     'circle_id', c.id, 'name', c.name,
                     'member_count', (select count(*) from public.circle_members cm2 where cm2.circle_id = c.id))
                   order by c.name, c.id)
            from public.post_audiences pa join public.circles c on c.id = pa.circle_id and c.deleted_at is null
            where pa.post_id = p.id and p.author_id = auth.uid()) as audience,
           r.seen, r.reach
    from (select count(*)::integer as reach, count(pv.user_id)::integer as seen
          from (select distinct cm.user_id
                from public.post_audiences pa
                join public.circles c on c.id = pa.circle_id and c.deleted_at is null
                join public.circle_members cm on cm.circle_id = pa.circle_id
                where pa.post_id = p.id and cm.user_id <> p.author_id
                  and p.author_id = auth.uid()) u              -- one-time filter: skipped for non-authors
          left join public.post_views pv on pv.post_id = p.id and pv.user_id = u.user_id) r
  ) aud on true
  where p.id = any (p_posts) and p.deleted_at is null and p.status = 'published'
$$;

-- ---------------------------------------------------------------------------
-- get_feed (0009's contract plus taken_at, for the "Added from earlier" card), now
-- reading the shared functions
-- ---------------------------------------------------------------------------
drop function public.get_feed(uuid, timestamptz, uuid, integer);
create function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope, f.taken_at
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'shared', p_before_ts, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  order by f.published_at desc, f.post_id desc;
end $$;

-- ---------------------------------------------------------------------------
-- get_timeline: newest taken first (BETA-TIME-2/3)
-- ---------------------------------------------------------------------------
create or replace function public.get_timeline(
  p_space uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text,
               taken_at timestamptz, sort_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope,
         f.taken_at, coalesce(f.taken_at, f.published_at)
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'taken', p_before_at, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  order by coalesce(f.taken_at, f.published_at) desc, f.post_id desc;
end $$;

-- ---------------------------------------------------------------------------
-- get_timeline_years: "Jump to year" (BETA-TIME-4). Year in the phone's zone.
-- ---------------------------------------------------------------------------
create or replace function public.get_timeline_years(p_space uuid, p_tz text default 'UTC')
returns table (year integer, post_count integer, photo_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  begin
    perform now() at time zone coalesce(p_tz, '');
  exception when others then
    raise exception 'unknown time zone' using errcode = '22023';
  end;
  return query
  select extract(year from (coalesce(v.taken_at, v.published_at) at time zone p_tz))::integer as y,
         count(*)::integer,
         coalesce(sum((select count(*) from public.media_items m
                        where m.post_id = v.post_id and m.kind = 'photo' and m.upload_status = 'ready')), 0)::integer
  from private.visible_posts(p_space) v
  group by 1
  order by 1 desc;
end $$;

-- ---------------------------------------------------------------------------
-- create_post: + batch id and size (BETA-BULK-6). Replaces 0002's.
-- ---------------------------------------------------------------------------
drop function public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[]);
create or replace function public.create_post(
  p_client_id uuid, p_space uuid, p_caption text, p_circle_ids uuid[],
  p_taken_at timestamptz default null, p_child_ids uuid[] default '{}',
  p_batch_id uuid default null, p_batch_size integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_post uuid;
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
  -- every circle must be a live circle of this space that the poster can see
  if exists (select 1 from unnest(p_circle_ids) cid
             where not exists (select 1 from public.circles c
                               where c.id = cid and c.space_id = p_space and c.deleted_at is null
                                 and (c.space_id = any (private.my_managed_space_ids())
                                      or c.id = any (private.my_circle_ids())))) then
    raise exception 'circle not found in this space' using errcode = '23514';
  end if;
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

-- ---------------------------------------------------------------------------
-- Sender: + batch notice (BETA-BULK-6). Replaces 0003's claim_notification_batches.
-- ---------------------------------------------------------------------------
-- A post notice from a bulk batch is held while fewer than batch_size posts of that batch
-- are published AND the batch's first notice was queued under 30 minutes ago. Then all of
-- them go out together through the usual windows: 1 notice per person for the batch.
-- New columns: is_batch (every claimed post notice is from a batch), photo_count (ready
-- photos in the claimed posts), taken_from / taken_to (min/max taken_at). Ids, counts and
-- dates only: never a caption, key or URL.
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
             and exists (select 1 from public.space_members sm
                         where sm.space_id = p.space_id and sm.user_id = o.recipient_id)
             and case when o.kind = 'post' then exists (
                        select 1 from public.post_audiences pa
                        join public.circles c on c.id = pa.circle_id and c.deleted_at is null
                        join public.circle_members cm on cm.circle_id = c.id and cm.user_id = o.recipient_id
                        where pa.post_id = p.id)
                      else o.recipient_id = p.author_id end ) as valid,
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
    -- the most recent 6 pm and the most recent Sunday 8 am, Eastern, at or before p_now
    select (case when l >= date_trunc('day', l) + interval '18 hours' then date_trunc('day', l) + interval '18 hours'
                 else date_trunc('day', l) - interval '6 hours' end) at time zone 'America/New_York' as evening,
           (case when l >= date_trunc('day', l) - extract(dow from l) * interval '1 day' + interval '8 hours'
                 then date_trunc('day', l) - extract(dow from l) * interval '1 day' + interval '8 hours'
                 else date_trunc('day', l) - extract(dow from l) * interval '1 day' - interval '7 days' + interval '8 hours'
            end) at time zone 'America/New_York' as sunday
    from clock
  ), windowed as (
    -- since: nothing on this channel may have gone out at or after this moment
    select k.*,
           case when k.ch = 'push' then p_now - interval '10 minutes'
                when k.digest = 'weekly' and not k.want_push then (select sunday from slots)
                else (select evening from slots) end as since
    from classified k
  ), ready as (
    select g.recipient_id, g.ch
    from (select w.recipient_id, w.ch, max(w.since) as since,
                 -- an email goes out at the first slot after a notice was queued
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
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.visible_posts(uuid, text, timestamptz, uuid, integer),
                           private.feed_rows(uuid[])
  from public, anon, authenticated;
revoke execute on function public.get_feed(uuid, timestamptz, uuid, integer),
                           public.get_timeline(uuid, timestamptz, uuid, integer),
                           public.get_timeline_years(uuid, text),
                           public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[], uuid, integer),
                           public.claim_notification_batches(timestamptz)
  from public, anon;
revoke execute on function public.claim_notification_batches(timestamptz) from authenticated;
grant execute on function public.get_feed(uuid, timestamptz, uuid, integer),
                          public.get_timeline(uuid, timestamptz, uuid, integer),
                          public.get_timeline_years(uuid, text),
                          public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[], uuid, integer)
  to authenticated, service_role;
grant execute on function public.claim_notification_batches(timestamptz) to service_role;
