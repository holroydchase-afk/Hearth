-- 0007: real names (BETA-NOTIFY-7, JOIN-1). A new account's name was the start of
-- its email ("holroydchase"), and nothing could change it, so every notice and invite
-- would show that. Posters set their name once (set_my_name); an invite can carry the
-- name the family uses ("Grandma June"), applied on joining unless the person chose one.

alter table public.profiles add column name_set boolean not null default false;
update public.profiles set name_set = true;          -- existing rows were given real names
alter table public.invites add column invitee_name text
  check (invitee_name is null or char_length(invitee_name) between 1 and 40);

-- 1-40 characters after trimming; never an email address or anything that could
-- change an email header.
create or replace function private.valid_name(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(btrim(p)) between 1 and 40 and btrim(p) !~ '[@<>\r\n\t]', false)
$$;

-- Names change only through set_my_name / an invite (privacy-security review): the
-- old direct column grant skipped the rules, and the table refuses anything that
-- could break an email header or markup.
revoke update (display_name) on public.profiles from authenticated;
alter table public.profiles add constraint profiles_display_name_clean
  check (display_name !~ '[\r\n\t<>]');

-- New accounts: a name given at sign-up counts as set; the email-prefix fallback does not.
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.profiles (id, display_name, name_set)
  values (new.id,
          case when private.valid_name(new.raw_user_meta_data->>'display_name')
               then btrim(new.raw_user_meta_data->>'display_name')
               else regexp_replace(split_part(coalesce(new.email, new.phone, 'Member'), '@', 1), '[\r\n\t<>]', '', 'g') end,
          private.valid_name(new.raw_user_meta_data->>'display_name'))
  on conflict (id) do nothing;
  return new;
end $fn$;

create or replace function public.set_my_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not private.valid_name(p_name) then
    raise exception 'a name is 1-40 characters, not an email address' using errcode = '23514';
  end if;
  update public.profiles set display_name = btrim(p_name), name_set = true where id = auth.uid();
end $fn$;

create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $fn$
  select json_build_object('user_id', p.id, 'display_name', p.display_name, 'name_set', p.name_set)
  from public.profiles p where p.id = auth.uid()
$fn$;

drop function public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer);
create or replace function public.create_invite(
  p_space uuid, p_role public.member_role, p_circle_ids uuid[],
  p_channel public.invite_channel default 'link', p_target_email text default null,
  p_target_phone text default null, p_ttl interval default interval '7 days', p_max_uses integer default 1,
  p_name text default null)
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
  if p_name is not null and not private.valid_name(p_name) then
    raise exception 'a name is 1-40 characters, not an email address' using errcode = '23514';
  end if;
  -- no impersonation: an invite can't reuse the name of someone already in the family
  if p_name is not null and exists (
       select 1 from public.space_members sm join public.profiles pr on pr.id = sm.user_id
       where sm.space_id = p_space and lower(pr.display_name) = lower(btrim(p_name))) then
    raise exception 'someone in this family already has that name' using errcode = '23514';
  end if;
  select string_agg(substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1), '' order by i)
    into v_code from generate_series(0, 9) i;
  insert into public.invites (space_id, role, channel, code_hash, link_hash, target_email, target_phone,
                              expires_at, max_uses, created_by, invitee_name)
  values (p_space, p_role, p_channel, private.invite_hash(v_code), private.invite_hash(v_token),
          lower(p_target_email), p_target_phone, v_exp, p_max_uses, auth.uid(), nullif(btrim(p_name), ''))
  returning id into v_id;
  insert into public.invite_circles (invite_id, circle_id) select distinct v_id, unnest(p_circle_ids);
  return (v_id, v_code,
          (select value from private.secrets where name = 'invite_link_base') || v_token,
          v_exp)::public.invite_created;
end $$;

create or replace function public.redeem_invite(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_inv  public.invites;
  v_user auth.users;
  v_keys text[];
  v_ok   boolean;
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
  -- JOIN-1: the name the poster typed becomes theirs, unless they chose one already
  if v_inv.invitee_name is not null then
    update public.profiles set display_name = v_inv.invitee_name, name_set = true
    where id = auth.uid() and not name_set;
  end if;
  update public.invites set use_count = use_count + 1 where id = v_inv.id;
  return to_json(v_inv.space_id);
end $$;

revoke execute on function public.set_my_name(text), public.my_profile(),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text),
  private.valid_name(text)
  from public, anon;
grant execute on function public.set_my_name(text), public.my_profile(),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text)
  to authenticated;
grant execute on function public.set_my_name(text), public.my_profile(),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer, text)
  to service_role;
