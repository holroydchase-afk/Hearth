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


-- 5. S11 (Oct 15 security review): a guardian can't unlink their child from the OTHER household's space.
-- Sam is linked to Alex's space (A) and Blair's space (B); Blair is Sam's guardian and only a viewer in A.
reset role;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.try($q$delete from public.space_children where space_id = '22222222-0000-0000-0000-00000000000a'
                   and child_id = '44444444-0000-0000-0000-000000000001'$q$);
reset role;
select tests.ok_sql($q$select exists (select 1 from public.space_children where space_id = '22222222-0000-0000-0000-00000000000a'
                       and child_id = '44444444-0000-0000-0000-000000000001')$q$,
  'S11 a co-parent (guardian, viewer in the other household''s space) can''t unlink the child from it');
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.lives($q$delete from public.space_children where space_id = '22222222-0000-0000-0000-00000000000b'
                     and child_id = '44444444-0000-0000-0000-000000000001'$q$, 'S11 setup: Blair can still unlink Sam from Blair''s own space');
reset role;
select tests.ok_sql($q$select not exists (select 1 from public.space_children where space_id = '22222222-0000-0000-0000-00000000000b'
                       and child_id = '44444444-0000-0000-0000-000000000001')$q$,
  'S11 the owner of a family space can still unlink a child from their own space');

-- 6. S13: two relatives who shared only a group that was then deleted no longer see each other's profiles.
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-0000000000d1', 'd1@example.com', '{"display_name":"Cousin One"}'),
  ('d0000000-0000-0000-0000-0000000000d2', 'd2@example.com', '{"display_name":"Cousin Two"}');
insert into public.space_members (space_id, user_id, role, invited_by) values
  ('22222222-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000d1', 'viewer', 'a0000000-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000d2', 'viewer', 'a0000000-0000-0000-0000-00000000000a');
insert into public.circles (id, space_id, name, created_by) values
  ('33333333-0000-0000-0000-0000000000d0', '22222222-0000-0000-0000-00000000000a', 'Cousins', 'a0000000-0000-0000-0000-00000000000a');
insert into public.circle_members (circle_id, user_id) values
  ('33333333-0000-0000-0000-0000000000d0', 'd0000000-0000-0000-0000-0000000000d1'),
  ('33333333-0000-0000-0000-0000000000d0', 'd0000000-0000-0000-0000-0000000000d2');
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select tests.ok_sql($q$select exists (select 1 from public.profiles where id = 'd0000000-0000-0000-0000-0000000000d2')$q$,
  'S13 setup: two relatives in the same group see each other''s profile');
reset role;
update public.circles set deleted_at = now() where id = '33333333-0000-0000-0000-0000000000d0';
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select tests.ok_sql($q$select not exists (select 1 from public.profiles where id = 'd0000000-0000-0000-0000-0000000000d2')$q$,
  'S13 once their only shared group is deleted, they no longer see each other''s profile');

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
