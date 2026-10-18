-- PRIV-1 (privacy path, Oct 18): Hearth's own tables never keep a raw IP address.
-- The invite rate limit (S10) needs to count failures per client IP for 10 minutes. It may keep a
-- keyed hash of the IP (useless without the server-side pepper) for at most an hour, and the
-- nightly/regular purge must clear old rows even when no new failure arrives to trigger cleanup.
-- Supabase's own auth and gateway logs are outside this test: see docs/architecture/04-threat-model.md.
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

-- 1. No IP-shaped columns anywhere in our schemas.
select tests.ok_sql($q$select not exists (
    select 1 from information_schema.columns
    where table_schema in ('public', 'private')
      and (data_type in ('inet', 'cidr') or column_name ~* '(^|_)(ip|ip_?addr(ess)?|user_agent|remote_addr)($|_)'))$q$,
  'PRIV-1 no table in public or private has an inet/cidr column or an ip/user_agent column');

-- 2. A failed invite attempt from an IP leaves no trace of that IP in the database.
\set as_fresh 'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''e0000000-0000-0000-0000-0000000000e1'', false);'
:as_fresh
select tests.rest($s$select public.redeem_invite('BADPRIV01')$s$, '{"cf-connecting-ip":"203.0.113.77"}');
reset role;
select set_config('request.jwt.claim.sub', '', false);   -- signed out: preview works without an account
select tests.rest($s$select public.invite_preview('BADPRIV02')$s$, '{"x-forwarded-for":"10.0.0.1, 198.51.100.66"}');
select tests.ok_sql($q$select count(*) >= 2 from private.rate_limit_events where key like 'ip:%'$q$,
  'PRIV-1 setup: the failed attempts were counted per client (rate limit still keyed by IP)');
select tests.ok_sql($q$select not exists (select 1 from private.rate_limit_events
                        where key like '%203.0.113.77%' or key like '%198.51.100.66%' or key like '%10.0.0.1%')$q$,
  'PRIV-1 rate limit rows never hold the raw client IP (only a keyed hash)');
select tests.ok_sql($q$select not exists (select 1 from private.rate_limit_events
                        where key = 'ip:' || encode(extensions.digest('203.0.113.77', 'sha256'), 'hex'))$q$,
  'PRIV-1 the IP hash is keyed (a plain sha256 of the IP would be reversible by trying all 4 billion addresses)');

-- 3. The same IP still maps to the same key, so the S10 limit keeps working.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000e2', false);  -- a second account, same IP
set role authenticated;
select tests.rest($s$select public.redeem_invite('BADPRIV03')$s$, '{"cf-connecting-ip":"203.0.113.77"}');
reset role;
select tests.ok_sql($q$select exists (select 1 from private.rate_limit_events where key like 'ip:%'
                        group by key having count(*) >= 2)$q$,
  'PRIV-1 two failures from one IP share one key (S10 per-IP limit still counts them together)');

-- 4. Old rows go away on the regular purge, even if no new failure ever arrives.
insert into private.rate_limit_events (key, action, at) values ('ip:stale', 'redeem', now() - interval '2 hours');
select tests.setv('pepper_before', $q$select value from private.secrets where name = 'ip_pepper'$q$);
select public.purge_client_errors();
select tests.ok_sql($q$select value is distinct from tests.v('pepper_before') and length(value) = 64
                       from private.secrets where name = 'ip_pepper'$q$,
  'PRIV-1 the daily purge replaces the IP pepper (a dump or backup can''t reverse older hashes)');
select tests.ok_sql($q$select not exists (select 1 from private.rate_limit_events where at < now() - interval '1 hour')$q$,
  'PRIV-1 the scheduled purge (hearth-purge-client-errors) clears rate limit rows older than 1 hour');

reset role;
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo PRIVACY-AUDIT RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
