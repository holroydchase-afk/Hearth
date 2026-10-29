-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Chase Holroyd
--
-- RELAY-1..9: the relay template with a toy membership rule (a product that isn't Hearth). Runs in one transaction
-- and rolls back, so it is safe on any scratch database: plain Postgres 15+ (an auth stub is made if missing) or
-- a local Supabase stack. Exits non-zero on any failure.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f packages/messenger/relay/test.sql
begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
do $$ begin
  if to_regprocedure('auth.uid()') is null then
    execute $f$create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'$f$;
  end if;
end $$;
grant usage on schema auth, public to anon, authenticated, service_role;

\ir supabase.sql

-- The toy product: crews with members, joined at a given time.
create table public.toy_crew (conversation text, user_id uuid, name text, since timestamptz);
create or replace function private.messenger_people(p_conversation text)
returns table (user_id uuid, name text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.user_id, t.name, t.since from public.toy_crew t where t.conversation = p_conversation
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.toy_crew values
  ('crew-1', '00000000-0000-0000-0000-00000000000a', 'Ana', now() - interval '1 day'),
  ('crew-1', '00000000-0000-0000-0000-00000000000b', 'Ben', now() - interval '1 day');

create temp table results (n serial, ok boolean, what text);
grant all on results, results_n_seq to authenticated;

create function pg_temp.ok(p boolean, what text) returns void language sql as $$ insert into results (ok, what) values (coalesce(p, false), what) $$;
create function pg_temp.code(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;
create function pg_temp.as_user(p char) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', case when p = '' then '' else '00000000-0000-0000-0000-00000000000' || p end, true);
end $$;

set local role authenticated;

-- RELAY-1: who may touch a conversation
select pg_temp.as_user('');
select pg_temp.ok(pg_temp.code($q$select public.messenger_start('crew-1')$q$) = '42501', 'RELAY-1: signed out is refused');
select pg_temp.as_user('c');
select pg_temp.ok(pg_temp.code($q$select public.messenger_start('crew-1')$q$) = 'P0002', 'RELAY-1: not in the crew: not found');
select pg_temp.ok(pg_temp.code($q$select * from public.messenger_fetch('crew-1', 0)$q$) = 'P0002', 'RELAY-1: not in the crew: fetch is not found');
select pg_temp.as_user('a');
select pg_temp.ok(pg_temp.code($q$select public.messenger_start('crew-404')$q$) = 'P0002', 'RELAY-1: no such conversation: the same not found');

-- RELAY-2: the first starter makes the group
select pg_temp.ok(public.messenger_start('crew-1'), 'RELAY-2: first start returns true');
select pg_temp.as_user('b');
select pg_temp.ok(not public.messenger_start('crew-1'), 'RELAY-2: second start returns false');

-- RELAY-3: devices and key packages
select pg_temp.ok(pg_temp.code($q$select public.messenger_publish_device('not base64!', array['AAAA'])$q$) = '23514', 'RELAY-3: signing key must be base64');
select public.messenger_publish_device('S0VZMQ==', array['UEtHMQ==', 'UEtHMg==']);
select pg_temp.ok(public.messenger_key_package_count() = 2, 'RELAY-3: two key packages published');
select public.messenger_publish_device('S0VZMg==', array['UEtHMw==']);
select pg_temp.ok(public.messenger_key_package_count() = 1, 'RELAY-3: a new device drops the old device''s packages');

-- RELAY-4: claim uses up one package per member, skips people outside the crew
select pg_temp.as_user('a');
select pg_temp.ok((select count(*) from public.messenger_claim('crew-1',
  array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c']::uuid[])) = 1, 'RELAY-4: one package, only for the member');
select pg_temp.as_user('b');
select pg_temp.ok(public.messenger_key_package_count() = 0, 'RELAY-4: the claimed package is used up');

-- RELAY-5: one commit per epoch
select pg_temp.as_user('a');
select pg_temp.ok(public.messenger_send('crew-1', 'commit', 0, 'Q09NTUlU', null) > 0, 'RELAY-5: first commit for epoch 0 is stored');
select pg_temp.as_user('b');
select pg_temp.ok(pg_temp.code($q$select public.messenger_send('crew-1', 'commit', 0, 'Q09NTUlU', null)$q$) = '23505', 'RELAY-5: a second commit for epoch 0 is 23505');

-- RELAY-6: welcomes name their recipient and reach only them
select pg_temp.as_user('a');
select pg_temp.ok(pg_temp.code($q$select public.messenger_send('crew-1', 'welcome', 0, 'V0VM', null)$q$) = '23514', 'RELAY-6: a welcome must name its recipient');
select pg_temp.ok(pg_temp.code($q$select public.messenger_send('crew-1', 'message', 0, 'TVNH', '00000000-0000-0000-0000-00000000000b')$q$) = '23514', 'RELAY-6: only a welcome names a recipient');
select pg_temp.ok(pg_temp.code($q$select public.messenger_send('crew-1', 'welcome', 0, 'V0VM', '00000000-0000-0000-0000-00000000000c')$q$) = '23514', 'RELAY-6: no welcome for someone outside the crew');
select public.messenger_send('crew-1', 'welcome', 0, 'V0VMQg==', '00000000-0000-0000-0000-00000000000b');
select public.messenger_send('crew-1', 'message', 1, 'TVNHMQ==', null);
select pg_temp.ok(pg_temp.code($q$select public.messenger_send('crew-1', 'message', 1, 'x', null)$q$) = '23514', 'RELAY-6: bodies must be base64');
select pg_temp.ok(not exists (select 1 from public.messenger_fetch('crew-1', 0) where kind = 'welcome'), 'RELAY-6: the sender does not get the welcome back');
select pg_temp.as_user('b');
select pg_temp.ok((select count(*) from public.messenger_fetch('crew-1', 0) where kind = 'welcome') = 1, 'RELAY-6: the recipient gets the welcome');

-- RELAY-7: a newcomer sees only rows from when they joined
reset role;
insert into public.toy_crew values ('crew-1', '00000000-0000-0000-0000-00000000000d', 'Dee', now() + interval '1 second');
set local role authenticated;
select pg_temp.as_user('d');
select pg_temp.ok((select count(*) from public.messenger_fetch('crew-1', 0)) = 0, 'RELAY-7: rows from before Dee joined are hidden');

-- RELAY-8: the roster comes from the product's rule, with each device's key
select pg_temp.ok((select string_agg(name || ':' || coalesce(signature_key, '-'), ',' order by name) from public.messenger_roster('crew-1'))
  = 'Ana:-,Ben:S0VZMg==,Dee:-', 'RELAY-8: roster has names and signing keys');

-- RELAY-9: tables are RPC-only
select pg_temp.ok(pg_temp.code('select * from public.messenger_rows') = '42501', 'RELAY-9: rows are not readable directly');
select pg_temp.ok(pg_temp.code('select * from public.messenger_key_packages') = '42501', 'RELAY-9: key packages are not readable directly');
select pg_temp.ok(pg_temp.code($q$select * from private.messenger_people('crew-1')$q$) = '42501', 'RELAY-9: the membership rule is not callable directly');

reset role;
select case when ok then 'ok      ' else 'NOT OK  ' end || what from results order by n;
do $$ declare bad int := (select count(*) from results where not ok); total int := (select count(*) from results);
begin
  raise notice 'RELAY RESULT: % passed, % failed', total - bad, bad;
  if bad > 0 then raise exception 'relay template: % failed', bad; end if;
end $$;
rollback;
