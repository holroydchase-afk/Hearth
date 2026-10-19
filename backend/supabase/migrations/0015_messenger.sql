-- 0015: messenger relay for MLS group chat (docs/product/SPEC-MESSENGER.md, tests/chat_test.sql).
-- * The server relays opaque MLS bytes (base64 text): key changes ("commit"), welcomes and sealed messages. It never
--   holds a key that opens them. Plaintext, group state and history live on each phone.
-- * One chat per group or event (any live circle kind but household), following circle_members. Not in it, a
--   household or a deleted circle: P0002 "not found", the same as a circle that doesn't exist.
-- * One phone per person: chat_devices holds its public signing key; chat_key_packages its one-use key packages.
--   Publishing again (a new phone) replaces both, so the others swap the old phone out at the next key change (MSG-8).
-- * One commit per epoch (unique index), so two phones changing keys at once can't split the group (MSG-5).
-- * Members fetch only rows created since they joined the circle; a welcome only by the person it names (MSG-6).
-- * Tables are RPC-only: RLS on, no policies, no grants to app roles.
-- * chat_list titles a chat by its group's name only for parents and for events and Everyone; for a relative a
--   plain group is titled by its people ("Grandpa Rivera and Aunt Jo"), so viewers still never see group
--   names (AUD-14) while chat shows them who they're talking to, as it must.

create table public.chat_devices (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  signature_key text not null,
  updated_at timestamptz not null default now()
);

create table public.chat_key_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  key_package text not null,
  created_at timestamptz not null default now()
);
create index chat_key_packages_user on public.chat_key_packages (user_id, created_at);

create table public.chat_groups (
  circle_id uuid primary key references public.circles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('commit', 'welcome', 'message')),
  epoch bigint not null check (epoch >= 0),
  recipient_id uuid references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'welcome') = (recipient_id is not null))
);
create unique index chat_messages_one_commit_per_epoch on public.chat_messages (circle_id, epoch) where kind = 'commit';
create index chat_messages_circle_id on public.chat_messages (circle_id, id);

alter table public.chat_devices enable row level security;
alter table public.chat_key_packages enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_devices, public.chat_key_packages, public.chat_groups, public.chat_messages from anon, authenticated;

-- The circle's chat, if the caller is in it: returns when they joined. Anything else is "not found".
create or replace function private.chat_member_since(p_circle uuid) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare v timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select cm.added_at into v
  from public.circle_members cm
  join public.circles c on c.id = cm.circle_id and c.deleted_at is null and c.kind <> 'household'
  join public.space_members sm on sm.space_id = c.space_id and sm.user_id = cm.user_id
  where cm.circle_id = p_circle and cm.user_id = auth.uid();
  if v is null then raise exception 'not found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function private.chat_is_b64(p text, p_max int) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) between 1 and p_max and p ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(p) % 4 = 0
$$;

create or replace function public.chat_publish_device(p_signature_key text, p_key_packages text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); k text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not private.chat_is_b64(p_signature_key, 200) then
    raise exception 'signing key must be base64' using errcode = '23514';
  end if;
  if coalesce(array_length(p_key_packages, 1), 0) not between 1 and 50 then
    raise exception 'publish 1-50 key packages' using errcode = '23514';
  end if;
  foreach k in array p_key_packages loop
    if not private.chat_is_b64(k, 8000) then raise exception 'key packages must be base64' using errcode = '23514'; end if;
  end loop;
  -- a different signing key is a new phone: the old phone's key packages are useless, drop them
  if not exists (select 1 from public.chat_devices where user_id = v_uid and signature_key = p_signature_key) then
    delete from public.chat_key_packages where user_id = v_uid;
  end if;
  insert into public.chat_devices (user_id, signature_key) values (v_uid, p_signature_key)
  on conflict (user_id) do update set signature_key = excluded.signature_key, updated_at = now();
  insert into public.chat_key_packages (user_id, key_package) select v_uid, unnest(p_key_packages);
end $$;

-- The chats the caller is in, in one family: groups, events and Everyone (not households).
create or replace function public.chat_list(p_space uuid)
returns table (circle_id uuid, kind text, title text, member_count int)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_parent boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not public.is_space_member(p_space) then raise exception 'not found' using errcode = 'P0002'; end if;
  v_parent := public.is_space_manager(p_space);
  return query
    select c.id, c.kind,
           case when v_parent or c.kind <> 'group' then c.name
                else coalesce((select case when count(*) <= 3 then string_agg(o.display_name, ' and ' order by o.display_name)
                                           else (array_agg(o.display_name order by o.display_name))[1] || ', '
                                                || (array_agg(o.display_name order by o.display_name))[2] || ' and '
                                                || (count(*) - 2)::text || ' more' end
                               from public.circle_members om
                               join public.space_members osm on osm.space_id = c.space_id and osm.user_id = om.user_id
                               join public.profiles o on o.id = om.user_id
                               where om.circle_id = c.id and om.user_id <> v_uid), 'Just you') end,
           (select count(*)::int from public.circle_members mm
              join public.space_members msm on msm.space_id = c.space_id and msm.user_id = mm.user_id
            where mm.circle_id = c.id)
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id and c.space_id = p_space and c.deleted_at is null and c.kind <> 'household'
    where cm.user_id = v_uid
    order by case c.kind when 'everyone' then 0 when 'group' then 1 else 2 end, c.name;
end $$;

-- How many unused key packages the caller's phone still has on the server (it tops up when low).
create or replace function public.chat_key_package_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.chat_key_packages where user_id = auth.uid()
$$;

-- true: the caller started this chat (makes the MLS group on their phone); false: someone already had.
create or replace function public.chat_start(p_circle uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  perform private.chat_member_since(p_circle);
  insert into public.chat_groups (circle_id, created_by) values (p_circle, auth.uid()) on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- Who is in the chat: names and each phone's public signing key (null until they open Messages once).
create or replace function public.chat_roster(p_circle uuid)
returns table (user_id uuid, name text, signature_key text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.chat_member_since(p_circle);
  return query
    select cm.user_id, p.display_name, d.signature_key
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id
    join public.space_members sm on sm.space_id = c.space_id and sm.user_id = cm.user_id
    join public.profiles p on p.id = cm.user_id
    left join public.chat_devices d on d.user_id = cm.user_id
    where cm.circle_id = p_circle
    order by p.display_name, cm.user_id;
end $$;

-- Hand out (and use up) one key package per listed person who is in the chat; others are skipped silently.
create or replace function public.chat_claim(p_circle uuid, p_users uuid[])
returns table (user_id uuid, key_package text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.chat_member_since(p_circle);
  return query
    with who as (
      select distinct u.u as user_id
      from unnest(p_users) u(u)
      join public.circle_members cm on cm.circle_id = p_circle and cm.user_id = u.u
      join public.circles c on c.id = cm.circle_id
      join public.space_members sm on sm.space_id = c.space_id and sm.user_id = u.u
    ), pick as (
      select (select k.id from public.chat_key_packages k where k.user_id = who.user_id
              order by k.created_at, k.id limit 1 for update skip locked) as id
      from who
    )
    delete from public.chat_key_packages k using pick where k.id = pick.id
    returning k.user_id, k.key_package;
end $$;

create or replace function public.chat_send(p_circle uuid, p_kind text, p_epoch bigint, p_body text, p_recipient uuid)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform private.chat_member_since(p_circle);
  if p_kind is null or p_kind not in ('commit', 'welcome', 'message') then
    raise exception 'kind is commit, welcome or message' using errcode = '23514';
  end if;
  if (p_kind = 'welcome') <> (p_recipient is not null) then
    raise exception 'a welcome (and only a welcome) names who it is for' using errcode = '23514';
  end if;
  if p_recipient is not null and not exists (select 1 from public.circle_members where circle_id = p_circle and user_id = p_recipient) then
    raise exception 'that person is not in this group' using errcode = '23514';
  end if;
  if p_epoch is null or p_epoch < 0 then raise exception 'epoch must be 0 or more' using errcode = '23514'; end if;
  if not private.chat_is_b64(p_body, 65536) then
    raise exception 'body must be base64, at most 64 KB' using errcode = '23514';
  end if;
  insert into public.chat_messages (circle_id, sender_id, kind, epoch, recipient_id, body)
  values (p_circle, auth.uid(), p_kind, p_epoch, p_recipient, p_body)
  returning id into v_id;   -- a second commit for an epoch raises 23505 (MSG-5)
  return v_id;
end $$;

create or replace function public.chat_fetch(p_circle uuid, p_after bigint, p_limit int default 200)
returns table (id bigint, sender_id uuid, kind text, epoch bigint, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz := private.chat_member_since(p_circle);
begin
  return query
    select m.id, m.sender_id, m.kind, m.epoch, m.body, m.created_at
    from public.chat_messages m
    where m.circle_id = p_circle and m.id > coalesce(p_after, 0) and m.created_at >= v_since
      and (m.recipient_id is null or m.recipient_id = auth.uid())
    order by m.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

revoke execute on function private.chat_member_since(uuid), private.chat_is_b64(text, int) from public, anon;
revoke execute on function public.chat_list(uuid), public.chat_publish_device(text, text[]), public.chat_key_package_count(), public.chat_start(uuid),
  public.chat_roster(uuid), public.chat_claim(uuid, uuid[]), public.chat_send(uuid, text, bigint, text, uuid),
  public.chat_fetch(uuid, bigint, int) from public, anon;
grant execute on function public.chat_list(uuid), public.chat_publish_device(text, text[]), public.chat_key_package_count(), public.chat_start(uuid),
  public.chat_roster(uuid), public.chat_claim(uuid, uuid[]), public.chat_send(uuid, text, bigint, text, uuid),
  public.chat_fetch(uuid, bigint, int) to authenticated, service_role;
