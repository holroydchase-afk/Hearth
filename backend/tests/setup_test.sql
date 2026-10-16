-- scripts/family-setup.sql (milestone 1 + 2 setup): Chase's space, the starter
-- groups, an invite for the test viewer and a poster ("adult") invite for Mom.
-- Runs against a FRESH db: stub -> migrations -> seed -> this file (see tests/run.sh).
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create schema tests;
create table tests.results (n serial, ok boolean not null, description text not null);
create function tests.ok(p_ok boolean, p_desc text) returns void language sql as $$
  insert into tests.results (ok, description) values (coalesce(p_ok, false), p_desc) $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-0000000000e1', 'chase@example.com', '{"display_name":"Chase"}');

\set chase_email 'chase@example.com'
\set mom_email 'mom@example.com'
\set space_name 'Our kids'
\o /dev/null
\ir ../scripts/family-setup.sql
\o
reset role;

select tests.ok((select count(*) = 1 from public.spaces s join public.space_members m on m.space_id = s.id
                 where s.name = 'Our kids' and m.user_id = 'e0000000-0000-0000-0000-0000000000e1' and m.role = 'owner'),
                'M1 setup: Chase owns one space');
select tests.ok((select array_agg(c.name order by c.name) from public.circles c join public.spaces s on s.id = c.space_id
                 where s.name = 'Our kids')
                = array['Chase''s dad''s side', 'Chase''s mom''s side', 'Mom''s dad''s side',
                        'Mom''s mom''s side', 'Everyone', 'Test viewer'],
                'M1 setup: the starter groups exist (Chase can rename them in the app)');
select tests.ok((select count(*) = 1 from public.invites i join public.spaces s on s.id = i.space_id
                 where s.name = 'Our kids' and i.role = 'viewer'),
                'M1 setup: one viewer invite for the test account');
select tests.ok((select count(*) = 1 from public.invites i join public.spaces s on s.id = i.space_id
                 where s.name = 'Our kids' and i.role = 'adult'),
                'M2 setup: one poster (adult) invite for Mom');

-- re-running changes nothing but adds fresh invites
\o /dev/null
\ir ../scripts/family-setup.sql
\o
reset role;
select tests.ok((select count(*) = 1 from public.spaces where name = 'Our kids')
                and (select count(*) = 6 from public.circles c join public.spaces s on s.id = c.space_id where s.name = 'Our kids'),
                'setup: running it again reuses the space and groups (no duplicates)');

\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo SETUP RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
