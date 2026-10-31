-- v1, kept for its tests. For a NEW family use scripts/family-setup.sh (0011 shape, token only): on 0011 this
-- file's test-viewer invite names a v1 group that family-setup-v2.sql later retires.
-- Milestone 1 + 2 setup: the app can't create a family space or groups yet, so this
-- does it once, AS CHASE, through the same RPCs and RLS the app uses (no RLS bypass).
-- Chase must have signed in once first (so his account exists).
--
--   psql "$SUPABASE_DB_URL" -v chase_email=you@example.com \
--        -v mom_email=her@example.com -v space_name='Our kids' \
--        -f backend/scripts/family-setup.sql
--
-- mom_email is optional. Safe to re-run: reuses the space and groups and
-- prints fresh invite links (each works once, for 7 days). Groups can be renamed
-- in the app's Groups screen.
\set ON_ERROR_STOP 1

select set_config('request.jwt.claim.sub', id::text, false) as chase_id
from auth.users where lower(email) = lower(:'chase_email') \gset
\if :{?chase_id}
\else
  \echo 'Chase has no account yet: sign in once in the app, then run this again.'
  \quit
\endif
select set_config('hearth.space_name', :'space_name', false) \gset

set role authenticated;

do $$
declare
  v_space uuid;
  v_name text := current_setting('hearth.space_name');
  g text;
begin
  select s.id into v_space
  from public.spaces s join public.space_members m on m.space_id = s.id
  where m.user_id = auth.uid() and m.role = 'owner' and s.name = v_name and s.deleted_at is null
  limit 1;
  if v_space is null then
    v_space := public.create_space(public.create_household(v_name), v_name);
  end if;
  foreach g in array array['Test viewer', 'Chase''s mom''s side', 'Chase''s dad''s side',
                           'Mom''s mom''s side', 'Mom''s dad''s side'] loop
    insert into public.circles (space_id, name, created_by) values (v_space, g, auth.uid())
    on conflict (space_id, name) do nothing;
  end loop;
  perform set_config('hearth.space_id', v_space::text, false);
end $$;

\echo 'Test viewer invite (milestone 1, account B):'
select link from public.create_invite(
  current_setting('hearth.space_id')::uuid, 'viewer',
  array(select id from public.circles where space_id = current_setting('hearth.space_id')::uuid and name = 'Test viewer'),
  p_history => 'all');   -- 0011: every relative's invite says whether they see past photos

\if :{?mom_email}
\echo 'Mom''s poster invite (milestone 2; she can post to every group):'
select link from public.create_invite(
  current_setting('hearth.space_id')::uuid, 'adult',
  array(select id from public.circles where space_id = current_setting('hearth.space_id')::uuid and deleted_at is null),
  'email', :'mom_email');
\endif
reset role;
