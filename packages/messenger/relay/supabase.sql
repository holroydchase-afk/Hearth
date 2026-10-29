-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Chase Holroyd
--
-- Relay template for @holroyd/messenger on Supabase (Postgres 15+, PostgREST). Copy it into a migration.
-- It is Hearth's migration 0015 with Hearth taken out: the only product-specific part is the membership rule.
--
-- YOU WRITE ONE FUNCTION (after this file, in the same or a later migration):
--   private.messenger_people(p_conversation text) returns table (user_id uuid, name text, since timestamptz)
--   Everyone in the conversation, the name shown beside their messages, and when they joined it (they can fetch
--   only rows from then on). Return no rows for a conversation that doesn't exist or that the product doesn't
--   allow a chat for. Make it `stable security definer set search_path = ''`. The stub below refuses everything.
--
-- What the relay guarantees (tests: packages/messenger/relay/test.sql):
--   * It stores opaque MLS bytes (base64) and never holds a key that opens them.
--   * Not in the conversation, or no such conversation: P0002 "not found", the same answer either way.
--   * One device per person. Publishing a new signing key drops the old device's key packages.
--   * One commit per epoch (unique index). The loser of a race gets 23505; the client maps it to EpochConflict.
--   * Members fetch only rows created since they joined; a welcome only by the person it names.
--   * Tables are RPC-only: RLS on, no policies, no grants to app roles.
-- Not included: listing a user's conversations and their titles. That is product logic; write it yourself.

create schema if not exists private;

create table public.messenger_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature_key text not null,
  updated_at timestamptz not null default now()
);

create table public.messenger_key_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_package text not null,
  created_at timestamptz not null default now()
);
create index messenger_key_packages_user on public.messenger_key_packages (user_id, created_at);

create table public.messenger_groups (
  conversation text primary key check (char_length(conversation) between 1 and 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index messenger_groups_created_by on public.messenger_groups (created_by);

create table public.messenger_rows (
  id bigint generated always as identity primary key,
  conversation text not null,
  sender_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('commit', 'welcome', 'message')),
  epoch bigint not null check (epoch >= 0),
  recipient_id uuid references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'welcome') = (recipient_id is not null))
);
create unique index messenger_rows_one_commit_per_epoch on public.messenger_rows (conversation, epoch) where kind = 'commit';
create index messenger_rows_conversation on public.messenger_rows (conversation, id);
create index messenger_rows_sender on public.messenger_rows (sender_id);
create index messenger_rows_recipient on public.messenger_rows (recipient_id) where recipient_id is not null;

alter table public.messenger_devices enable row level security;
alter table public.messenger_key_packages enable row level security;
alter table public.messenger_groups enable row level security;
alter table public.messenger_rows enable row level security;
revoke all on public.messenger_devices, public.messenger_key_packages, public.messenger_groups, public.messenger_rows
  from anon, authenticated;

-- The product's membership rule. Replace this stub (create or replace) with your own.
create or replace function private.messenger_people(p_conversation text)
returns table (user_id uuid, name text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select null::uuid, null::text, null::timestamptz where false
$$;

-- When the caller joined this conversation. Not in it (or no such conversation): "not found".
create or replace function private.messenger_member_since(p_conversation text) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare v timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select p.since into v from private.messenger_people(p_conversation) p where p.user_id = auth.uid();
  if v is null then raise exception 'not found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function private.messenger_is_b64(p text, p_max int) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) between 1 and p_max and p ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(p) % 4 = 0
$$;

create or replace function public.messenger_publish_device(p_signature_key text, p_key_packages text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); k text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not private.messenger_is_b64(p_signature_key, 200) then
    raise exception 'signing key must be base64' using errcode = '23514';
  end if;
  if coalesce(array_length(p_key_packages, 1), 0) not between 1 and 50 then
    raise exception 'publish 1-50 key packages' using errcode = '23514';
  end if;
  foreach k in array p_key_packages loop
    if not private.messenger_is_b64(k, 8000) then raise exception 'key packages must be base64' using errcode = '23514'; end if;
  end loop;
  -- a different signing key is a new device: the old device's key packages are useless, drop them
  if not exists (select 1 from public.messenger_devices where user_id = v_uid and signature_key = p_signature_key) then
    delete from public.messenger_key_packages where user_id = v_uid;
  end if;
  insert into public.messenger_devices (user_id, signature_key) values (v_uid, p_signature_key)
  on conflict (user_id) do update set signature_key = excluded.signature_key, updated_at = now();
  insert into public.messenger_key_packages (user_id, key_package) select v_uid, unnest(p_key_packages);
end $$;

create or replace function public.messenger_key_package_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messenger_key_packages where user_id = auth.uid()
$$;

-- true: the caller started this conversation's group (their device makes it); false: someone already had.
create or replace function public.messenger_start(p_conversation text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  perform private.messenger_member_since(p_conversation);
  insert into public.messenger_groups (conversation, created_by) values (p_conversation, auth.uid()) on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- The Roster: names and each device's public signing key (null until they open the messenger once).
create or replace function public.messenger_roster(p_conversation text)
returns table (user_id uuid, name text, signature_key text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.messenger_member_since(p_conversation);
  return query
    select mp.user_id, mp.name, d.signature_key
    from private.messenger_people(p_conversation) mp
    left join public.messenger_devices d on d.user_id = mp.user_id
    order by mp.name, mp.user_id;
end $$;

-- Hand out (and use up) one key package per listed person who is in the conversation; others are skipped.
create or replace function public.messenger_claim(p_conversation text, p_users uuid[])
returns table (user_id uuid, key_package text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.messenger_member_since(p_conversation);
  return query
    with who as (
      select mp.user_id from private.messenger_people(p_conversation) mp where mp.user_id = any (p_users)
    ), pick as (
      select (select k.id from public.messenger_key_packages k where k.user_id = who.user_id
              order by k.created_at, k.id limit 1 for update skip locked) as id
      from who
    )
    delete from public.messenger_key_packages k using pick where k.id = pick.id
    returning k.user_id, k.key_package;
end $$;

create or replace function public.messenger_send(p_conversation text, p_kind text, p_epoch bigint, p_body text, p_recipient uuid)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform private.messenger_member_since(p_conversation);
  if p_kind is null or p_kind not in ('commit', 'welcome', 'message') then
    raise exception 'kind is commit, welcome or message' using errcode = '23514';
  end if;
  if (p_kind = 'welcome') <> (p_recipient is not null) then
    raise exception 'a welcome (and only a welcome) names who it is for' using errcode = '23514';
  end if;
  if p_recipient is not null
     and not exists (select 1 from private.messenger_people(p_conversation) mp where mp.user_id = p_recipient) then
    raise exception 'that person is not in this conversation' using errcode = '23514';
  end if;
  if p_epoch is null or p_epoch < 0 then raise exception 'epoch must be 0 or more' using errcode = '23514'; end if;
  if not private.messenger_is_b64(p_body, 65536) then
    raise exception 'body must be base64, at most 64 KB' using errcode = '23514';
  end if;
  insert into public.messenger_rows (conversation, sender_id, kind, epoch, recipient_id, body)
  values (p_conversation, auth.uid(), p_kind, p_epoch, p_recipient, p_body)
  returning id into v_id;   -- a second commit for an epoch raises 23505
  return v_id;
end $$;

create or replace function public.messenger_fetch(p_conversation text, p_after bigint, p_limit int default 200)
returns table (id bigint, sender_id uuid, kind text, epoch bigint, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz := private.messenger_member_since(p_conversation);
begin
  return query
    select m.id, m.sender_id, m.kind, m.epoch, m.body, m.created_at
    from public.messenger_rows m
    where m.conversation = p_conversation and m.id > coalesce(p_after, 0) and m.created_at >= v_since
      and (m.recipient_id is null or m.recipient_id = auth.uid())
    order by m.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

revoke execute on function private.messenger_people(text), private.messenger_member_since(text), private.messenger_is_b64(text, int)
  from public, anon, authenticated;
revoke execute on function public.messenger_publish_device(text, text[]), public.messenger_key_package_count(),
  public.messenger_start(text), public.messenger_roster(text), public.messenger_claim(text, uuid[]),
  public.messenger_send(text, text, bigint, text, uuid), public.messenger_fetch(text, bigint, int) from public, anon;
grant execute on function public.messenger_publish_device(text, text[]), public.messenger_key_package_count(),
  public.messenger_start(text), public.messenger_roster(text), public.messenger_claim(text, uuid[]),
  public.messenger_send(text, text, bigint, text, uuid), public.messenger_fetch(text, bigint, int) to authenticated, service_role;
