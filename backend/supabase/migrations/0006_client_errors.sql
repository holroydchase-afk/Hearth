-- 0006: BETA-OPS-1 (AE-7). Our own crash/error reports: no third-party SDK (A1, A3).
-- Only fixed-shape fields are accepted (version, OS, screen name, error type, error
-- code), so a caption, email, URL or key cannot get in: free text is refused (23514).
-- Kept 30 days (purge_client_errors, run by the server). Readable by the server only.

create table public.client_errors (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  reporter     text not null,              -- auth.uid() or 'anon'; used for the rate limit only
  app_version  text not null,
  os           text not null,
  screen       text not null,
  kind         text not null,
  code         text
);
create index on public.client_errors (reporter, at);
create index on public.client_errors (at);
alter table public.client_errors enable row level security;   -- no policies: service_role only
revoke all on public.client_errors from public, anon, authenticated;

create or replace function public.report_client_error(
  p_app_version text, p_os text, p_screen text, p_kind text, p_code text default null
) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v_who text := coalesce(auth.uid()::text, 'anon');
begin
  if coalesce(p_app_version, '') !~ '^[0-9A-Za-z.+-]{1,20}$'
     or coalesce(p_os, '') !~ '^(ios|android|web)( [0-9.]{1,12})?$'
     or coalesce(p_screen, '') !~ '^[a-z0-9_/\[\]-]{1,40}$'
     or coalesce(p_kind, '') !~ '^[A-Za-z][A-Za-z0-9_]{0,59}$'
     or (p_code is not null and p_code !~ '^[A-Za-z0-9_]{1,20}$') then
    raise exception 'error reports take fixed fields only' using errcode = '23514';
  end if;
  if (select count(*) from public.client_errors e
      where e.reporter = v_who and e.at > now() - interval '1 hour') >= (case when v_who = 'anon' then 300 else 30 end) then
    raise exception 'too many error reports' using errcode = '54000';
  end if;
  insert into public.client_errors (reporter, app_version, os, screen, kind, code)
  values (v_who, p_app_version, p_os, p_screen, p_kind, p_code);
end $fn$;

create or replace function public.purge_client_errors() returns void
language sql security definer set search_path = '' as $$
  delete from public.client_errors where at < now() - interval '30 days'
$$;

revoke execute on function public.report_client_error(text, text, text, text, text),
                           public.purge_client_errors()
  from public, anon, authenticated;
grant execute on function public.report_client_error(text, text, text, text, text) to anon, authenticated;
grant execute on function public.purge_client_errors() to service_role;
grant select, delete on public.client_errors to service_role;
