-- =============================================================================
-- Hearth: initial schema
-- =============================================================================
-- NO CONTENT IN THIS DATABASE (photos, videos, captions, comments, reactions,
-- names, faces, or any metadata derived from them) IS USED FOR AI/ML TRAINING,
-- ADVERTISING, PROFILING, OR SOLD/SHARED WITH THIRD PARTIES. This schema has no
-- ad, tracking, analytics-identifier, face/feature-vector, or ML columns, and
-- new ones must not be added without a privacy review.
--
-- Media bytes never live here. They live in Backblaze B2 (US-East), encrypted
-- with a per-item data key (DEK) before upload. The DEK is stored here only in
-- wrapped form (public.media_keys, service-role only) under a key-encryption
-- key held as an Edge Function secret. Deleting a media_keys row crypto-shreds
-- the blob even before the purge worker deletes it from B2.
--
-- Access model (enforced by RLS on every table):
--   * A space belongs to a household. Split families = two households = two
--     spaces; a child can be linked to both without either side seeing the
--     other's circles.
--   * A post is visible to its author, and to members of at least one circle
--     in its audience (post_audiences), and nobody else - not even space owners.
--   * Changing post_audiences changes visibility on the next query.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role    as enum ('owner', 'adult', 'viewer');
create type public.household_role as enum ('admin', 'adult');
create type public.post_status    as enum ('draft', 'published');
create type public.media_kind     as enum ('photo', 'video');
create type public.upload_status  as enum ('pending', 'ready', 'failed');
create type public.digest_freq    as enum ('off', 'daily', 'weekly');
create type public.plan_tier      as enum ('free', 'family');
create type public.invite_channel as enum ('link', 'code', 'email', 'sms');
create type public.export_status  as enum ('requested', 'processing', 'ready', 'expired', 'failed');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  avatar_key    text,                       -- B2 key, same signing path as media
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                 -- account deletion requested
);

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         public.household_role not null default 'adult',
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.spaces (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  viewers_can_post      boolean not null default false,
  viewers_can_comment   boolean not null default true,   -- also gates reactions
  -- Billing: written only by the billing webhook (service_role); see grants.
  plan                  public.plan_tier not null default 'free',
  plan_status           text check (plan_status in ('active','trialing','past_due','canceled')),
  plan_provider         text check (plan_provider in ('apple','google','stripe')),
  plan_customer_ref     text,
  plan_period_end       timestamptz,
  -- Free-tier video cap bookkeeping (maintained by trigger on media_items).
  videos_month          date not null default (date_trunc('month', now() at time zone 'utc'))::date,
  videos_this_month     integer not null default 0 check (videos_this_month >= 0),
  created_by            uuid not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.space_members (
  space_id    uuid not null references public.spaces(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.member_role not null,
  invited_by  uuid references public.profiles(id) on delete set null,
  joined_at   timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (space_id, name)
);

create table public.circle_members (
  circle_id  uuid not null references public.circles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- Children are first-class so one child can be linked into both households'
-- spaces. Linking a child grants nothing by itself; posts are still
-- audience-gated.
create table public.children (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (char_length(display_name) between 1 and 80),
  birth_date    date,      -- optional; shown to guardians only (see RLS)
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.child_guardians (
  child_id   uuid not null references public.children(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (child_id, user_id)
);

create table public.space_children (
  space_id  uuid not null references public.spaces(id) on delete cascade,
  child_id  uuid not null references public.children(id) on delete cascade,
  added_by  uuid references public.profiles(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (space_id, child_id)
);

create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  role          public.member_role not null default 'viewer',
  channel       public.invite_channel not null default 'link',
  code_hash     text not null unique,        -- sha256(code); plaintext only returned once
  target_email  text,                        -- if set, redeemer's auth email must match
  target_phone  text,                        -- if set, redeemer's auth phone must match
  expires_at    timestamptz not null,
  max_uses      integer not null default 1 check (max_uses between 1 and 100),
  use_count     integer not null default 0 check (use_count >= 0),
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check (expires_at > created_at)
);

create table public.invite_circles (
  invite_id  uuid not null references public.invites(id) on delete cascade,
  circle_id  uuid not null references public.circles(id) on delete cascade,
  primary key (invite_id, circle_id)
);

create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  caption         text check (char_length(caption) <= 2000),
  taken_at        timestamptz,
  status          public.post_status not null default 'draft',
  published_at    timestamptz,
  media_count     integer not null default 0,
  reaction_count  integer not null default 0,
  comment_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- The audience. One row per circle. Visibility = membership in any of these.
create table public.post_audiences (
  post_id    uuid not null references public.posts(id) on delete cascade,
  circle_id  uuid not null references public.circles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (post_id, circle_id)
);

create table public.post_children (
  post_id   uuid not null references public.posts(id) on delete cascade,
  child_id  uuid not null references public.children(id) on delete cascade,
  primary key (post_id, child_id)
);

-- PRIVACY: clients MUST strip EXIF/GPS/XMP/maker-notes (photos) and container
-- location atoms (videos) BEFORE encrypting and uploading. The server only sees
-- ciphertext and cannot verify this, so the uploader must attest it via
-- exif_stripped, and the CHECK constraint refuses any row without the
-- attestation. Object keys are derived by trigger and clients cannot choose them.
create table public.media_items (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.posts(id) on delete cascade,
  space_id         uuid not null references public.spaces(id) on delete cascade,  -- denormalized by trigger
  uploader_id      uuid not null references public.profiles(id) on delete cascade, -- set by trigger
  position         smallint not null default 0 check (position between 0 and 99),
  kind             public.media_kind not null,
  mime_type        text not null check (mime_type in
                     ('image/jpeg','image/heic','image/webp','image/png','video/mp4','video/quicktime')),
  display_key      text not null unique,
  thumb_key        text not null unique,
  width            integer not null check (width between 1 and 16384),
  height           integer not null check (height between 1 and 16384),
  duration_ms      integer check (duration_ms between 1 and 1800000),
  byte_size        bigint  not null check (byte_size between 1 and 2147483648),  -- display variant (ciphertext)
  thumb_byte_size  bigint  not null check (thumb_byte_size between 1 and 10485760),
  exif_stripped    boolean not null check (exif_stripped),
  enc_scheme       text not null default 'aes-256-gcm-chunked-v1',
  upload_status    public.upload_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((kind = 'video') = (duration_ms is not null)),
  check ((kind = 'video') = (mime_type like 'video/%')),   -- no "photos" that are really videos (cap bypass)
  unique (post_id, position)
);

-- Wrapped per-item data keys. No client policy exists, so only service_role can read them.
create table public.media_keys (
  media_id     uuid primary key references public.media_items(id) on delete cascade,
  wrapped_dek  bytea not null,
  kek_version  smallint not null default 1,
  created_at   timestamptz not null default now()
);

create table public.reactions (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 8),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (post_id, user_id)        -- one reaction per person per post
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- "Seen by" receipts. Always recorded; readable by the author only on the family plan.
create table public.post_views (
  post_id        uuid not null references public.posts(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.notification_prefs (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  space_id      uuid not null references public.spaces(id) on delete cascade,
  push          boolean not null default true,
  email_digest  public.digest_freq not null default 'off',
  sms_link      boolean not null default false,   -- SMS with a link only, never media
  updated_at    timestamptz not null default now(),
  primary key (user_id, space_id)
);

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null check (platform in ('ios','android','web')),
  created_at  timestamptz not null default now()
);

create table public.account_exports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        public.export_status not null default 'requested',
  archive_key   text,                 -- B2 key of the zip, built by a worker
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  expires_at    timestamptz
);

-- B2 objects to delete. Filled by triggers. A worker running as service_role drains it.
create table public.storage_purge_queue (
  id           bigint generated always as identity primary key,
  object_key   text not null,
  reason       text not null,
  enqueued_at  timestamptz not null default now(),
  purged_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.household_members (user_id);
create index on public.spaces (household_id);
create index on public.space_members (user_id);
create index on public.circles (space_id);
create index on public.circle_members (user_id);
create index on public.child_guardians (user_id);
create index on public.space_children (child_id);
create index on public.invites (space_id);
create index on public.invite_circles (circle_id);
create index posts_feed_idx on public.posts (space_id, published_at desc) where deleted_at is null and status = 'published';
create index on public.posts (author_id);
create index on public.posts (deleted_at) where deleted_at is not null;
create index on public.post_audiences (circle_id);
create index on public.post_children (child_id);
create index on public.media_items (space_id);
create index on public.media_items (upload_status, created_at) where upload_status <> 'ready';
create index on public.reactions (user_id);
create index on public.comments (post_id, created_at);
create index on public.comments (author_id);
create index on public.post_views (user_id);
create index on public.notification_prefs (space_id);
create index on public.push_tokens (user_id);
create index on public.account_exports (user_id);
create index on public.storage_purge_queue (enqueued_at) where purged_at is null;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.space_role(p_space uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select sm.role
  from public.space_members sm
  join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  where sm.space_id = p_space and sm.user_id = auth.uid()
$$;

create or replace function public.is_space_member(p_space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.space_role(p_space) is not null
$$;

-- owner or adult: same-household grown-ups who manage circles/invites
create or replace function public.is_space_manager(p_space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.space_role(p_space) in ('owner','adult'), false)
$$;

create or replace function public.is_space_owner(p_space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.space_role(p_space) = 'owner', false)
$$;

create or replace function public.can_post_in_space(p_space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case r when 'viewer' then s.viewers_can_post else true end
       from (select public.space_role(p_space) as r) x, public.spaces s
      where s.id = p_space and x.r is not null), false)
$$;

create or replace function public.can_comment_in_space(p_space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case r when 'viewer' then s.viewers_can_comment else true end
       from (select public.space_role(p_space) as r) x, public.spaces s
      where s.id = p_space and x.r is not null), false)
$$;

create or replace function public.is_household_member(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members
                 where household_id = p_household and user_id = auth.uid())
$$;

create or replace function public.is_circle_member(p_circle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members cm
    join public.circles c on c.id = cm.circle_id and c.deleted_at is null
    join public.space_members sm on sm.space_id = c.space_id and sm.user_id = cm.user_id
    where cm.circle_id = p_circle and cm.user_id = auth.uid())
$$;

-- Managers see every circle in their space. Everyone else sees only circles
-- they belong to. This is what keeps a co-parent from seeing "Mom's side".
create or replace function public.can_see_circle(p_circle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circles c
    where c.id = p_circle and c.deleted_at is null
      and (public.is_space_manager(c.space_id) or public.is_circle_member(c.id)))
$$;

create or replace function public.is_child_guardian(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.child_guardians
                 where child_id = p_child and user_id = auth.uid())
$$;

-- THE core rule. Used by RLS and by the sign-media Edge Function.
create or replace function public.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
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
      ))
$$;

create or replace function public.is_post_author(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts p
                 join public.space_members sm on sm.space_id = p.space_id and sm.user_id = auth.uid()
                 where p.id = p_post and p.author_id = auth.uid() and p.deleted_at is null)
$$;

-- You may see a profile (name/avatar) if: it's you; you share a space and either
-- of you is a manager; you share a circle; or they interacted on a post you can see.
create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
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
             where c.author_id = p_user and c.deleted_at is null and public.can_view_post(c.post_id))
  or exists (select 1 from public.reactions r
             where r.user_id = p_user and public.can_view_post(r.post_id))
$$;

create or replace function public.plan_video_cap(p_plan public.plan_tier) returns integer
language sql immutable set search_path = '' as $$
  select case p_plan when 'free' then 10 else null end   -- null = unlimited
$$;

-- ---------------------------------------------------------------------------
-- Triggers: integrity, counters, updated_at
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles           for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.households         for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.spaces             for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.circles            for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.children           for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.posts              for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.media_items        for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.comments           for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.reactions          for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.notification_prefs for each row execute function public.tg_set_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''),
                           split_part(coalesce(new.email, new.phone, 'Member'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- circle members must be members of the circle's space
create or replace function public.tg_circle_member_in_space() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.circles c
                 join public.space_members sm on sm.space_id = c.space_id and sm.user_id = new.user_id
                 where c.id = new.circle_id) then
    raise exception 'user % is not a member of this circle''s space', new.user_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger circle_member_in_space before insert or update on public.circle_members
  for each row execute function public.tg_circle_member_in_space();

-- leaving/removal from a space drops all of that space's circle memberships
create or replace function public.tg_space_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.circle_members cm using public.circles c
   where cm.circle_id = c.id and c.space_id = old.space_id and cm.user_id = old.user_id;
  delete from public.notification_prefs where space_id = old.space_id and user_id = old.user_id;
  return old;
end $$;
create trigger space_member_removed after delete on public.space_members
  for each row execute function public.tg_space_member_removed();

-- never leave a live space without an owner
create or replace function public.tg_keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.spaces where id = old.space_id and deleted_at is null)
     and not exists (select 1 from public.space_members
                     where space_id = old.space_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'a space must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_an_owner before update or delete on public.space_members
  for each row execute function public.tg_keep_an_owner();

-- posts: space_id / author_id are immutable; publish timestamps
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
  return new;
end $$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function public.tg_posts_guard();

-- audience circles must belong to the post's space
create or replace function public.tg_audience_same_space() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.posts p join public.circles c on c.space_id = p.space_id
                 where p.id = new.post_id and c.id = new.circle_id and c.deleted_at is null) then
    raise exception 'audience circle must belong to the post''s space' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger audience_same_space before insert or update on public.post_audiences
  for each row execute function public.tg_audience_same_space();

-- a published post must always have >=1 audience circle (checked at commit)
create or replace function public.tg_published_has_audience() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_post uuid;
begin
  if tg_table_name = 'posts' then v_post := new.id; else v_post := old.post_id; end if;
  if exists (select 1 from public.posts where id = v_post and status = 'published' and deleted_at is null)
     and not exists (select 1 from public.post_audiences where post_id = v_post) then
    raise exception 'a published post needs at least one audience circle' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger published_has_audience after delete on public.post_audiences
  deferrable initially deferred for each row execute function public.tg_published_has_audience();
create constraint trigger published_has_audience after insert or update of status on public.posts
  deferrable initially deferred for each row execute function public.tg_published_has_audience();

-- tagged children must be linked to the post's space
create or replace function public.tg_post_child_linked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.posts p join public.space_children sc
                   on sc.space_id = p.space_id and sc.child_id = new.child_id
                 where p.id = new.post_id) then
    raise exception 'child is not linked to this space' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger post_child_linked before insert on public.post_children
  for each row execute function public.tg_post_child_linked();

-- media: derive space/uploader/object keys server-side; enforce free-tier video cap
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
create trigger media_before_insert before insert on public.media_items
  for each row execute function public.tg_media_before_insert();

create or replace function public.tg_media_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.post_id, new.space_id, new.uploader_id, new.display_key, new.thumb_key, new.kind)
     is distinct from (old.post_id, old.space_id, old.uploader_id, old.display_key, old.thumb_key, old.kind) then
    raise exception 'media identity columns are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger media_immutable before update on public.media_items
  for each row execute function public.tg_media_immutable();

-- when a media row is hard-deleted, queue its blobs for deletion
create or replace function public.tg_media_enqueue_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_purge_queue (object_key, reason)
  values (old.display_key, 'media_deleted'), (old.thumb_key, 'media_deleted');
  return old;
end $$;
create trigger media_enqueue_purge after delete on public.media_items
  for each row execute function public.tg_media_enqueue_purge();

-- counters
create or replace function public.tg_post_counters() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_post  uuid := coalesce(new.post_id, old.post_id);
  v_delta integer;
  v_col   text := tg_argv[0];
begin
  if tg_op = 'INSERT' then v_delta := 1;
  elsif tg_op = 'DELETE' then v_delta := -1;
  else v_delta := 0;
  end if;
  -- comments are soft-deletable; only live comments count
  if tg_table_name = 'comments' then
    if tg_op = 'INSERT' then
      if new.deleted_at is not null then v_delta := 0; end if;
    elsif tg_op = 'DELETE' then
      if old.deleted_at is not null then v_delta := 0; end if;
    else
      if old.deleted_at is null and new.deleted_at is not null then v_delta := -1;
      elsif old.deleted_at is not null and new.deleted_at is null then v_delta := 1; end if;
    end if;
  end if;
  if v_delta <> 0 then
    execute format('update public.posts set %I = greatest(%I + $1, 0) where id = $2', v_col, v_col)
      using v_delta, v_post;
  end if;
  return null;
end $$;
create trigger media_count    after insert or delete on public.media_items for each row execute function public.tg_post_counters('media_count');
create trigger reaction_count after insert or delete on public.reactions   for each row execute function public.tg_post_counters('reaction_count');
create trigger comment_count  after insert or delete or update of deleted_at on public.comments
  for each row execute function public.tg_post_counters('comment_count');

-- the creator of a child record is its first guardian
create or replace function public.tg_child_creator_guardian() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.child_guardians (child_id, user_id, added_by) values (new.id, new.created_by, new.created_by);
  return new;
end $$;
create trigger child_creator_guardian after insert on public.children
  for each row execute function public.tg_child_creator_guardian();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.spaces              enable row level security;
alter table public.space_members       enable row level security;
alter table public.circles             enable row level security;
alter table public.circle_members      enable row level security;
alter table public.children            enable row level security;
alter table public.child_guardians     enable row level security;
alter table public.space_children      enable row level security;
alter table public.invites             enable row level security;
alter table public.invite_circles      enable row level security;
alter table public.posts               enable row level security;
alter table public.post_audiences      enable row level security;
alter table public.post_children       enable row level security;
alter table public.media_items         enable row level security;
alter table public.media_keys          enable row level security;   -- no policies: service_role only
alter table public.reactions           enable row level security;
alter table public.comments            enable row level security;
alter table public.post_views          enable row level security;
alter table public.notification_prefs  enable row level security;
alter table public.push_tokens         enable row level security;
alter table public.account_exports     enable row level security;
alter table public.storage_purge_queue enable row level security;   -- no policies: service_role only

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (deleted_at is null and public.can_see_profile(id) or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- households
create policy households_select on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (exists (select 1 from public.household_members
                 where household_id = id and user_id = auth.uid() and role = 'admin'));

create policy household_members_select on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
create policy household_members_insert on public.household_members for insert to authenticated
  with check (exists (select 1 from public.household_members hm
                      where hm.household_id = household_members.household_id
                        and hm.user_id = auth.uid() and hm.role = 'admin'));
create policy household_members_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.household_members hm
                    where hm.household_id = household_members.household_id
                      and hm.user_id = auth.uid() and hm.role = 'admin'));

-- spaces (created via create_space(); billing columns are not grantable)
create policy spaces_select on public.spaces for select to authenticated
  using (deleted_at is null and public.is_space_member(id));
create policy spaces_update on public.spaces for update to authenticated
  using (public.is_space_owner(id)) with check (true);

-- space_members: managers see everyone; others see themselves + the space's grown-ups
create policy space_members_select on public.space_members for select to authenticated
  using (user_id = auth.uid()
         or public.is_space_manager(space_id)
         or (public.is_space_member(space_id) and role in ('owner','adult')));
create policy space_members_update on public.space_members for update to authenticated
  using (public.is_space_owner(space_id)) with check (public.is_space_owner(space_id));
create policy space_members_delete on public.space_members for delete to authenticated
  using (user_id = auth.uid()
         or public.is_space_owner(space_id)
         or (public.is_space_manager(space_id) and role = 'viewer'));
-- inserts happen only through create_space() / redeem_invite()

-- circles
create policy circles_select on public.circles for select to authenticated
  using (public.can_see_circle(id));
create policy circles_insert on public.circles for insert to authenticated
  with check (public.is_space_manager(space_id) and created_by = auth.uid());
create policy circles_update on public.circles for update to authenticated
  using (public.is_space_manager(space_id)) with check (public.is_space_manager(space_id));

create policy circle_members_select on public.circle_members for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.circles c where c.id = circle_id and public.is_space_manager(c.space_id)));
create policy circle_members_insert on public.circle_members for insert to authenticated
  with check (exists (select 1 from public.circles c where c.id = circle_id and public.is_space_manager(c.space_id)));
create policy circle_members_delete on public.circle_members for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.circles c where c.id = circle_id and public.is_space_manager(c.space_id)));

-- children
-- Linking grants nothing: non-guardians see a child only as a space manager or
-- because the child is tagged on a post they can see.
create policy children_select on public.children for select to authenticated
  using (public.is_child_guardian(id)
         or exists (select 1 from public.space_children sc
                    where sc.child_id = id and public.is_space_manager(sc.space_id))
         or exists (select 1 from public.post_children pc
                    where pc.child_id = id and public.can_view_post(pc.post_id)));
create policy children_insert on public.children for insert to authenticated
  with check (created_by = auth.uid());
create policy children_update on public.children for update to authenticated
  using (public.is_child_guardian(id)) with check (public.is_child_guardian(id));

create policy child_guardians_select on public.child_guardians for select to authenticated
  using (public.is_child_guardian(child_id));
create policy child_guardians_insert on public.child_guardians for insert to authenticated
  with check (public.is_child_guardian(child_id));
create policy child_guardians_delete on public.child_guardians for delete to authenticated
  using (user_id = auth.uid());

-- a child link is visible only inside that space
create policy space_children_select on public.space_children for select to authenticated
  using (public.is_space_manager(space_id)
         or (public.is_space_member(space_id)
             and (public.is_child_guardian(child_id)
                  or exists (select 1 from public.post_children pc join public.posts p on p.id = pc.post_id
                             where pc.child_id = space_children.child_id and p.space_id = space_children.space_id
                               and public.can_view_post(p.id)))));
create policy space_children_insert on public.space_children for insert to authenticated
  with check (public.is_space_manager(space_id) and public.is_child_guardian(child_id));
create policy space_children_delete on public.space_children for delete to authenticated
  using (public.is_space_manager(space_id) or public.is_child_guardian(child_id));

-- invites (created via create_invite(); redeemed via redeem_invite())
create policy invites_select on public.invites for select to authenticated
  using (public.is_space_manager(space_id));
create policy invites_update on public.invites for update to authenticated
  using (public.is_space_manager(space_id)) with check (public.is_space_manager(space_id));
create policy invite_circles_select on public.invite_circles for select to authenticated
  using (exists (select 1 from public.invites i where i.id = invite_id and public.is_space_manager(i.space_id)));

-- posts
-- The author_id branch is required (not just an optimization): INSERT ... RETURNING
-- checks this policy against the new row, which can_view_post()'s snapshot can't see yet.
create policy posts_select on public.posts for select to authenticated
  using ((author_id = auth.uid() and deleted_at is null and public.is_space_member(space_id))
         or public.can_view_post(id));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'draft' and deleted_at is null
              and public.can_post_in_space(space_id));
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid());

-- audience: the author manages it; viewers see only the circles they can see
create policy post_audiences_select on public.post_audiences for select to authenticated
  using (public.is_post_author(post_id)
         or (public.can_view_post(post_id) and public.can_see_circle(circle_id)));
create policy post_audiences_insert on public.post_audiences for insert to authenticated
  with check (public.is_post_author(post_id));
create policy post_audiences_delete on public.post_audiences for delete to authenticated
  using (public.is_post_author(post_id));

create policy post_children_select on public.post_children for select to authenticated
  using (public.can_view_post(post_id));
create policy post_children_insert on public.post_children for insert to authenticated
  with check (public.is_post_author(post_id));
create policy post_children_delete on public.post_children for delete to authenticated
  using (public.is_post_author(post_id));

-- media metadata (bytes are in B2 and need a URL from sign-media)
create policy media_items_select on public.media_items for select to authenticated
  using (public.can_view_post(post_id) and (upload_status = 'ready' or uploader_id = auth.uid()));
create policy media_items_insert on public.media_items for insert to authenticated
  with check (public.is_post_author(post_id)
              and public.can_post_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy media_items_delete on public.media_items for delete to authenticated
  using (public.is_post_author(post_id));

-- reactions
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_view_post(post_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_post(post_id)
              and public.can_comment_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- comments
create policy comments_select on public.comments for select to authenticated
  using (deleted_at is null and public.can_view_post(post_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and deleted_at is null and public.can_view_post(post_id)
              and public.can_comment_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() and deleted_at is null and public.can_view_post(post_id))
  with check (author_id = auth.uid() and public.can_view_post(post_id));

-- seen-by receipts
create policy post_views_select on public.post_views for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.posts p join public.spaces s on s.id = p.space_id
                    where p.id = post_id and p.author_id = auth.uid() and s.plan = 'family'));
create policy post_views_insert on public.post_views for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy post_views_update on public.post_views for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_post(post_id));

-- per-member notification preferences
create policy notification_prefs_all on public.notification_prefs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy account_exports_select on public.account_exports for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.households (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  insert into public.household_members (household_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create or replace function public.create_space(p_household uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_space uuid; v_circle uuid;
begin
  if not public.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  insert into public.spaces (household_id, name, created_by) values (p_household, p_name, auth.uid()) returning id into v_space;
  insert into public.space_members (space_id, user_id, role) values (v_space, auth.uid(), 'owner');
  insert into public.circles (space_id, name, created_by) values (v_space, 'Everyone', auth.uid()) returning id into v_circle;
  insert into public.circle_members (circle_id, user_id, added_by) values (v_circle, auth.uid(), auth.uid());
  insert into public.notification_prefs (user_id, space_id) values (auth.uid(), v_space);
  return v_space;
end $$;

-- Returns the plaintext code ONCE. Only sha256(code) is stored.
create or replace function public.create_invite(
  p_space uuid, p_role public.member_role, p_circle_ids uuid[],
  p_channel public.invite_channel default 'link', p_target_email text default null,
  p_target_phone text default null, p_ttl interval default interval '7 days', p_max_uses integer default 1)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_id   uuid;
  v_exp  timestamptz := now() + least(p_ttl, interval '30 days');
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';   -- no 0/O/1/I/L/U
  v_bytes bytea := extensions.gen_random_bytes(10);
begin
  if not public.is_space_manager(p_space) then
    raise exception 'only space owners/adults can invite' using errcode = '42501';
  end if;
  if p_role <> 'viewer' and not public.is_space_owner(p_space) then
    raise exception 'only owners can invite owners/adults' using errcode = '42501';
  end if;
  if coalesce(array_length(p_circle_ids, 1), 0) = 0 then
    raise exception 'invite must place the person in at least one circle' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_circle_ids) cid
             where not exists (select 1 from public.circles c
                               where c.id = cid and c.space_id = p_space and c.deleted_at is null)) then
    raise exception 'circle not in this space' using errcode = '23514';
  end if;
  select string_agg(substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1), '' order by i)
    into v_code from generate_series(0, 9) i;
  insert into public.invites (space_id, role, channel, code_hash, target_email, target_phone,
                              expires_at, max_uses, created_by)
  values (p_space, p_role, p_channel, encode(extensions.digest(v_code, 'sha256'), 'hex'),
          lower(p_target_email), p_target_phone, v_exp, p_max_uses, auth.uid())
  returning id into v_id;
  insert into public.invite_circles (invite_id, circle_id) select v_id, unnest(p_circle_ids);
  return query select v_id, v_code, v_exp;
end $$;

create or replace function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.invites;
  v_user  auth.users;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_inv from public.invites
   where code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
   for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or v_inv.use_count >= v_inv.max_uses then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  select * into v_user from auth.users where id = auth.uid();
  if v_inv.target_email is not null and lower(coalesce(v_user.email, '')) <> v_inv.target_email then
    raise exception 'invite was sent to a different email' using errcode = '42501';
  end if;
  if v_inv.target_phone is not null and coalesce(v_user.phone, '') <> v_inv.target_phone then
    raise exception 'invite was sent to a different phone' using errcode = '42501';
  end if;

  insert into public.space_members (space_id, user_id, role, invited_by)
  values (v_inv.space_id, auth.uid(), v_inv.role, v_inv.created_by)
  on conflict (space_id, user_id) do nothing;          -- never silently changes an existing role
  insert into public.circle_members (circle_id, user_id, added_by)
  select ic.circle_id, auth.uid(), v_inv.created_by from public.invite_circles ic
   join public.circles c on c.id = ic.circle_id and c.deleted_at is null
   where ic.invite_id = v_inv.id
  on conflict do nothing;
  insert into public.notification_prefs (user_id, space_id, push, email_digest)
  values (auth.uid(), v_inv.space_id, true, case when v_inv.role = 'viewer' then 'weekly'::public.digest_freq else 'off' end)
  on conflict do nothing;
  update public.invites set use_count = use_count + 1 where id = v_inv.id;
  return v_inv.space_id;
end $$;

create or replace function public.create_post(
  p_space uuid, p_caption text, p_circle_ids uuid[], p_child_ids uuid[] default '{}', p_taken_at timestamptz default null)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_post uuid;
begin
  if coalesce(array_length(p_circle_ids, 1), 0) = 0 then
    raise exception 'choose at least one circle' using errcode = '23514';
  end if;
  insert into public.posts (space_id, author_id, caption, taken_at)
  values (p_space, auth.uid(), p_caption, p_taken_at) returning id into v_post;
  insert into public.post_audiences (post_id, circle_id) select v_post, unnest(p_circle_ids);
  insert into public.post_children (post_id, child_id) select v_post, unnest(p_child_ids);
  return v_post;
end $$;

-- Replace a post's audience atomically. Access changes on the next query;
-- media URLs already issued live at most 10 minutes (see README).
create or replace function public.set_post_audience(p_post uuid, p_circle_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_post_author(p_post) then
    raise exception 'only the author can change the audience' using errcode = '42501';
  end if;
  if coalesce(array_length(p_circle_ids, 1), 0) = 0 then
    raise exception 'choose at least one circle' using errcode = '23514';
  end if;
  delete from public.post_audiences where post_id = p_post and circle_id <> all (p_circle_ids);
  insert into public.post_audiences (post_id, circle_id)
  select p_post, unnest(p_circle_ids) on conflict do nothing;
end $$;

create or replace function public.publish_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_post_author(p_post) then
    raise exception 'only the author can publish' using errcode = '42501';
  end if;
  if not public.can_post_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'you cannot post in this space' using errcode = '42501';
  end if;
  if exists (select 1 from public.media_items where post_id = p_post and upload_status <> 'ready')
     or not exists (select 1 from public.media_items where post_id = p_post) then
    raise exception 'all media must finish uploading first' using errcode = '23514';
  end if;
  update public.posts set status = 'published' where id = p_post and status = 'draft';
end $$;

-- Called by sign-media (with the user's JWT) before it mints PUT URLs.
-- Runs as invoker so RLS + the video-cap trigger apply.
create or replace function public.prepare_media_upload(p_post uuid, p_items jsonb)
returns table (media_id uuid, item_index integer, kind public.media_kind, display_key text, thumb_key text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v_idx  integer := 0;
  v_base integer;
  v_row  public.media_items;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'items must be an array of 1..20' using errcode = '22023';
  end if;
  if not public.is_post_author(p_post)
     or not public.can_post_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'cannot upload to this post' using errcode = '42501';
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

-- service_role only: sign-media's finalize step reports the HEAD-checked result
create or replace function public.mark_media_upload_result(p_media uuid, p_ok boolean) returns void
language sql security definer set search_path = '' as $$
  update public.media_items set upload_status = case when p_ok then 'ready'::public.upload_status
                                                     else 'failed'::public.upload_status end
  where id = p_media and upload_status = 'pending'
$$;

create or replace function public.space_upload_quota(p_space uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_space_member(p_space) then null else
    jsonb_build_object(
      'plan', s.plan,
      'video_cap', public.plan_video_cap(s.plan),
      -- the count reflects uploads to circles the caller may not be in: posters only
      'videos_this_month', case when not public.can_post_in_space(p_space) then null
                                when s.videos_month = (date_trunc('month', now() at time zone 'utc'))::date
                                then s.videos_this_month else 0 end,
      'can_post', public.can_post_in_space(p_space))
    || case when public.is_space_owner(p_space) then
         jsonb_build_object('plan_status', s.plan_status, 'plan_provider', s.plan_provider,
                            'plan_period_end', s.plan_period_end)
       else '{}'::jsonb end
  end
  from public.spaces s where s.id = p_space
$$;

create or replace function public.delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.comments c set deleted_at = now()
   where c.id = p_comment and c.deleted_at is null
     and (c.author_id = auth.uid() or public.is_post_author(c.post_id));
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- Birth dates are guardian-only (the column is not client-readable).
create or replace function public.child_birth_date(p_child uuid) returns date
language sql stable security definer set search_path = '' as $$
  select c.birth_date from public.children c where c.id = p_child and public.is_child_guardian(c.id)
$$;

-- Everything we hold about the caller as JSON. Media bytes are fetched by the
-- export worker through the same signing path.
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'households', (select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('role', hm.role)), '[]')
                   from public.household_members hm join public.households h on h.id = hm.household_id
                   where hm.user_id = auth.uid()),
    'spaces',   (select coalesce(jsonb_agg(jsonb_build_object('space_id', sm.space_id, 'name', s.name, 'role', sm.role,
                   'circles', (select coalesce(jsonb_agg(c.name), '[]') from public.circle_members cm
                               join public.circles c on c.id = cm.circle_id
                               where cm.user_id = auth.uid() and c.space_id = sm.space_id))), '[]')
                 from public.space_members sm join public.spaces s on s.id = sm.space_id
                 where sm.user_id = auth.uid()),
    'posts',    (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
                   'audience', (select coalesce(jsonb_agg(c.name), '[]') from public.post_audiences pa
                                join public.circles c on c.id = pa.circle_id where pa.post_id = p.id),
                   'media', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind,
                                'display_key', m.display_key, 'width', m.width, 'height', m.height,
                                'duration_ms', m.duration_ms, 'byte_size', m.byte_size)), '[]')
                             from public.media_items m where m.post_id = p.id))), '[]')
                 from public.posts p where p.author_id = auth.uid()),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comments c where c.author_id = auth.uid()),
    'reactions',(select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reactions r where r.user_id = auth.uid()),
    'notification_prefs', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from public.notification_prefs n where n.user_id = auth.uid())
  )
$$;

create or replace function public.request_account_export() returns uuid
language sql security definer set search_path = '' as $$
  insert into public.account_exports (user_id) values (auth.uid()) returning id
$$;

-- Soft-deletes the account now: posts and comments are hidden, memberships and
-- push tokens are removed. purge_soft_deleted() hard-deletes it later. The
-- auth.users row is removed by the worker via the Auth admin API.
create or replace function public.request_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  update public.posts set deleted_at = now() where author_id = auth.uid() and deleted_at is null;
  update public.comments set deleted_at = now() where author_id = auth.uid() and deleted_at is null;
  delete from public.reactions where user_id = auth.uid();
  delete from public.push_tokens where user_id = auth.uid();
  delete from public.space_members sm where sm.user_id = auth.uid()
    and not (sm.role = 'owner' and not exists (select 1 from public.space_members o
              where o.space_id = sm.space_id and o.role = 'owner' and o.user_id <> auth.uid()));
  update public.profiles set deleted_at = now() where id = auth.uid();
end $$;

-- Hard purge job (pg_cron, daily). service_role / postgres only.
create or replace function public.purge_soft_deleted(p_retention interval default interval '30 days')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_posts integer; v_comments integer; v_spaces integer; v_media integer; v_invites integer; v_profiles integer;
  v_cut timestamptz := now() - p_retention;
begin
  delete from public.spaces   where deleted_at < v_cut;                    get diagnostics v_spaces = row_count;
  delete from public.posts    where deleted_at < v_cut;                    get diagnostics v_posts = row_count;
  delete from public.comments where deleted_at < v_cut;                    get diagnostics v_comments = row_count;
  delete from public.media_items where upload_status <> 'ready'
                               and created_at < now() - interval '1 day'; get diagnostics v_media = row_count;
  delete from public.invites  where expires_at < v_cut or revoked_at < v_cut; get diagnostics v_invites = row_count;
  delete from public.profiles where deleted_at < v_cut;                    get diagnostics v_profiles = row_count;
  return jsonb_build_object('spaces', v_spaces, 'posts', v_posts, 'comments', v_comments,
                            'abandoned_media', v_media, 'invites', v_invites, 'profiles', v_profiles);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: least privilege. anon gets nothing. Column-level UPDATE grants keep
-- billing, counters, status, and keys out of the client's reach.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on all tables in schema public to authenticated;
revoke select on public.media_keys, public.storage_purge_queue from authenticated;
-- Billing details and the video counter would tell a co-parent/grandparent about the
-- household's activity and payments; owners get them from space_upload_quota().
revoke select on public.spaces from authenticated;
grant select (id, household_id, name, viewers_can_post, viewers_can_comment, plan,
              created_by, created_at, updated_at, deleted_at) on public.spaces to authenticated;
-- Birth dates: guardians use child_birth_date().
revoke select on public.children from authenticated;
grant select (id, display_name, created_by, created_at, updated_at) on public.children to authenticated;

grant update (display_name, avatar_key)                          on public.profiles to authenticated;
grant update (name)                                              on public.households to authenticated;
grant insert, delete                                             on public.household_members to authenticated;
grant update (name, viewers_can_post, viewers_can_comment, deleted_at) on public.spaces to authenticated;
grant update (role), delete                                      on public.space_members to authenticated;
grant insert, update (name, deleted_at)                          on public.circles to authenticated;
grant insert, delete                                             on public.circle_members to authenticated;
grant insert, update (display_name, birth_date)                  on public.children to authenticated;
grant insert, delete                                             on public.child_guardians to authenticated;
grant insert, delete                                             on public.space_children to authenticated;
grant update (revoked_at)                                        on public.invites to authenticated;
grant insert (space_id, author_id, caption, taken_at),
      update (caption, taken_at, deleted_at)                     on public.posts to authenticated;
grant insert, delete                                             on public.post_audiences to authenticated;
grant insert, delete                                             on public.post_children to authenticated;
grant insert (post_id, position, kind, mime_type, width, height, duration_ms, byte_size,
              thumb_byte_size, exif_stripped, display_key, thumb_key, space_id, uploader_id),
      delete                                                     on public.media_items to authenticated;
grant insert, update (emoji), delete                             on public.reactions to authenticated;
grant insert (post_id, author_id, body), update (body)           on public.comments to authenticated;
grant insert, update (last_seen_at)                              on public.post_views to authenticated;
grant insert, update (push, email_digest, sms_link), delete      on public.notification_prefs to authenticated;
grant insert, delete                                             on public.push_tokens to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function
  public.space_role(uuid), public.is_space_member(uuid), public.is_space_manager(uuid),
  public.is_space_owner(uuid), public.can_post_in_space(uuid), public.can_comment_in_space(uuid),
  public.is_household_member(uuid), public.is_circle_member(uuid), public.can_see_circle(uuid),
  public.is_child_guardian(uuid), public.can_view_post(uuid), public.is_post_author(uuid),
  public.can_see_profile(uuid), public.plan_video_cap(public.plan_tier),
  public.create_household(text), public.create_space(uuid, text),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer),
  public.redeem_invite(text), public.create_post(uuid, text, uuid[], uuid[], timestamptz),
  public.set_post_audience(uuid, uuid[]), public.publish_post(uuid),
  public.prepare_media_upload(uuid, jsonb), public.space_upload_quota(uuid),
  public.delete_comment(uuid), public.child_birth_date(uuid), public.export_my_data(), public.request_account_export(),
  public.request_account_deletion()
to authenticated;

grant execute on all functions in schema public to service_role;
-- mark_media_upload_result and purge_soft_deleted are deliberately NOT granted to authenticated.
