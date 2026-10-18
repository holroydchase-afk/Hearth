-- 0012: PRIV-1. Hearth's own tables never keep a raw IP address.
-- The invite rate limit (S10, 0002) counted failures under 'ip:<addr>' and only pruned old rows when a
-- new failure came in, so the last failing addresses could sit in private.rate_limit_events forever.
-- Now the key is 'ip:' + HMAC-SHA256(addr, ip_pepper): the same address still maps to the same key, so
-- the limit works, but the address can't be read back or brute-forced without the server-side pepper.
-- The daily purge (hearth-purge-client-errors, 04:17 UTC) also clears rows older than an hour, so a hashed
-- key lives about a day at most even if no new failure ever comes in. The same purge replaces ip_pepper, so a
-- database dump or backup never holds a pepper that can reverse older hashes (the limit looks back only 10
-- minutes, so the cost is one reset a day at 04:17 UTC).
-- Test: backend/tests/privacy_audit_test.sql. Doc: docs/architecture/04-threat-model.md.

insert into private.secrets (name, value)
values ('ip_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function private.ip_tag(p_ip text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(p_ip, (select value from private.secrets where name = 'ip_pepper'), 'sha256'), 'hex')
$$;
revoke execute on function private.ip_tag(text) from public, anon, authenticated;

create or replace function private.rl_keys() returns text[]
language plpgsql stable set search_path = '' as $$
declare v_ip text := private.client_ip(); k text[] := '{}';
begin
  if auth.uid() is not null then k := k || ('user:' || auth.uid()::text); end if;
  if v_ip is not null then k := k || ('ip:' || private.ip_tag(v_ip));
  elsif auth.uid() is null then k := k || 'ip:unknown'::text; end if;
  if auth.uid() is null then k := k || 'anon:all'::text; end if;   -- backstop for distributed anon guessing
  return k;
end $$;

-- Rows written before this migration hold raw addresses. They only matter for 10 minutes; drop them.
delete from private.rate_limit_events where key like 'ip:%' and key <> 'ip:unknown';

create or replace function public.purge_client_errors() returns void
language sql security definer set search_path = '' as $$
  delete from public.client_errors where at < now() - interval '30 days';
  delete from private.rate_limit_events where at < now() - interval '1 hour';
  update private.secrets set value = encode(extensions.gen_random_bytes(32), 'hex'), created_at = now() where name = 'ip_pepper';
$$;
revoke execute on function public.purge_client_errors() from public, anon, authenticated;
grant execute on function public.purge_client_errors() to service_role;
