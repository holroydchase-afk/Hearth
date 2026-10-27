-- Invite codes: how people join an org without anyone typing a user id. From Hearth's
-- create_invite() / redeem_invite() (migrations 0001 and 0014), fitted to the studio template's
-- orgs and members. Tests: tests/sql/invites_test.sql (STARTER-INV-*).
--
-- Rules:
-- 1. Only an admin creates invites; only the owner invites an admin; nobody invites an owner.
-- 2. The code is shown once. The table keeps only its SHA-256, and no client can read the hash.
-- 3. A code works once, until it expires (7 days by default) or an admin revokes it.
-- 4. Every failure to redeem says the same thing, "invite not found" (P0002), so nobody can
--    tell a wrong code from a used, expired or revoked one. Branch on the code, not the HTTP
--    status: PostgREST returns P0002 as a 500.
-- Uses only built-ins (gen_random_uuid, sha256), so it needs no extension.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  code_hash bytea not null unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_org_idx on public.invites (org_id);

-- Codes are compared without dashes, spaces or case, so "ab12 cd34..." works as well as "AB12-CD34-...".
create or replace function app.invite_hash(p_code text) returns bytea
language sql immutable set search_path = '' as $$
  select pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.upper(pg_catalog.regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g')), 'UTF8'))
$$;

create or replace function public.create_invite(p_org uuid, p_role text default 'member', p_days int default 7)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not app.is_admin(p_org) then raise exception 'Only admins can invite people' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then
    raise exception 'An invite makes a member or admin' using errcode = '23514';
  end if;
  if p_role = 'admin' and app.role_in(p_org) <> 'owner' then
    raise exception 'Only the owner can invite an admin' using errcode = '42501';
  end if;
  if p_days not between 1 and 30 then raise exception 'An invite lasts 1 to 30 days' using errcode = '23514'; end if;
  -- 64 random bits: the first 8 hex digits of two v4 UUIDs (all random), shown as four groups.
  v_code := pg_catalog.upper(pg_catalog.left(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 8)
                          || pg_catalog.left(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 8));
  insert into public.invites (org_id, role, code_hash, created_by, expires_at)
    values (p_org, p_role, app.invite_hash(v_code), (select auth.uid()), now() + pg_catalog.make_interval(days => p_days));
  return pg_catalog.concat_ws('-', pg_catalog.substr(v_code, 1, 4), pg_catalog.substr(v_code, 5, 4),
                              pg_catalog.substr(v_code, 9, 4), pg_catalog.substr(v_code, 13, 4));
end $$;

create or replace function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_inv from public.invites where code_hash = app.invite_hash(p_code) for update;
  -- Already in the org (tapped the link twice): just return the org.
  if found and app.is_member(v_inv.org_id) then
    return v_inv.org_id;
  end if;
  if not found or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  insert into public.members (org_id, user_id, role) values (v_inv.org_id, (select auth.uid()), v_inv.role);
  update public.invites set used_by = (select auth.uid()), used_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

create or replace function public.revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.invites set revoked_at = now()
    where id = p_invite and app.is_admin(org_id) and used_at is null and revoked_at is null;
  if not found then raise exception 'Invite not found' using errcode = 'P0002'; end if;
end $$;

revoke execute on function app.invite_hash(text) from public, anon, authenticated;
revoke execute on function public.create_invite(uuid, text, int), public.redeem_invite(text),
  public.revoke_invite(uuid) from public, anon;
grant execute on function public.create_invite(uuid, text, int), public.redeem_invite(text),
  public.revoke_invite(uuid) to authenticated;

-- Admins read their org's invites, never the hashes. All writes go through the functions above.
revoke all on public.invites from anon, authenticated;
grant select (id, org_id, role, created_by, expires_at, used_by, used_at, revoked_at, created_at)
  on public.invites to authenticated;
alter table public.invites enable row level security;
create policy invites_admin_read on public.invites for select to authenticated using (app.is_admin(org_id));
