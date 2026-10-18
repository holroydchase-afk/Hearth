-- 0013: groups v2, plain groups with comment settings (docs/product/SPEC-GROUPS.md v2, Oct 18, section 4 and 5).
-- GRP-1..14, FLAG-1..4, EVT-1. Tests: tests/groups_v2_test.sql, tests/grp1/ (before/after snapshot),
-- supabase/functions/sign-media/index_test.ts (FLAG-4).
--
-- * A group is a plain list of people (circle_people, any live non-Everyone kind); circle_members stays DERIVED.
--   circle_links, link_level, unlink_level and link_allowed are kept unchanged; nothing requires a link any more.
-- * circles.comment_mode: 'private' | 'on_group_posts' | 'always'. Decides who reads a member's replies, never
--   who sees a post. Backfill: household -> always, event -> on_group_posts, group and Everyone -> private. That
--   is exactly what 0011's household and event rules did, so nobody's access changes (GRP-1). New circles get
--   the same default by kind (a household is by definition a reply circle; the v2 app makes only groups and
--   events); set_comment_mode (parents only) changes it; Everyone's can't change (AUD-10's owner switch is the one way to
--   open Everyone). App users can't read the column (GRP-13): parents get it
--   from my_circles.
-- * comment_mode_log: every setting with the moment it took effect (trigger-written, clock_timestamp()). A reply is
--   judged by the LEAST OPEN setting the group had at any point from when it was written until now (GRP-7,
--   PRIV-G1): turning a group down narrows at once, turning it up (even back up) never opens older replies.
-- * ONE group rule, private.group_reply_ok, called by reply_ok (RLS, get_comments, can_see_reply,
--   reply_readers), reply_scope and feed_rows (GRP-14). Readers stay fixed when the reply is written.
-- * Feature flags: private.feature_flags (global; no app grant), public.space_features (family add-on; only the
--   owner writes it: can(space, 'family_settings')), can(space, 'use_video'). private.feature_on = all three;
--   my_features for the app. Default off. prepare_media_upload and the media_items insert trigger refuse a video
--   from an app user with 42501 'video_posting_off' unless video_posting is on (FLAG-4, PRIV-G4).
-- * Invites: a person goes in Everyone only if the invite names Everyone. Invites made before 0013 are marked
--   (invites.household_means_everyone = true) and keep 0011's "a household implies Everyone" (PRIV-G2).
-- * Feed and timeline rows carry event_id / event_name only for the event's members and the parents (EVT-1).
-- NO CONTENT IS USED FOR AI/ML TRAINING, ADVERTISING OR PROFILING (see 0001 header).

-- ---------------------------------------------------------------------------
-- comment_mode and its log
-- ---------------------------------------------------------------------------
alter table public.circles add column comment_mode text not null default 'private'
  check (comment_mode in ('private', 'on_group_posts', 'always'));
update public.circles set comment_mode = case kind when 'household' then 'always'
                                                   when 'event' then 'on_group_posts' else 'private' end;

create table public.comment_mode_log (
  id         bigint generated always as identity primary key,
  circle_id  uuid not null references public.circles(id) on delete cascade,
  mode       text not null check (mode in ('private', 'on_group_posts', 'always')),
  set_by     uuid references public.profiles(id) on delete set null,
  set_at     timestamptz not null default clock_timestamp()   -- the moment the row is written, not the txn start
);
create index on public.comment_mode_log (circle_id, set_at);
create index on public.comment_mode_log (set_by);
insert into public.comment_mode_log (circle_id, mode, set_by, set_at)
select id, comment_mode, created_by, created_at from public.circles;

-- PRIV-G1: the LEAST open setting circle p_circle had at any point from p_at until now: the setting in effect at
-- p_at (none logged yet = private), every setting logged since, and p_current (the setting now).
-- Order of openness: private < on_group_posts < always.
create or replace function private.least_open_since(p_circle uuid, p_current text, p_at timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select (array['private', 'on_group_posts', 'always'])[min(r)]
  from (
    select array_position(array['private', 'on_group_posts', 'always'], x.mode) as r
    from (
      select p_current as mode
      union all
      select coalesce((select l.mode from public.comment_mode_log l
                        where l.circle_id = p_circle and l.set_at <= p_at
                        order by l.set_at desc, l.id desc limit 1), 'private')
      union all
      select l.mode from public.comment_mode_log l where l.circle_id = p_circle and l.set_at > p_at
    ) x
  ) y
$$;

-- A new circle starts with the default for its kind, whatever the insert says (only set_comment_mode changes it).
create or replace function private.tg_comment_mode_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.comment_mode := case new.kind when 'household' then 'always' when 'event' then 'on_group_posts' else 'private' end;
  return new;
end $$;
create trigger comment_mode_default before insert on public.circles
  for each row execute function private.tg_comment_mode_default();

create or replace function private.tg_comment_mode_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- a new circle's first setting takes effect when the circle was made (created_at, as the backfill); a change takes
  -- effect when it is logged (clock_timestamp(), not the transaction start: PRIV-G6 narrows the commit race)
  if tg_op = 'INSERT' then
    insert into public.comment_mode_log (circle_id, mode, set_by, set_at) values (new.id, new.comment_mode, auth.uid(), new.created_at);
  elsif new.comment_mode is distinct from old.comment_mode then
    insert into public.comment_mode_log (circle_id, mode, set_by) values (new.id, new.comment_mode, auth.uid());
  end if;
  return null;
end $$;
create trigger comment_mode_log after insert or update of comment_mode on public.circles
  for each row execute function private.tg_comment_mode_log();

-- ---------------------------------------------------------------------------
-- People in any group (was households only)
-- ---------------------------------------------------------------------------
create or replace function private.tg_people_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.circles c where c.id = new.circle_id and c.kind <> 'everyone' and c.deleted_at is null) then
    raise exception 'people go in a live group; Everyone comes from the invite' using errcode = '23514';
  end if;
  if not exists (select 1 from public.circles c join public.space_members sm on sm.space_id = c.space_id and sm.user_id = new.user_id
                 where c.id = new.circle_id) then
    raise exception 'not a member of this family' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.rebuild_members(p_space uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_space is null then return; end if;
  with recursive base as (
    select cp.circle_id, cp.user_id, coalesce(cp.sees_from, '-infinity'::timestamptz) as sf
    from public.circle_people cp
    join public.circles h on h.id = cp.circle_id and h.space_id = p_space and h.kind <> 'everyone' and h.deleted_at is null
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

-- ---------------------------------------------------------------------------
-- THE group reply rule (SPEC-GROUPS v2 section 2; GRP-3..8, GRP-14)
-- ---------------------------------------------------------------------------
-- Does a group let p_reader read what p_writer wrote on p_post at p_at? True when some live group G of the post's
-- family had both of them as members by p_at, and G's effective setting (the least open setting G had at any point
-- from p_at until now: private.least_open_since) is 'always', or is 'on_group_posts' and G was on the post's
-- audience by p_at.
-- Says nothing about seeing the post: callers check that (reply_ok, reply_scope, feed_rows).
create or replace function private.group_reply_ok(p_reader uuid, p_post uuid, p_writer uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.posts p
    join public.circle_members r on r.user_id = p_reader and r.added_at <= p_at
    join public.circles g on g.id = r.circle_id and g.space_id = p.space_id and g.deleted_at is null
                         and g.comment_mode <> 'private'
    join public.circle_members w on w.circle_id = g.id and w.user_id = p_writer and w.added_at <= p_at
    cross join lateral (select private.least_open_since(g.id, g.comment_mode, p_at) as mode) m
    where p.id = p_post
      and (m.mode = 'always'
           or (m.mode = 'on_group_posts'
               and exists (select 1 from public.post_audiences pa
                           where pa.post_id = p.id and pa.circle_id = g.id and pa.added_at <= p_at))))
$$;

-- May p_reader read a reply that p_writer wrote on p_post at p_at? (0011 shape; the household and event blocks
-- are replaced by the one group rule.) Not granted to app users.
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
  -- fixed when the reply was written: the reader could already see the post (through a container that was already
  -- on its audience: S-0011-1; through a membership widened in place, only from the widening: S-0011-6) ...
  select min(greatest(case when cm.widened_at is not null and v_post.published_at < cm.sees_from_before
                           then cm.widened_at else cm.added_at end, pa.added_at)) into v_since
  from public.post_audiences pa
  join public.circles c on c.id = pa.circle_id and c.deleted_at is null
  join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = p_reader
  where pa.post_id = p_post and (cm.sees_from is null or v_post.published_at >= cm.sees_from);
  if v_since is null or v_since > p_at then return false; end if;
  -- ... and a group's comment setting lets them read each other
  return private.group_reply_ok(p_reader, p_post, p_writer, p_at);
end $$;

-- Who reads the caller's replies on this post: 'everyone' (author, parent or the family's setting), 'group' (a
-- group setting lets someone besides the parents and the poster read the next reply), else 'parents'.
-- Agrees with reply_readers (GRP-14).
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
  if exists (select 1 from public.space_members sm
             where sm.space_id = v_post.space_id and sm.user_id <> v_uid and sm.user_id <> v_post.author_id
               and sm.role not in ('owner', 'adult')
               and private.group_reply_ok(sm.user_id, p_post, v_uid, now())
               and private.sees_post(sm.user_id, p_post)) then
    return 'group';
  end if;
  return 'parents';
end $fn$;

-- EVT-1: the event a post was sent to, for a reader who is in it (by a membership whose share-history cutoff the
-- post passes) or is a parent. Nobody else learns the event exists.
create or replace function private.post_event(p_user uuid, p_post uuid)
returns table (event_id uuid, event_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name
  from public.posts p
  join public.post_audiences pa on pa.post_id = p.id
  join public.circles e on e.id = pa.circle_id and e.kind = 'event' and e.deleted_at is null
  where p.id = p_post
    and (exists (select 1 from public.space_members sm where sm.space_id = p.space_id and sm.user_id = p_user
                 and sm.role in ('owner', 'adult'))
         or exists (select 1 from public.circle_members cm where cm.circle_id = e.id and cm.user_id = p_user
                    and (cm.sees_from is null or p.published_at >= cm.sees_from)))
  order by e.created_at, e.id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Feed / timeline rows: the group rule through group_reply_ok (was a household/event copy), + event_id/name
-- ---------------------------------------------------------------------------
-- A reply by W written at t is counted for the caller R when R reads everything on the post (author, parent, the
-- family's setting), or W is R, the post's author or a parent, or t is at or after the moment R could first see the
-- post and group_reply_ok(R, post, W, t). Same as reply_ok for a post R sees (GRP-14 checks it). reply_scope is
-- reply_scope's rule, inlined (AUD-8 perf: feed_rows never calls reply_scope or can_see_reply per row).
drop function public.get_feed(uuid, timestamptz, uuid, integer);
drop function public.get_timeline(uuid, timestamptz, uuid, integer);
drop function private.feed_rows(uuid[]);
create function private.feed_rows(p_posts uuid[])
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz,
               event_id uuid, event_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  return query
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
                      and private.group_reply_ok(v_uid, p.id, r.user_id, r.created_at)))),
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = v_uid),
         (select count(*)::integer from public.comments cc
           where cc.post_id = p.id and cc.deleted_at is null
             and (rr.reads_all or cc.author_id = v_uid or cc.author_id = p.author_id or cc.author_id = any (rr.parents)
                  or (rr.r_since is not null and cc.created_at >= rr.r_since
                      and private.group_reply_ok(v_uid, p.id, cc.author_id, cc.created_at)))),
         case when p.author_id = v_uid then aud.audience end,
         case when p.author_id = v_uid then aud.seen end,
         case when p.author_id = v_uid then aud.reach end,
         case when rr.reads_all then 'everyone'
              when exists (select 1 from public.space_members sm
                           where sm.space_id = p.space_id and sm.user_id <> v_uid and sm.user_id <> p.author_id
                             and sm.role not in ('owner', 'adult')
                             and private.group_reply_ok(sm.user_id, p.id, v_uid, now())
                             and private.sees_post(sm.user_id, p.id)) then 'group'
              else 'parents' end,
         p.taken_at,
         ev.event_id,
         ev.event_name
  from public.posts p
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
  left join lateral private.post_event(v_uid, p.id) ev on true
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
  ) aud on true
  where p.id = any (p_posts) and p.deleted_at is null and p.status = 'published';
end $$;

create function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text, taken_at timestamptz,
               event_id uuid, event_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope, f.taken_at, f.event_id, f.event_name
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'shared', p_before_ts, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  order by f.published_at desc, f.post_id desc;
end $$;

create function public.get_timeline(
  p_space uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer, reply_scope text,
               taken_at timestamptz, sort_at timestamptz, event_id uuid, event_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  select f.post_id, f.author_id, f.author_name, f.caption, f.published_at, f.media, f.heart_count, f.i_hearted,
         f.comment_count, f.audience, f.seen_count, f.reach_count, f.reply_scope,
         f.taken_at, coalesce(f.taken_at, f.published_at), f.event_id, f.event_name
  from private.feed_rows(array(
         select v.post_id from private.visible_posts(p_space, 'taken', p_before_at, p_before_id,
                                                     least(greatest(coalesce(p_limit, 20), 1), 50)) v)) f
  order by coalesce(f.taken_at, f.published_at) desc, f.post_id desc;
end $$;

-- ---------------------------------------------------------------------------
-- Setup RPCs: comment setting, place in any group, copy people
-- ---------------------------------------------------------------------------
create or replace function public.set_comment_mode(p_circle uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.circles := private.managed_circle(p_circle);   -- parents only; else "not found"
begin
  if c.kind = 'everyone' then
    raise exception 'Everyone''s comment setting stays Private (the owner''s reply setting opens it)' using errcode = '23514';
  end if;
  if p_mode is null or p_mode not in ('private', 'on_group_posts', 'always') then
    raise exception 'comment setting must be private, on_group_posts or always' using errcode = '23514';
  end if;
  update public.circles set comment_mode = p_mode where id = p_circle and comment_mode is distinct from p_mode;
end $$;

drop function public.place_person(uuid, uuid, text);
create function public.place_person(p_group uuid, p_user uuid, p_history text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.circles := private.managed_circle(p_group); v_from timestamptz;
begin
  v_from := private.history_from(p_history);
  if c.kind = 'everyone' then
    raise exception 'people join Everyone through an invite' using errcode = '23514';
  end if;
  insert into public.circle_people (circle_id, user_id, sees_from, added_by)
  values (p_group, p_user, v_from, auth.uid())
  on conflict (circle_id, user_id) do nothing;
end $$;

-- GRP-11: copy (not link) every relative now in p_source into p_target, with one share-history choice.
-- Parents are not copied (they see and read everything already). Someone added to p_source later is not added.
create or replace function public.add_people_from(p_target uuid, p_source uuid, p_history text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.circles := private.managed_circle(p_target); s public.circles := private.managed_circle(p_source);
        v_from timestamptz;
begin
  v_from := private.history_from(p_history);
  if t.space_id <> s.space_id then
    raise exception 'both must be in the same family' using errcode = '23514';
  end if;
  if t.kind = 'everyone' then
    raise exception 'people join Everyone through an invite' using errcode = '23514';
  end if;
  insert into public.circle_people (circle_id, user_id, sees_from, added_by)
  select p_target, cm.user_id, v_from, auth.uid()
  from public.circle_members cm
  join public.space_members sm on sm.space_id = t.space_id and sm.user_id = cm.user_id and sm.role = 'viewer'
  where cm.circle_id = p_source
  on conflict (circle_id, user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Invites to any groups (GRP-12)
-- ---------------------------------------------------------------------------
-- PRIV-G2: set once, when the invite is made. Every invite that exists when 0013 runs gets true (0011's rule: a
-- household implies Everyone); every invite made after gets false (Everyone only when named). Not granted to app users.
alter table public.invites add column household_means_everyone boolean not null default true;
alter table public.invites alter column household_means_everyone set default false;

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
  if p_role = 'viewer' and (p_history is null or p_history not in ('all', 'new')) then
    raise exception 'choose "all" or "new" for past photos' using errcode = '23514';
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

-- Would redeeming this invite place the person where the parent chose? Parents always (they see everything); a
-- relative needs every group the invite names to still be live (UX-G7: a retired one means "ask for a new one").
create or replace function private.invite_places(p_inv public.invites) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_inv.role <> 'viewer'
      or (exists (select 1 from public.invite_circles ic where ic.invite_id = p_inv.id)
          and not exists (select 1 from public.invite_circles ic join public.circles c on c.id = ic.circle_id
                          where ic.invite_id = p_inv.id and c.deleted_at is not null))
$$;

create or replace function public.redeem_invite(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.invites;
  v_user  auth.users;
  v_keys  text[];
  v_ok    boolean;
  v_all   boolean;
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
  if not private.invite_places(v_inv) then
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;

  -- "Only new photos" starts when the invite was made ("from today on")
  v_from := case when v_inv.role = 'viewer' and v_inv.history = 'new' then v_inv.created_at end;
  -- Everyone when the invite names it, or (an invite made before 0013, PRIV-G2) names a household
  select exists (select 1 from public.invite_circles ic
                 join public.circles c on c.id = ic.circle_id and c.deleted_at is null
                 where ic.invite_id = v_inv.id
                   and (c.kind = 'everyone' or (v_inv.household_means_everyone and c.kind = 'household'))) into v_all;
  insert into public.space_members (space_id, user_id, role, invited_by, sees_from, in_everyone)
  values (v_inv.space_id, auth.uid(), v_inv.role, v_inv.created_by, v_from, v_all)
  on conflict (space_id, user_id) do nothing;          -- never silently changes an existing role or choice
  -- one placement per named live group (memberships are derived from it; no direct circle_members rows)
  insert into public.circle_people (circle_id, user_id, sees_from, added_by)
  select ic.circle_id, auth.uid(), v_from, v_inv.created_by from public.invite_circles ic
   join public.circles c on c.id = ic.circle_id and c.deleted_at is null and c.kind <> 'everyone'
   where ic.invite_id = v_inv.id
  on conflict do nothing;
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

-- ---------------------------------------------------------------------------
-- my_circles: + comment_mode (parents only; relatives still get [] : AUD-14, GRP-13)
-- ---------------------------------------------------------------------------
drop function public.my_circles(uuid);
create function public.my_circles(p_space uuid)
returns table (circle_id uuid, name text, member_count integer, member_names text[], kind text, parent_ids uuid[],
               comment_mode text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, count(cm.user_id)::integer,
         coalesce(array_agg(pr.display_name order by pr.display_name) filter (where cm.user_id is not null), '{}'),
         c.kind,
         array(select l.parent_id from public.circle_links l join public.circles pc on pc.id = l.parent_id and pc.deleted_at is null
               where l.child_id = c.id order by l.parent_id),
         c.comment_mode
  from public.circles c
  left join public.circle_members cm on cm.circle_id = c.id
  left join public.profiles pr on pr.id = cm.user_id
  where c.space_id = p_space and c.deleted_at is null
    and p_space = any ((select private.my_managed_space_ids())::uuid[])
  group by c.id, c.name, c.created_at, c.kind, c.comment_mode
  order by c.created_at, c.name, c.id
$$;

-- ---------------------------------------------------------------------------
-- Feature flags (SPEC-GROUPS v2 section 5): three switches, all must be on; default off
-- ---------------------------------------------------------------------------
create table private.feature_flags (
  feature  text primary key check (feature ~ '^[a-z][a-z0-9_]{0,39}$'),
  enabled  boolean not null default false
);
create table public.space_features (
  space_id  uuid not null references public.spaces(id) on delete cascade,
  feature   text not null check (feature ~ '^[a-z][a-z0-9_]{0,39}$'),
  enabled   boolean not null default false,
  set_by    uuid references public.profiles(id) on delete set null,
  set_at    timestamptz not null default now(),
  primary key (space_id, feature)
);
create index on public.space_features (set_by);

create or replace function private.tg_space_features_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.set_by := coalesce(auth.uid(), new.set_by);
  new.set_at := now();
  return new;
end $$;
create trigger space_features_stamp before insert or update on public.space_features
  for each row execute function private.tg_space_features_stamp();

alter table public.space_features enable row level security;
create policy space_features_select on public.space_features for select to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[]));
-- writes: the owner only (can(space, 'family_settings'); PRIV-G5). Both parents can read.
create policy space_features_insert on public.space_features for insert to authenticated
  with check (public.can(space_id, 'family_settings'));
create policy space_features_update on public.space_features for update to authenticated
  using (public.can(space_id, 'family_settings'))
  with check (public.can(space_id, 'family_settings'));

-- capabilities: + use_video (parents only to start)
create or replace function public.can(p_space uuid, p_capability text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role := public.space_role(p_space);
begin
  if p_capability is null or p_capability not in ('post', 'send_to_everyone', 'make_events', 'invite', 'set_up_family',
                                                  'family_settings', 'use_video') then
    raise exception 'unknown capability' using errcode = '22023';
  end if;
  if v_role is null then return false; end if;
  return case p_capability
    when 'post' then public.can_post_in_space(p_space)
    when 'family_settings' then v_role = 'owner'
    else v_role in ('owner', 'adult') end;
end $$;

-- the capability a feature needs (null = unknown feature: off)
create or replace function private.feature_capability(p_feature text) returns text
language sql immutable set search_path = '' as $$
  select case p_feature when 'video_posting' then 'use_video' end
$$;

-- Is p_feature on for the caller (auth.uid()) in p_space? Global switch AND family add-on AND can(capability).
create or replace function private.feature_on(p_space uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_cap text := private.feature_capability(p_feature);
begin
  if p_space is null or v_cap is null or auth.uid() is null then return false; end if;
  return coalesce((select f.enabled from private.feature_flags f where f.feature = p_feature), false)
     and coalesce((select sf.enabled from public.space_features sf where sf.space_id = p_space and sf.feature = p_feature), false)
     and public.can(p_space, v_cap);
end $$;

-- The features on for the caller in this family (the app reads this at start).
create or replace function public.my_features(p_space uuid) returns table (feature text)
language sql stable security definer set search_path = '' as $$
  select f.feature from private.feature_flags f where private.feature_on(p_space, f.feature) order by f.feature
$$;

-- PRIV-G4: the media insert trigger (0001) refuses a video from an app user (auth.uid() set) while video_posting
-- is off for them, so a direct table insert gets the same 42501 'video_posting_off' as prepare_media_upload.
-- Server-side writes (service role, seed: no auth.uid()) are not app uploads and are not checked.
create or replace function public.tg_media_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_space   uuid;
  v_plan    public.plan_tier;
  v_month   date;
  v_count   integer;
  v_now_m   date := (date_trunc('month', now() at time zone 'utc'))::date;
begin
  select p.space_id into v_space from public.posts p where p.id = new.post_id;
  new.space_id    := v_space;
  new.uploader_id := coalesce(auth.uid(), (select author_id from public.posts where id = new.post_id));
  new.id          := coalesce(new.id, gen_random_uuid());
  new.display_key := format('s/%s/p/%s/m/%s/display', v_space, new.post_id, new.id);
  new.thumb_key   := format('s/%s/p/%s/m/%s/thumb',   v_space, new.post_id, new.id);
  new.upload_status := 'pending';

  if new.kind = 'video' then
    if auth.uid() is not null and not private.feature_on(v_space, 'video_posting') then
      raise exception 'video_posting_off' using errcode = '42501';
    end if;
    select plan, videos_month, videos_this_month into v_plan, v_month, v_count
      from public.spaces where id = v_space for update;      -- serializes concurrent uploads
    if v_month <> v_now_m then v_count := 0; end if;
    if public.plan_video_cap(v_plan) is not null and v_count >= public.plan_video_cap(v_plan) then
      raise exception 'free_video_cap_reached'
        using errcode = 'P0001',
              hint = format('Free spaces can upload %s videos per month.', public.plan_video_cap(v_plan));
    end if;
    -- Counts attempts, not survivors: deleting a video does not refund the month.
    update public.spaces set videos_month = v_now_m, videos_this_month = v_count + 1 where id = v_space;
  end if;
  return new;
end $$;

-- FLAG-4: the upload RPC sign-media calls refuses a video while video_posting is off for the caller's family.
create or replace function public.prepare_media_upload(p_post uuid, p_items jsonb)
returns table (media_id uuid, item_index integer, kind public.media_kind, display_key text, thumb_key text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v_idx  integer := 0;
  v_base integer;
  v_row  public.media_items;
  v_space uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'items must be an array of 1..20' using errcode = '22023';
  end if;
  select space_id into v_space from public.posts where id = p_post;
  if not public.is_post_author(p_post) or not public.can_post_in_space(v_space) then
    raise exception 'cannot upload to this post' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where i->>'kind' = 'video')
     and not exists (select 1 from public.my_features(v_space) f where f.feature = 'video_posting') then
    raise exception 'video_posting_off' using errcode = '42501';
  end if;
  select coalesce(max(position) + 1, 0) into v_base from public.media_items where post_id = p_post;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.media_items (post_id, space_id, uploader_id, position, kind, mime_type,
        display_key, thumb_key, width, height, duration_ms, byte_size, thumb_byte_size, exif_stripped)
    values (p_post, '00000000-0000-0000-0000-000000000000', auth.uid(), v_base + v_idx,
        (v_item->>'kind')::public.media_kind, v_item->>'mime_type', 'pending', 'pending',
        (v_item->>'width')::integer, (v_item->>'height')::integer, (v_item->>'duration_ms')::integer,
        (v_item->>'byte_size')::bigint, (v_item->>'thumb_byte_size')::bigint,
        coalesce((v_item->>'exif_stripped')::boolean, false))
    returning * into v_row;
    media_id := v_row.id; item_index := v_idx; kind := v_row.kind;
    display_key := v_row.display_key; thumb_key := v_row.thumb_key;
    return next;
    v_idx := v_idx + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
-- GRP-13: app users can't read comment_mode from circles (parents get it from my_circles). Column grants
-- (every column but comment_mode); RLS on circles is unchanged.
revoke select on public.circles from anon, authenticated;
grant select (id, space_id, name, created_by, created_at, updated_at, deleted_at, kind, starts_on, ends_on)
  on public.circles to authenticated;
-- inserts can't pick a setting (the trigger sets the default for the kind anyway)
revoke insert on public.circles from anon, authenticated;
grant insert (id, space_id, name, created_by, created_at, updated_at, deleted_at, kind, starts_on, ends_on)
  on public.circles to authenticated;

alter table public.comment_mode_log enable row level security;
create policy comment_mode_log_select on public.comment_mode_log for select to authenticated
  using (circle_id = any ((select private.my_managed_circle_ids())::uuid[]));
revoke all on public.comment_mode_log from anon, authenticated;
grant select on public.comment_mode_log to authenticated;
grant all on public.comment_mode_log to service_role;

revoke all on private.feature_flags from public, anon, authenticated;
grant all on private.feature_flags to service_role;
revoke all on public.space_features from anon, authenticated;
grant select, insert (space_id, feature, enabled), update (enabled) on public.space_features to authenticated;
grant all on public.space_features to service_role;

revoke execute on function private.least_open_since(uuid, text, timestamptz), private.tg_comment_mode_default(), private.tg_comment_mode_log(),
  private.group_reply_ok(uuid, uuid, uuid, timestamptz), private.post_event(uuid, uuid), private.feed_rows(uuid[]),
  private.feature_capability(text), private.feature_on(uuid, text), private.tg_space_features_stamp(),
  private.tg_people_check(), private.rebuild_members(uuid), private.reply_ok(uuid, uuid, uuid, timestamptz),
  private.invite_places(public.invites)
  from public, anon, authenticated;

revoke execute on function public.set_comment_mode(uuid, text), public.place_person(uuid, uuid, text),
  public.add_people_from(uuid, uuid, text), public.my_circles(uuid), public.my_features(uuid),
  public.get_feed(uuid, timestamptz, uuid, integer), public.get_timeline(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.set_comment_mode(uuid, text), public.place_person(uuid, uuid, text),
  public.add_people_from(uuid, uuid, text), public.my_circles(uuid), public.my_features(uuid),
  public.get_feed(uuid, timestamptz, uuid, integer), public.get_timeline(uuid, timestamptz, uuid, integer)
  to authenticated, service_role;
