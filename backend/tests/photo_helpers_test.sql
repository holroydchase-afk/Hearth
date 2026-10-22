-- HELP-R4 (SPEC-PHOTO-HELPERS): the photo helpers' server off-switches, migration 0016. Written FIRST: red until
-- 0016 lands. Two features, photo_helpers_duplicates (HELP-DUP-1..4) and photo_helpers_screens_blur (HELP-SHOT-1,
-- HELP-BLUR-1/2). Unlike video_posting they are ON by default (DEC-18: an off-switch, not an add-on), for anyone
-- who can post; never for a viewer who can't. A parent turns one off for the family; Hearth's global row is the
-- kill switch. The helpers run on the phone only (HELP-R2): the server holds only the on/off rows.
-- Seed people (space A, "Sam at Dad's"): Alex owns it; Grandma Rivera (ma) is a viewer.
-- Interpretations (staff-pm; change the test first):
--   * No family row = on. An explicit family row decides. No global row = on (a new feature ships on).
--   * Writes stay owner-only (can(space, 'family_settings'), FLAG-3), like every other family switch.
--   * video_posting keeps its default-off rule (FLAG-1 unchanged).
\set ON_ERROR_STOP 1
\pset footer off
\ir harness.sql

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set as_ma    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-0000000000a1'', false);'
\set as_alex  'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''a0000000-0000-0000-0000-00000000000a'', false);'
\set as_jo    'reset role; set role authenticated; select set_config(''request.jwt.claim.sub'', ''c0000000-0000-0000-0000-0000000000c1'', false);'
\set sa       '''22222222-0000-0000-0000-00000000000a'''
\set sb       '''22222222-0000-0000-0000-00000000000b'''

-- ---------- default on, for posters only ----------
:as_alex
select tests.ok_sql(format($$select array_agg(feature order by feature) = array['photo_helpers_duplicates', 'photo_helpers_screens_blur']
                             from public.my_features(%L)$$, :sa),
                    'HELP-R4 with no family rows, a parent gets both photo helpers (default on)');
select tests.ok_sql(format($$select not exists (select 1 from public.my_features(%L) where feature = 'video_posting')$$, :sa),
                    'HELP-R4 ...and video_posting stays off by default (FLAG-1 unchanged)');
:as_ma
select tests.ok_sql(format('select not exists (select 1 from public.my_features(%L))', :sa),
                    'HELP-R4 a viewer who can''t post gets no photo helpers (never shown to viewers)');
:as_admin
update public.spaces set viewers_can_post = true where id = :sa;
:as_ma
select tests.ok_sql(format($$select count(*) = 2 from public.my_features(%L) where feature like 'photo_helpers_%%'$$, :sa),
                    'HELP-R4 ...a relative the family lets post gets them');
:as_admin
update public.spaces set viewers_can_post = false where id = :sa;
:as_jo
select tests.ok_sql(format('select not exists (select 1 from public.my_features(%L))', :sb),
                    'HELP-R4 a family you aren''t in lists nothing');

-- ---------- a parent turns one off for the family ----------
:as_alex
select tests.lives(format($$insert into public.space_features (space_id, feature, enabled) values (%L, 'photo_helpers_duplicates', false)$$, :sa),
                   'HELP-R4 the owner turns the look-alike helper off for the family');
select tests.ok_sql(format($$select array_agg(feature) = array['photo_helpers_screens_blur'] from public.my_features(%L)$$, :sa),
                    'HELP-R4 ...it''s off; the screenshot helper stays on');
select tests.lives(format($$update public.space_features set enabled = true where space_id = %L and feature = 'photo_helpers_duplicates'$$, :sa),
                   'HELP-R4 ...and back on');
select tests.ok_sql(format($$select count(*) = 2 from public.my_features(%L)$$, :sa), 'HELP-R4 ...both on again');
:as_ma
select tests.throws_code(format($$insert into public.space_features (space_id, feature, enabled) values (%L, 'photo_helpers_screens_blur', false)$$, :sa),
                         'HELP-R4 a relative can''t switch a family helper (FLAG-3)', '42501');

-- ---------- Hearth's kill switch ----------
:as_admin
update private.feature_flags set enabled = false where feature = 'photo_helpers_screens_blur';
:as_alex
select tests.ok_sql(format($$select array_agg(feature) = array['photo_helpers_duplicates'] from public.my_features(%L)$$, :sa),
                    'HELP-R4 the global switch off turns the screenshot helper off for every family');
select tests.throws_code($$update private.feature_flags set enabled = true where feature = 'photo_helpers_screens_blur'$$,
                         'HELP-R4 ...and an app user can''t turn it back on', '42501');
:as_admin
select tests.ok_sql($$select count(*) = 2 and bool_and(f.feature like 'photo_helpers_%') from private.feature_flags f
                     where f.feature like 'photo_helpers_%'$$,
                    'HELP-R4 both helpers have a global row (the kill switch exists)');

-- ---------- report ----------
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo HELPERS RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
