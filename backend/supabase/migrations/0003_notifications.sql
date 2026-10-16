-- 0003: notification outbox + sender support (AE-2).
-- Triggers queue one outbox row per recipient on publish / comment / heart.
-- The `notify` edge function (cron, service_role) calls claim_notification_batches(),
-- sends through Expo Push or Resend, and calls release_notifications() on failure.
-- PRIVACY: the outbox and the claim output hold ids, counts and the actor's FIRST
-- NAME only. Never a caption, comment body, child's name, media key or URL.

create type public.notice_kind as enum ('post', 'comment', 'heart');

create table public.notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  post_id       uuid not null references public.posts(id) on delete cascade,
  actor_id      uuid not null references public.profiles(id) on delete cascade,
  kind          public.notice_kind not null,
  channel       text check (channel in ('push', 'email', 'none')),   -- set when claimed
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
-- one pending notice per (recipient, post, kind, actor): heart on/off/on queues 1
create unique index notification_outbox_pending_uq
  on public.notification_outbox (recipient_id, post_id, kind, actor_id) where sent_at is null;
create index on public.notification_outbox (recipient_id, channel, sent_at desc) where sent_at is not null;
create index on public.notification_outbox (post_id);
create index on public.notification_outbox (recipient_id);
create index on public.notification_outbox (actor_id);

alter table public.notification_outbox enable row level security;   -- no policies: service_role only
revoke all on public.notification_outbox from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Queue triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_post_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or new.deleted_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return null; end if;
  insert into public.notification_outbox (recipient_id, post_id, actor_id, kind)
  select distinct cm.user_id, new.id, new.author_id, 'post'::public.notice_kind
  from public.post_audiences pa
  join public.circles c         on c.id = pa.circle_id and c.deleted_at is null
  join public.circle_members cm on cm.circle_id = c.id
  join public.space_members sm  on sm.space_id = new.space_id and sm.user_id = cm.user_id
  where pa.post_id = new.id and cm.user_id <> new.author_id
  on conflict do nothing;
  return null;
end $$;
create trigger notify_post_published after insert or update of status on public.posts
  for each row execute function public.tg_notify_post_published();

-- comments and hearts notify the post's author, never the person reacting
create or replace function public.tg_notify_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_kind public.notice_kind;
begin
  if tg_table_name = 'comments' then v_actor := new.author_id; v_kind := 'comment';
  else v_actor := new.user_id; v_kind := 'heart'; end if;
  insert into public.notification_outbox (recipient_id, post_id, actor_id, kind)
  select p.author_id, p.id, v_actor, v_kind
  from public.posts p
  where p.id = new.post_id and p.author_id <> v_actor
    and p.status = 'published' and p.deleted_at is null
    and exists (select 1 from public.space_members sm where sm.space_id = p.space_id and sm.user_id = p.author_id)
  on conflict do nothing;
  return null;
end $$;
create trigger notify_comment after insert on public.comments
  for each row execute function public.tg_notify_reaction();
create trigger notify_heart after insert on public.reactions
  for each row execute function public.tg_notify_reaction();

-- ---------------------------------------------------------------------------
-- Sender (service_role only)
-- ---------------------------------------------------------------------------
-- Claims every pending notice that may go out at p_now and marks it sent.
-- Batching (BETA-NOTIFY-4): one row per (recipient, channel). A recipient gets at
-- most one push per 10 minutes; anything newer waits and goes out together.
-- Email goes out when the Help screen promises (Eastern time; the POC family is all
-- in WV/NC): daily = once each evening from 6 pm, weekly = once from Sunday 8 am.
-- Channel: push if wanted and a phone is registered; else email if a digest is
-- chosen or push was wanted but no phone exists; else 'none' (closed, not sent).
-- Access is re-checked at claim time: someone removed from the group gets nothing.
create or replace function public.claim_notification_batches(p_now timestamptz default now())
returns table (
  recipient_id      uuid,
  channel           text,
  actor_first_names text[],
  post_ids          uuid[],
  latest_post_id    uuid,
  post_count        int,
  comment_count     int,
  heart_count       int,
  outbox_ids        uuid[],
  push_tokens       text[],
  email             text
)
language sql security definer set search_path = '' as $$
  with cand as (
    select o.id, o.recipient_id, o.post_id, o.actor_id, o.kind, o.created_at,
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
         array_agg(distinct split_part(pr.display_name, ' ', 1) order by split_part(pr.display_name, ' ', 1)),
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
         case when w.ch = 'email' then (select u.email from auth.users u where u.id = w.recipient_id) end
  from windowed w
  join ready r on r.recipient_id = w.recipient_id and r.ch = w.ch
  join public.profiles pr on pr.id = w.actor_id
  group by w.recipient_id, w.ch
$$;

-- A send failed: put those notices back so the next run retries them.
create or replace function public.release_notifications(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox set sent_at = null, channel = null where id = any(p_ids)
$$;

-- Expo reported DeviceNotRegistered: stop sending to that phone.
create or replace function public.forget_push_tokens(p_tokens text[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where expo_token = any(p_tokens)
$$;

-- ---------------------------------------------------------------------------
-- App RPCs (API.md)
-- ---------------------------------------------------------------------------
-- Save this phone's Expo token for the caller. A shared phone follows whoever
-- signed in last, so it never shows someone else's notices.
create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'not an Expo push token' using errcode = '23514';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'platform must be ios, android or web' using errcode = '23514';
  end if;
  insert into public.push_tokens (user_id, expo_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (expo_token) do update set user_id = excluded.user_id, platform = excluded.platform;
end $$;

create or replace function public.set_notification_prefs(p_space uuid, p_push boolean, p_email_digest text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
                 where sm.space_id = p_space and sm.user_id = auth.uid()) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_push is null or p_email_digest is null or p_email_digest not in ('off', 'daily', 'weekly') then
    raise exception 'email choice must be off, daily or weekly' using errcode = '23514';
  end if;
  insert into public.notification_prefs (user_id, space_id, push, email_digest)
  values (auth.uid(), p_space, p_push, p_email_digest::public.digest_freq)
  on conflict (user_id, space_id) do update set push = excluded.push, email_digest = excluded.email_digest;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_notification_batches(timestamptz),
                           public.release_notifications(uuid[]),
                           public.forget_push_tokens(text[]),
                           public.register_push_token(text, text),
                           public.set_notification_prefs(uuid, boolean, text),
                           public.tg_notify_post_published(),
                           public.tg_notify_reaction()
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text),
                          public.set_notification_prefs(uuid, boolean, text)
  to authenticated;
grant execute on function public.claim_notification_batches(timestamptz),
                          public.release_notifications(uuid[]),
                          public.forget_push_tokens(text[])
  to service_role;
grant select, insert, update, delete on public.notification_outbox to service_role;
