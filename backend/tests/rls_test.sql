-- RLS / permission tests. Plain SQL + a tiny assertion harness (no pgTAP needed).
-- Run against a FRESH db with: stub -> migration -> seed -> this file (see tests/run.sh).
-- Each block switches identity with:  set role authenticated; set request.jwt.claim.sub = '<uuid>';
\set ON_ERROR_STOP 1
\pset footer off
set client_min_messages = warning;
\o /dev/null

-- ---------- harness ----------
create schema tests;
create table tests.results (n serial, ok boolean not null, description text not null);
create function tests.ok(p_ok boolean, p_desc text) returns void language sql as $$
  insert into tests.results (ok, description) values (coalesce(p_ok, false), p_desc) $$;
create function tests.throws(p_sql text, p_desc text, p_like text default null) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform tests.ok(p_like is null or sqlerrm ilike '%' || p_like || '%', p_desc || '  [' || sqlerrm || ']');
    return;
  end;
  perform tests.ok(false, p_desc || '  [expected an error, none raised]');
end $$;
create function tests.lives(p_sql text, p_desc text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform tests.ok(true, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlerrm || ']');
end $$;
grant usage on schema tests to authenticated, anon;
grant insert on tests.results to authenticated, anon;
grant usage on sequence tests.results_n_seq to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- ids
\set alex      '''a0000000-0000-0000-0000-00000000000a'''
\set blair     '''b0000000-0000-0000-0000-00000000000b'''
\set gma_riv   '''a0000000-0000-0000-0000-0000000000a1'''
\set gpa_riv   '''a0000000-0000-0000-0000-0000000000a2'''
\set gma_chen  '''b0000000-0000-0000-0000-0000000000b1'''
\set aunt_jo   '''c0000000-0000-0000-0000-0000000000c1'''
\set space_a   '''22222222-0000-0000-0000-00000000000a'''
\set space_b   '''22222222-0000-0000-0000-00000000000b'''
\set c_a_all   '''33333333-0000-0000-0000-0000000000a0'''
\set c_a_gp    '''33333333-0000-0000-0000-0000000000a1'''
\set c_a_co    '''33333333-0000-0000-0000-0000000000a2'''
\set c_b_gp    '''33333333-0000-0000-0000-0000000000b1'''
\set p_a_gp    '''55555555-0000-0000-0000-0000000000a1'''
\set p_a_co    '''55555555-0000-0000-0000-0000000000a2'''
\set p_a_all   '''55555555-0000-0000-0000-0000000000a3'''
\set p_b_gp    '''55555555-0000-0000-0000-0000000000b1'''
\set p_b_co    '''55555555-0000-0000-0000-0000000000b2'''

-- ======================================================================
-- 1. Grandma Chen (MOM's side) — must NOT see Dad's-side-only posts
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :gma_chen, false);
select tests.ok(not exists (select 1 from posts where id = :p_a_gp),          'Mom-side grandma cannot see post shared only with Dad-side grandparents');
select tests.ok(not public.can_view_post(:p_a_gp),                             'can_view_post() is false for Mom-side grandma on Dad-side post');
select tests.ok(not exists (select 1 from media_items where post_id = :p_a_gp),'...nor its media rows');
select tests.ok(not exists (select 1 from comments where post_id = :p_a_gp),   '...nor its comments');
select tests.ok(not exists (select 1 from reactions where post_id = :p_a_gp),  '...nor its reactions');
select tests.ok(not exists (select 1 from posts where id = :p_a_co),           'Mom-side grandma cannot see Dad''s co-parent-only post');
select tests.ok(exists (select 1 from posts where id = :p_a_all),              'Mom-side grandma CAN see Dad''s "Everyone" post (she is in that circle)');
select tests.ok(exists (select 1 from posts where id = :p_b_gp),               'Mom-side grandma sees Mom-side grandparents post');
select tests.ok(not exists (select 1 from posts where id = :p_b_co),           'Mom-side grandma cannot see Mom''s co-parent post');
select tests.ok((select count(*) from circles where space_id = :space_a) = 1,  'Mom-side grandma sees only 1 circle in Dad''s space (Everyone)');
select tests.throws(format('insert into comments (post_id, author_id, body) values (%L, %L, %L)', :p_a_gp, :gma_chen, 'hi'),
                    'Mom-side grandma cannot comment on a post she cannot see', 'row-level security');
select tests.throws(format('insert into reactions (post_id, user_id, emoji) values (%L, %L, %L)', :p_a_gp, :gma_chen, '👍'),
                    'Mom-side grandma cannot react to a post she cannot see', 'row-level security');
reset role;

-- ======================================================================
-- 2. Grandma Rivera (DAD's side)
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :gma_riv, false);
select tests.ok(exists (select 1 from posts where id = :p_a_gp),               'Dad-side grandma sees Dad-side grandparents post');
select tests.ok((select count(*) from media_items where post_id = :p_a_gp) = 2,'Dad-side grandma sees both media items');
select tests.ok(not exists (select 1 from posts where id = :p_b_gp),           'Dad-side grandma cannot see Mom-side grandparents post');
select tests.ok(not exists (select 1 from posts where id = :p_a_co),           'Dad-side grandma cannot see co-parent post');
select tests.ok(not exists (select 1 from circles where space_id = :space_b),  'Dad-side grandma sees no circles in Mom''s space');
select tests.ok(not exists (select 1 from circles where id = :c_a_co),         'Dad-side grandma cannot see the Co-parent circle exists');
select tests.lives(format('insert into comments (post_id, author_id, body) values (%L, %L, %L)', :p_a_gp, :gma_riv, 'So proud!'),
                   'Viewer can comment on a visible post');
select tests.lives(format('update reactions set emoji = %L where post_id = %L and user_id = %L', '😍', :p_a_gp, :gma_riv),
                   'Viewer can change own reaction');
select tests.throws(format('insert into reactions (post_id, user_id, emoji) values (%L, %L, %L)', :p_a_gp, :gma_riv, '👍'),
                    'One reaction per person per post', 'duplicate key');
select tests.throws(format('insert into posts (space_id, author_id, caption) values (%L, %L, %L)', :space_a, :gma_riv, 'x'),
                    'Viewer cannot post when viewers_can_post = false', 'row-level security');
select tests.throws(format('select public.create_post(gen_random_uuid(), %L::uuid, %L, array[%L]::uuid[])', :space_a, 'x', :c_a_all),
                    'Viewer cannot post via create_post() either', 'cannot post');
select tests.throws('select * from media_keys', 'Clients can never read wrapped media keys', 'permission denied');
select tests.throws('select * from storage_purge_queue', 'Clients cannot read the purge queue', 'permission denied');
select tests.ok(not exists (select 1 from post_views where user_id <> auth.uid()), 'Viewer sees only own seen-receipts');
select tests.throws(format('update spaces set plan = %L where id = %L', 'family', :space_a),
                    'Viewer cannot change billing plan', 'permission denied');
reset role;

-- ======================================================================
-- 3. Blair = co-parent in Dad's space — sees ONLY co-parent posts there
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.ok((select array_agg(id::text) from posts where space_id = :space_a) = array[:p_a_co],
                'Co-parent sees exactly the co-parent post in the other household''s space');
select tests.ok((select array_agg(name) from circles where space_id = :space_a) = array['Co-parent'],
                'Co-parent sees only the Co-parent circle (cannot see Dad''s family circles)');
select tests.ok(not exists (select 1 from circle_members cm join circles c on c.id = cm.circle_id
                            where c.space_id = :space_a and cm.user_id <> auth.uid()),
                'Co-parent cannot list other members of Dad''s circles');
select tests.ok(not exists (select 1 from post_audiences where post_id = :p_a_co and circle_id <> :c_a_co),
                'Co-parent sees no other audience circles on the post');
select tests.ok(not exists (select 1 from space_members where space_id = :space_a and role = 'viewer' and user_id <> auth.uid()),
                'Co-parent cannot enumerate Dad''s viewers (grandparents)');
select tests.ok(not exists (select 1 from profiles where id = :gma_riv),       'Co-parent cannot see Dad-side grandma''s profile');
select tests.ok((select count(*) from posts where space_id = :space_b) = 2,    'Blair sees all her own posts in her space');
select tests.ok(exists (select 1 from post_views where post_id = :p_b_gp and user_id = :gma_chen),
                'Family-plan author sees "seen by" receipts');
select tests.throws(format('select public.set_post_audience(%L, array[%L]::uuid[])', :p_a_co, :c_a_all),
                    'Non-author cannot change a post''s audience', 'only the author');
with d as (delete from post_audiences where post_id = :p_a_co returning 1)
select tests.ok((select count(*) from d) = 0, 'Non-author delete on post_audiences affects 0 rows');
with d as (update posts set caption = 'hacked' where id = :p_a_co returning 1)
select tests.ok((select count(*) from d) = 0, 'Non-author cannot edit post');
select tests.throws(format('select public.create_invite(%L, %L, array[%L]::uuid[])', :space_a, 'viewer', :c_a_co),
                    'Co-parent (viewer) cannot create invites in the other space', 'only space owners');
reset role;

-- ======================================================================
-- 4. Alex (Dad, owner of space A)
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select tests.ok((select count(*) from posts where space_id = :space_a) = 3,    'Author sees all own posts');
select tests.ok(exists (select 1 from posts where id = :p_b_co),               'Alex sees Blair''s co-parent post');
select tests.ok(not exists (select 1 from posts where id = :p_b_gp),           'Alex cannot see Blair''s Mom-side grandparents post');
select tests.ok((select array_agg(name) from circles where space_id = :space_b) = array['Co-parent'],
                'Alex sees only the Co-parent circle in Blair''s space');
select tests.ok(not exists (select 1 from post_views where post_id = :p_a_gp and user_id <> auth.uid()),
                'Free-plan author cannot read "seen by" receipts (paid feature)');
select tests.throws(format('update spaces set plan = %L where id = %L', 'family', :space_a),
                    'Owner cannot self-upgrade plan from client', 'permission denied');
select tests.throws(format('update posts set author_id = %L where id = %L', :blair, :p_a_gp),
                    'author_id not updatable', 'permission denied');
reset role;

-- ======================================================================
-- 5. AUDIENCE CHANGE REVOKES ACCESS IMMEDIATELY
-- ======================================================================
-- widen: Dad-side post -> Everyone (Grandma Chen is in Everyone)
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select public.set_post_audience(:p_a_gp, array[:c_a_all]::uuid[]);
select set_config('request.jwt.claim.sub', :gma_chen, false);
select tests.ok(exists (select 1 from posts where id = :p_a_gp),               'After widening to Everyone, Mom-side grandma sees the post');
select tests.ok((select count(*) from media_items where post_id = :p_a_gp) = 2,'...and its media');
-- narrow back
select set_config('request.jwt.claim.sub', :alex, false);
select public.set_post_audience(:p_a_gp, array[:c_a_gp]::uuid[]);
select set_config('request.jwt.claim.sub', :gma_chen, false);
select tests.ok(not exists (select 1 from posts where id = :p_a_gp),           'After narrowing back, Mom-side grandma loses access immediately');
select tests.ok(not public.can_view_post(:p_a_gp),                             '...and can_view_post() (used by sign-media) is false');
select tests.ok(not exists (select 1 from media_items where post_id = :p_a_gp),'...and media rows are gone from her view');
-- co-parent post moved to grandparents -> Blair loses it
select set_config('request.jwt.claim.sub', :alex, false);
select public.set_post_audience(:p_a_co, array[:c_a_gp]::uuid[]);
select set_config('request.jwt.claim.sub', :blair, false);
select tests.ok(not exists (select 1 from posts where id = :p_a_co),           'Moving co-parent post to grandparents revokes co-parent access');
select set_config('request.jwt.claim.sub', :gpa_riv, false);
select tests.ok(exists (select 1 from posts where id = :p_a_co),               '...and grants Dad-side grandpa access');
-- removing someone from a circle revokes too
select set_config('request.jwt.claim.sub', :alex, false);
delete from circle_members where circle_id = :c_a_gp and user_id = :gpa_riv;
select set_config('request.jwt.claim.sub', :gpa_riv, false);
select tests.ok(not exists (select 1 from posts where id = :p_a_gp),           'Removing grandpa from the circle revokes his access');
-- empty audience is refused
select set_config('request.jwt.claim.sub', :alex, false);
select tests.throws(format('select public.set_post_audience(%L, %L::uuid[])', :p_a_gp, '{}'),
                    'Cannot set an empty audience', 'at least one circle');
select tests.throws(format('delete from post_audiences where post_id = %L; set constraints all immediate', :p_a_gp),
                    'Deleting the last audience row of a published post is refused', 'at least one audience');
select tests.throws(format('insert into post_audiences (post_id, circle_id) values (%L, %L)', :p_a_gp, :c_b_gp),
                    'Audience circle from another space is refused', 'post''s space');
reset role;

-- ======================================================================
-- 6. Uploads: EXIF flag + free-tier video cap (10/month)
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select tests.throws(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":false}]')$q$, :p_a_all),
                    'Upload without exif_stripped=true is refused', 'exif_stripped');
select tests.lives(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                   'Stripped photo upload is accepted');
select tests.ok((select display_key from media_items where post_id = :p_a_all order by position desc limit 1)
                like 's/' || :space_a || '/p/' || :p_a_all || '/m/%/display', 'Object key is derived server-side');
-- 1 video already this month in seed; 9 more fit
select tests.lives(format($q$select * from public.prepare_media_upload(%L, (select jsonb_agg(jsonb_build_object('kind','video','mime_type','video/mp4','width',1920,'height',1080,'duration_ms',5000,'byte_size',1000,'thumb_byte_size',10,'exif_stripped',true)) from generate_series(1,9)))$q$, :p_a_all),
                   'Free space can upload videos up to 10 this month');
select tests.ok((select (public.space_upload_quota(:space_a)->>'videos_this_month')::int) = 10, 'Quota shows 10/10 used');
select tests.throws(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"video","mime_type":"video/mp4","width":10,"height":10,"duration_ms":1000,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                    '11th video on free plan is refused', 'free_video_cap_reached');
select tests.lives(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                   'Photos are not capped');
select set_config('request.jwt.claim.sub', :gma_chen, false);
select tests.ok(not exists (select 1 from media_items where post_id = :p_a_all and upload_status = 'pending'),
                'Other viewers never see pending (not yet finalized) media');
select tests.throws(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                    'Non-author cannot upload to someone else''s post', 'cannot upload');
select tests.throws('select public.mark_media_upload_result(gen_random_uuid(), true)',
                    'Clients cannot mark uploads ready (service-role only)', 'permission denied');
-- draft -> publish flow
select set_config('request.jwt.claim.sub', :alex, false);
select public.create_post(gen_random_uuid(), :space_a, 'Draft test', array[:c_a_gp]::uuid[]) as draft_id \gset
select tests.throws(format('select public.publish_post(%L)', :'draft_id'), 'Cannot publish before media finish uploading', 'finish uploading');
select set_config('request.jwt.claim.sub', :gma_riv, false);
select tests.ok(not exists (select 1 from posts where id = :'draft_id'), 'Drafts are invisible to the audience');
select set_config('request.jwt.claim.sub', :alex, false);
reset role;
update spaces set plan = 'family' where id = :space_a;  -- (lift cap just for this setup)
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select media_id as draft_media from public.prepare_media_upload(:'draft_id', '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]') \gset
reset role;
select public.mark_media_upload_result(:'draft_media', true);   -- what sign-media finalize does as service_role
update spaces set plan = 'free' where id = :space_a;
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select tests.lives(format('select public.publish_post(%L)', :'draft_id'), 'Author publishes once media is ready');
select set_config('request.jwt.claim.sub', :gma_riv, false);
select tests.ok(exists (select 1 from posts where id = :'draft_id' and published_at is not null), 'Published post is visible to its audience');
reset role;
-- family plan has no cap
update spaces set plan = 'family' where id = :space_a;
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select tests.lives(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"video","mime_type":"video/mp4","width":10,"height":10,"duration_ms":1000,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                   'Family plan is not video-capped');
reset role;

-- ======================================================================
-- 7. Invites (code, expiry, circle placement) + magic-link-only user
-- ======================================================================
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-0000000000d1', 'uncle.ray@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select code as invite_code from public.create_invite(:space_a, 'viewer', array[:c_a_gp]::uuid[], 'email', 'Uncle.Ray@example.com') \gset
reset role;   -- (S9) clients can no longer read code_hash at all; check the stored value as superuser
select tests.ok(not exists (select 1 from invites where code_hash = :'invite_code'), 'Invite code stored hashed, not plaintext');
set role authenticated;
select set_config('request.jwt.claim.sub', :aunt_jo, false);
select tests.throws(format('select public.redeem_invite(%L)', :'invite_code'),
                    'Invite targeted at an email cannot be redeemed by someone else', 'invalid or expired');
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000d1', false);
select tests.ok(not exists (select 1 from posts),                              'Before redeeming, new user sees nothing');
select tests.lives(format('select public.redeem_invite(%L)', lower(:'invite_code')), 'Invitee redeems code (case-insensitive)');
select tests.ok(exists (select 1 from posts where id = :p_a_gp),               'Invitee lands in the invited circle and sees its posts');
select tests.ok(not exists (select 1 from posts where id = :p_a_all),          'Invitee does not see posts for circles they were not invited to');
select tests.ok((select email_digest from notification_prefs where space_id = :space_a and user_id = auth.uid()) = 'weekly',
                'Viewer defaults to weekly email digest');
select tests.throws(format('select public.redeem_invite(%L)', :'invite_code'), 'Single-use invite cannot be reused', 'invalid or expired');
select tests.throws(format('insert into notification_prefs (user_id, space_id) values (%L, %L)', auth.uid(), :space_b),
                    'Cannot set notification prefs for a space you are not in', 'row-level security');
reset role;
update invites set created_at = now() - interval '2 days', expires_at = now() - interval '1 day', use_count = 0;
set role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000d1', false);
select tests.throws(format('select public.redeem_invite(%L)', :'invite_code'), 'Expired invite is refused', 'invalid or expired');
reset role;

-- ======================================================================
-- 8. Soft delete, anon, export
-- ======================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select public.delete_post(:p_b_co);   -- soft delete goes through the API (0002)
select set_config('request.jwt.claim.sub', :alex, false);
select tests.ok(not exists (select 1 from posts where id = :p_b_co),           'Soft-deleted post disappears for viewers');
select tests.ok(not public.can_view_post(:p_b_co),                             '...and cannot be signed');
select tests.ok((public.export_my_data()->'posts') is not null and jsonb_array_length(public.export_my_data()->'posts') = 4,
                'Account export returns the caller''s own posts');
select tests.ok(public.export_my_data()::text not like '%Baking with Grandma Chen%', 'Export contains no one else''s private posts');
reset role;
select tests.ok((public.purge_soft_deleted(interval '0 seconds')->>'posts')::int = 1, 'Purge job hard-deletes soft-deleted posts');
select tests.ok((select count(*) from storage_purge_queue) >= 2,               'Purge enqueues B2 objects for deletion');

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tests.throws('select * from posts', 'anon has no table access', 'permission denied');
select tests.throws(format('select public.can_view_post(%L)', :p_a_all), 'anon cannot call RPCs', 'permission denied');
reset role;

-- ======================================================================
-- 9. Security review regressions
-- ======================================================================
-- ok_sql(): like ok(), but records a failure instead of aborting if the query errors.
create function tests.ok_sql(p_sql text, p_desc text) returns void
language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  perform tests.ok(v, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlerrm || ']');
end $$;
grant execute on function tests.ok_sql(text, text) to authenticated, anon;
\set sam  '''44444444-0000-0000-0000-000000000001'''
\set baby '''44444444-0000-0000-0000-000000000002'''

-- 9a. Billing details and the monthly video counter are household-internal.
update spaces set plan_customer_ref = 'cus_secret', videos_this_month = 7,
       videos_month = (date_trunc('month', now() at time zone 'utc'))::date where id = :space_a;
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.throws(format('select videos_this_month from spaces where id = %L', :space_a),
                    'Co-parent cannot read the other household''s monthly video counter', 'permission denied');
select tests.throws(format('select plan_customer_ref from spaces where id = %L', :space_a),
                    'Co-parent cannot read the other household''s billing customer ref', 'permission denied');
select tests.ok((public.space_upload_quota(:space_a)->>'videos_this_month') is null,
                'space_upload_quota() hides the upload count from members who cannot post');
select tests.ok_sql(format('select exists (select id, name, plan from spaces where id = %L)', :space_a),
                    'Members can still read the space''s name and plan');
select set_config('request.jwt.claim.sub', :alex, false);
select tests.ok((public.space_upload_quota(:space_a)->>'videos_this_month')::int = 7, 'Owner still sees the upload count');
reset role;

-- 9b. Free-tier cap: a video cannot be smuggled in as kind=photo.
update spaces set plan = 'free', videos_this_month = 10 where id = :space_a;
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select tests.throws(format($q$select * from public.prepare_media_upload(%L, '[{"kind":"photo","mime_type":"video/mp4","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]')$q$, :p_a_all),
                    'A video declared as kind=photo is refused (free-tier cap bypass)', 'check constraint');
reset role;

-- 9c. Children: linking a child to a space reveals nothing; birth dates are guardian-only.
update children set birth_date = '2019-05-01' where id = :sam;
insert into children (id, display_name, birth_date, created_by) values (:baby, 'Baby Rivera', '2026-08-01', :alex);
insert into space_children (space_id, child_id) values (:space_a, :baby);
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.ok(not exists (select 1 from children where id = :baby),
                'Co-parent cannot see a child the other household linked to its space but never shared');
select tests.ok(not exists (select 1 from space_children where child_id = :baby),
                '...nor the space_children link row');
select set_config('request.jwt.claim.sub', :gma_chen, false);
select tests.ok(exists (select 1 from children where id = :sam), 'Viewer still sees a child tagged in a post they can see');
select tests.throws('select birth_date from children', 'Non-guardian cannot read a child''s birth date', 'permission denied');
select tests.ok_sql(format('select public.child_birth_date(%L) is null', :sam), '...nor via child_birth_date()');
select set_config('request.jwt.claim.sub', :alex, false);
select tests.ok(exists (select 1 from children where id = :baby), 'Space manager sees the linked child');
select tests.ok_sql(format('select public.child_birth_date(%L) = date %L', :sam, '2019-05-01'),
                    'Guardian reads the birth date via child_birth_date()');
reset role;

-- 9d. Viewer posting rights and removed members.
update spaces set viewers_can_post = true, plan = 'family' where id = :space_a;
insert into circle_members (circle_id, user_id) values (:c_a_co, :alex);
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select public.create_post(gen_random_uuid(), :space_a, 'Blair draft', array[:c_a_co]::uuid[]) as b_draft \gset
select public.create_post(gen_random_uuid(), :space_a, 'Blair published', array[:c_a_co]::uuid[]) as b_pub \gset
select media_id as b_m1 from public.prepare_media_upload(:'b_draft', '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]') \gset
select media_id as b_m2 from public.prepare_media_upload(:'b_pub', '[{"kind":"photo","mime_type":"image/jpeg","width":10,"height":10,"byte_size":100,"thumb_byte_size":10,"exif_stripped":true}]') \gset
reset role;
select public.mark_media_upload_result(:'b_m1', true), public.mark_media_upload_result(:'b_m2', true);
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select public.publish_post(:'b_pub');
reset role;
update spaces set viewers_can_post = false where id = :space_a;
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.throws(format('select public.publish_post(%L)', :'b_draft'),
                    'Viewer cannot publish a draft after viewers_can_post is turned off', 'cannot post');
reset role;
delete from space_members where space_id = :space_a and user_id = :blair;   -- Alex removes Blair
insert into comments (post_id, author_id, body) values (:'b_pub', :alex, 'said after Blair was removed');
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.ok(not exists (select 1 from posts where space_id = :space_a),
                'Removed member sees nothing in the space, including their own old posts');
select tests.ok(not public.can_view_post(:'b_pub'), '...can_view_post() is false, so sign-media will not sign them');
select tests.ok(not exists (select 1 from comments where post_id = :'b_pub'), '...and new comments on them stay hidden');
select tests.throws(format('select public.set_post_audience(%L, array[%L]::uuid[])', :'b_pub', :c_a_co),
                    'Removed member cannot re-target an old post''s audience', 'only the author');
select tests.throws(format('select public.publish_post(%L)', :'b_draft'),
                    'Removed member cannot publish an old draft into the space', 'not found');
reset role;

-- 9e. Losing access to a post also freezes your comments on it (unfiltered UPDATE skips SELECT policies).
set role authenticated;
select set_config('request.jwt.claim.sub', :gpa_riv, false);
do $$ begin update public.comments set body = 'edited after losing access'; exception when others then null; end $$;
reset role;
select tests.ok(not exists (select 1 from comments where body = 'edited after losing access'),
                'Commenter who lost access to a post cannot edit their comment on it');

-- 9f. S12 / BETA-REPLY-4: an author removed from the space can't edit their old captions.
insert into space_members (space_id, user_id, role, invited_by) values (:space_a, :aunt_jo, 'adult', :alex)
  on conflict (space_id, user_id) do update set role = 'adult';
insert into posts (id, space_id, author_id, caption) values ('55555555-0000-0000-0000-0000000000c9', :space_a, :aunt_jo, 'Jo''s old post');
delete from space_members where space_id = :space_a and user_id = :aunt_jo;
set role authenticated;
select set_config('request.jwt.claim.sub', :aunt_jo, false);
do $$ begin update public.posts set caption = 'edited after removal';  -- unfiltered: skips SELECT policies
          exception when others then null; end $$;
reset role;
select tests.ok((select caption from posts where id = '55555555-0000-0000-0000-0000000000c9') = 'Jo''s old post',
                'S12 / BETA-REPLY-4: an author removed from the space cannot edit captions on their old posts');

-- 10. BETA-AUD-7 (A2 guilt-free): nobody can read another member's last-active,
--     login, online or device details. "Seen by" (who has seen) stays: NOTIFY-6 is Chase's call.
select tests.ok(not exists (
  select 1 from information_schema.column_privileges
  where grantee in ('authenticated', 'anon') and privilege_type = 'SELECT'
    and table_schema in ('public', 'auth')
    and (column_name ~* '(last_|seen_at|login|sign_in|online|user_agent|ip_addr|device)')),
  'BETA-AUD-7: no app-readable column holds last-seen, login, online or device details');
set role authenticated;
select set_config('request.jwt.claim.sub', :blair, false);
select tests.ok(exists (select 1 from post_views where post_id = :p_b_gp and user_id = :gma_chen),
                'BETA-AUD-7: the family-plan author still sees who has seen the post (Seen by unchanged)');
select tests.throws(format('select last_seen_at from public.post_views where post_id = %L', :p_b_gp),
                    'BETA-AUD-7: ...but not when each person last looked', 'permission denied');
select tests.ok(not exists (select 1 from push_tokens where user_id <> auth.uid()),
                'BETA-AUD-7: nobody sees another member''s phones');
reset role;
select tests.throws('set role authenticated; select count(*) from auth.users',
                    'BETA-AUD-7: app users cannot read sign-in records (auth.users)', 'permission denied');
reset role;

-- ======================================================================
-- Summary
-- ======================================================================
\o
\pset format aligned
select n, case when ok then 'ok' else 'NOT OK' end as result, description from tests.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results \gset
\echo
\echo RESULT: :passed passed, :failed failed
select :failed = 0 as all_ok \gset
\if :all_ok
\else
  \echo SOME TESTS FAILED
  select 1/0 as force_nonzero_exit;
\endif
