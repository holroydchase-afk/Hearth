-- =============================================================================
-- Hearth 0002: beta API (API.md), invite hardening (S9, S10), RLS performance
-- =============================================================================
-- * RPCs: my_spaces, my_circles, get_feed, create_post (idempotent), publish_post
--   (idempotent), delete_post, toggle_heart, add_comment (idempotent), get_comments,
--   mark_seen, invite_preview (anon), create_invite -> {invite_id, code, link, expires_at},
--   redeem_invite -> space_id.
-- * Error codes exactly as API.md. A post the caller can't see is P0002, never 42501.
-- * S9: invite codes are stored as HMAC-SHA256(pepper, code). The pepper lives in
--   private.secrets (no client grants) and the hash columns are not client-readable.
--   Links carry a 160-bit token; the 10-char typed code is rate limited.
-- * S10: 10 failed redeem/preview attempts per account, and per client IP, per 10
--   minutes -> 54000. Failures must survive the failed request, but a raised error
--   rolls back the transaction. So when called through PostgREST (request.method is
--   set) these two RPCs RETURN the error body ({code, message, details, hint}) with
--   response.status 400/429 and the failure row commits. Called from plain SQL they
--   raise as usual. supabase-js sees the same {error: {code: '22023'}} either way.
-- * RLS: auth.uid() is wrapped as (select auth.uid()); row-independent membership
--   lookups are uuid[] helpers wrapped in (select ...) so they run once per statement.
-- * The feed reads post_audiences.feed_at (denormalized published_at, null for drafts
--   and deleted posts) so a page is a few short index scans, whatever the space size.
-- NO CONTENT IS USED FOR AI/ML TRAINING, ADVERTISING OR PROFILING (see 0001 header).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Private schema: secrets, rate-limit log, policy helpers. Not exposed by PostgREST.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table private.secrets (
  name        text primary key,
  value       text not null,
  created_at  timestamptz not null default now()
);
insert into private.secrets (name, value) values
  ('invite_pepper',    encode(extensions.gen_random_bytes(32), 'hex')),
  ('invite_link_base', 'https://hearth.family/i/')
on conflict (name) do nothing;

create table private.rate_limit_events (
  key     text not null,            -- 'user:<uuid>' | 'ip:<addr>' | 'anon:all'
  action  text not null,            -- 'redeem' | 'preview'
  at      timestamptz not null default now()
);
create index on private.rate_limit_events (key, at);
create index on private.rate_limit_events (at);

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.posts    add column client_id uuid;
alter table public.posts    add constraint posts_author_client_key unique (author_id, client_id);
alter table public.comments add column client_id uuid;
alter table public.comments add constraint comments_author_client_key unique (author_id, client_id);
alter table public.post_audiences add column feed_at timestamptz;   -- = posts.published_at while published and not deleted
alter table public.invites  add column link_hash text unique;

-- Old invites were sha256(code) and can't be re-keyed without the plaintext. Retire them.
update public.invites set revoked_at = now() where revoked_at is null;

-- ---------------------------------------------------------------------------
-- feed_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.tg_audience_feed_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select case when p.status = 'published' and p.deleted_at is null then p.published_at end
    into new.feed_at from public.posts p where p.id = new.post_id;
  return new;
end $$;
create trigger audience_feed_at before insert on public.post_audiences
  for each row execute function private.tg_audience_feed_at();

create or replace function private.tg_post_feed_at() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new timestamptz := case when new.status = 'published' and new.deleted_at is null then new.published_at end;
  v_old timestamptz := case when old.status = 'published' and old.deleted_at is null then old.published_at end;
begin
  if v_new is distinct from v_old then
    update public.post_audiences set feed_at = v_new where post_id = new.id;
  end if;
  return null;
end $$;
create trigger post_feed_at after update of status, published_at, deleted_at on public.posts
  for each row execute function private.tg_post_feed_at();

-- The same-space check only matters when the audience row itself changes, not when
-- feed_at is refreshed (a soft-deleted circle must not block deleting a post).
drop trigger audience_same_space on public.post_audiences;
create trigger audience_same_space before insert or update of post_id, circle_id on public.post_audiences
  for each row execute function public.tg_audience_same_space();

update public.post_audiences pa set feed_at = p.published_at
  from public.posts p
 where p.id = pa.post_id and p.status = 'published' and p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Indexes: feed paths + every foreign key
-- ---------------------------------------------------------------------------
drop index if exists public.posts_feed_idx;
create index posts_feed_idx on public.posts (space_id, published_at desc, id desc)
  where deleted_at is null and status = 'published';
create index posts_author_feed_idx on public.posts (author_id, space_id, published_at desc, id desc)
  where deleted_at is null and status = 'published';
create index post_audiences_feed_idx on public.post_audiences (circle_id, feed_at desc, post_id desc)
  where feed_at is not null;

create index if not exists households_created_by_idx      on public.households (created_by);
create index if not exists spaces_created_by_idx          on public.spaces (created_by);
create index if not exists space_members_invited_by_idx   on public.space_members (invited_by);
create index if not exists circles_created_by_idx         on public.circles (created_by);
create index if not exists circle_members_added_by_idx    on public.circle_members (added_by);
create index if not exists children_created_by_idx        on public.children (created_by);
create index if not exists child_guardians_added_by_idx   on public.child_guardians (added_by);
create index if not exists space_children_added_by_idx    on public.space_children (added_by);
create index if not exists invites_created_by_idx         on public.invites (created_by);
create index if not exists media_items_uploader_id_idx    on public.media_items (uploader_id);

-- ---------------------------------------------------------------------------
-- Once-per-statement membership helpers (use as: col = any ((select private.f())::uuid[]))
-- ---------------------------------------------------------------------------
create or replace function private.my_space_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(sm.space_id), '{}')
  from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  where sm.user_id = auth.uid()
$$;
create or replace function private.my_managed_space_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(sm.space_id), '{}')
  from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  where sm.user_id = auth.uid() and sm.role in ('owner', 'adult')
$$;
create or replace function private.my_owned_space_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(sm.space_id), '{}')
  from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  where sm.user_id = auth.uid() and sm.role = 'owner'
$$;
-- circles I'm in (live circle, live space, and I'm still a member of that space)
create or replace function private.my_circle_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(cm.circle_id), '{}')
  from public.circle_members cm
  join public.circles c        on c.id = cm.circle_id and c.deleted_at is null
  join public.space_members sm on sm.space_id = c.space_id and sm.user_id = cm.user_id
  join public.spaces s         on s.id = c.space_id and s.deleted_at is null
  where cm.user_id = auth.uid()
$$;
-- live circles in spaces I manage
create or replace function private.my_managed_circle_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}')
  from public.circles c
  join public.space_members sm on sm.space_id = c.space_id and sm.user_id = auth.uid() and sm.role in ('owner', 'adult')
  join public.spaces s         on s.id = c.space_id and s.deleted_at is null
  where c.deleted_at is null
$$;
create or replace function private.my_household_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(household_id), '{}') from public.household_members where user_id = auth.uid()
$$;
create or replace function private.my_admin_household_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(household_id), '{}') from public.household_members where user_id = auth.uid() and role = 'admin'
$$;
create or replace function private.my_guardian_child_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(child_id), '{}') from public.child_guardians where user_id = auth.uid()
$$;
-- children linked to spaces I manage
create or replace function private.my_managed_child_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct sc.child_id), '{}')
  from public.space_children sc
  join public.space_members sm on sm.space_id = sc.space_id and sm.user_id = auth.uid() and sm.role in ('owner', 'adult')
  join public.spaces s         on s.id = sc.space_id and s.deleted_at is null
$$;
-- one index probe, no nested RLS on post_audiences
create or replace function private.post_in_circles(p_post uuid, p_circles uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.post_audiences pa where pa.post_id = p_post and pa.circle_id = any (p_circles))
$$;

-- ---------------------------------------------------------------------------
-- RLS policies, rewritten (same rules as 0001, cheaper evaluation)
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using ((deleted_at is null and public.can_see_profile(id)) or id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- households
create policy households_select on public.households for select to authenticated
  using (id = any ((select private.my_household_ids())::uuid[]));
create policy households_update on public.households for update to authenticated
  using (id = any ((select private.my_admin_household_ids())::uuid[]));
create policy household_members_select on public.household_members for select to authenticated
  using (household_id = any ((select private.my_household_ids())::uuid[]));
create policy household_members_insert on public.household_members for insert to authenticated
  with check (household_id = any ((select private.my_admin_household_ids())::uuid[]));
create policy household_members_delete on public.household_members for delete to authenticated
  using (user_id = (select auth.uid()) or household_id = any ((select private.my_admin_household_ids())::uuid[]));

-- spaces
create policy spaces_select on public.spaces for select to authenticated
  using (deleted_at is null and id = any ((select private.my_space_ids())::uuid[]));
create policy spaces_update on public.spaces for update to authenticated
  using (id = any ((select private.my_owned_space_ids())::uuid[])) with check (true);

-- space_members: managers see everyone; others see themselves + the space's grown-ups
create policy space_members_select on public.space_members for select to authenticated
  using (user_id = (select auth.uid())
         or space_id = any ((select private.my_managed_space_ids())::uuid[])
         or (space_id = any ((select private.my_space_ids())::uuid[]) and role in ('owner', 'adult')));
create policy space_members_update on public.space_members for update to authenticated
  using (space_id = any ((select private.my_owned_space_ids())::uuid[]))
  with check (space_id = any ((select private.my_owned_space_ids())::uuid[]));
create policy space_members_delete on public.space_members for delete to authenticated
  using (user_id = (select auth.uid())
         or space_id = any ((select private.my_owned_space_ids())::uuid[])
         or (space_id = any ((select private.my_managed_space_ids())::uuid[]) and role = 'viewer'));

-- circles: managers see every live circle in their space; others only circles they're in
create policy circles_select on public.circles for select to authenticated
  using (deleted_at is null
         and (space_id = any ((select private.my_managed_space_ids())::uuid[]) or id = any ((select private.my_circle_ids())::uuid[])));
create policy circles_insert on public.circles for insert to authenticated
  with check (space_id = any ((select private.my_managed_space_ids())::uuid[]) and created_by = (select auth.uid()));
create policy circles_update on public.circles for update to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[]))
  with check (space_id = any ((select private.my_managed_space_ids())::uuid[]));

create policy circle_members_select on public.circle_members for select to authenticated
  using (user_id = (select auth.uid()) or circle_id = any ((select private.my_managed_circle_ids())::uuid[]));
create policy circle_members_insert on public.circle_members for insert to authenticated
  with check (circle_id = any ((select private.my_managed_circle_ids())::uuid[]));
create policy circle_members_delete on public.circle_members for delete to authenticated
  using (user_id = (select auth.uid()) or circle_id = any ((select private.my_managed_circle_ids())::uuid[]));

-- children: linking grants nothing by itself
create policy children_select on public.children for select to authenticated
  using (id = any ((select private.my_guardian_child_ids())::uuid[])
         or id = any ((select private.my_managed_child_ids())::uuid[])
         or exists (select 1 from public.post_children pc
                    where pc.child_id = children.id and public.can_view_post(pc.post_id)));
create policy children_insert on public.children for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy children_update on public.children for update to authenticated
  using (id = any ((select private.my_guardian_child_ids())::uuid[]))
  with check (id = any ((select private.my_guardian_child_ids())::uuid[]));

create policy child_guardians_select on public.child_guardians for select to authenticated
  using (child_id = any ((select private.my_guardian_child_ids())::uuid[]));
create policy child_guardians_insert on public.child_guardians for insert to authenticated
  with check (child_id = any ((select private.my_guardian_child_ids())::uuid[]));
create policy child_guardians_delete on public.child_guardians for delete to authenticated
  using (user_id = (select auth.uid()));

create policy space_children_select on public.space_children for select to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[])
         or (space_id = any ((select private.my_space_ids())::uuid[])
             and (child_id = any ((select private.my_guardian_child_ids())::uuid[])
                  or exists (select 1 from public.post_children pc join public.posts p on p.id = pc.post_id
                             where pc.child_id = space_children.child_id and p.space_id = space_children.space_id
                               and public.can_view_post(p.id)))));
create policy space_children_insert on public.space_children for insert to authenticated
  with check (space_id = any ((select private.my_managed_space_ids())::uuid[])
              and child_id = any ((select private.my_guardian_child_ids())::uuid[]));
create policy space_children_delete on public.space_children for delete to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[])
         or child_id = any ((select private.my_guardian_child_ids())::uuid[]));

-- invites (hash columns are not even selectable; see grants)
create policy invites_select on public.invites for select to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[]));
create policy invites_update on public.invites for update to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[]))
  with check (space_id = any ((select private.my_managed_space_ids())::uuid[]));
create policy invite_circles_select on public.invite_circles for select to authenticated
  using (circle_id = any ((select private.my_managed_circle_ids())::uuid[]));

-- posts: same rule as can_view_post(), set-based
create policy posts_select on public.posts for select to authenticated
  using (deleted_at is null
         and space_id = any ((select private.my_space_ids())::uuid[])
         and (author_id = (select auth.uid())
              or (status = 'published' and private.post_in_circles(id, (select private.my_circle_ids())))));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'draft' and deleted_at is null
              and public.can_post_in_space(space_id));
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null)
  with check (author_id = (select auth.uid()));

create policy post_audiences_select on public.post_audiences for select to authenticated
  using (public.is_post_author(post_id)
         or (public.can_view_post(post_id)
             and (circle_id = any ((select private.my_circle_ids())::uuid[])
                  or circle_id = any ((select private.my_managed_circle_ids())::uuid[]))));
create policy post_audiences_insert on public.post_audiences for insert to authenticated
  with check (public.is_post_author(post_id));
create policy post_audiences_delete on public.post_audiences for delete to authenticated
  using (public.is_post_author(post_id));

create policy post_children_select on public.post_children for select to authenticated
  using (public.can_view_post(post_id));
create policy post_children_insert on public.post_children for insert to authenticated
  with check (public.is_post_author(post_id));
create policy post_children_delete on public.post_children for delete to authenticated
  using (public.is_post_author(post_id));

create policy media_items_select on public.media_items for select to authenticated
  using (public.can_view_post(post_id) and (upload_status = 'ready' or uploader_id = (select auth.uid())));
create policy media_items_insert on public.media_items for insert to authenticated
  with check (public.is_post_author(post_id)
              and public.can_post_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy media_items_delete on public.media_items for delete to authenticated
  using (public.is_post_author(post_id));

create policy reactions_select on public.reactions for select to authenticated
  using (public.can_view_post(post_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id)
              and public.can_comment_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.can_view_post(post_id));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on public.comments for select to authenticated
  using (deleted_at is null and public.can_view_post(post_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and deleted_at is null and public.can_view_post(post_id)
              and public.can_comment_in_space((select p.space_id from public.posts p where p.id = post_id)));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null and public.can_view_post(post_id))
  with check (author_id = (select auth.uid()) and public.can_view_post(post_id));

create policy post_views_select on public.post_views for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.posts p join public.spaces s on s.id = p.space_id
                    where p.id = post_id and p.author_id = (select auth.uid()) and s.plan = 'family'));
create policy post_views_insert on public.post_views for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));
create policy post_views_update on public.post_views for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy notification_prefs_all on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and space_id = any ((select private.my_space_ids())::uuid[]));
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy account_exports_select on public.account_exports for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Errors that must not roll back (S10). See header.
-- ---------------------------------------------------------------------------
create or replace function private.api_error(p_code text, p_message text, p_http integer) returns json
language plpgsql set search_path = '' as $$
begin
  if nullif(current_setting('request.method', true), '') is null then
    raise exception using errcode = p_code, message = p_message;
  end if;
  perform set_config('response.status', p_http::text, true);
  return json_build_object('code', p_code, 'details', null, 'hint', null, 'message', p_message);
end $$;

-- Client IP as seen through the Supabase gateway. cf-connecting-ip is set by
-- Cloudflare on hosted Supabase; otherwise the last X-Forwarded-For hop (the one
-- our own proxy appended). Clients can't choose the last hop.
create or replace function private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare h json; xff text[];
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  if h is null then return null; end if;
  if nullif(btrim(h->>'cf-connecting-ip'), '') is not null then return btrim(h->>'cf-connecting-ip'); end if;
  xff := string_to_array(h->>'x-forwarded-for', ',');
  if cardinality(xff) > 0 then return nullif(btrim(xff[cardinality(xff)]), ''); end if;
  return null;
end $$;

create or replace function private.rl_keys() returns text[]
language plpgsql stable set search_path = '' as $$
declare v_ip text := private.client_ip(); k text[] := '{}';
begin
  if auth.uid() is not null then k := k || ('user:' || auth.uid()::text); end if;
  if v_ip is not null then k := k || ('ip:' || v_ip);
  elsif auth.uid() is null then k := k || 'ip:unknown'::text; end if;
  if auth.uid() is null then k := k || 'anon:all'::text; end if;   -- backstop for distributed anon guessing
  return k;
end $$;

create or replace function private.rl_blocked(p_keys text[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text; v_prefer text; v_limit integer; v_sorted text[];
begin
  -- Prefer: tx=rollback would erase the failure log, so it is never allowed here.
  v_prefer := nullif(current_setting('request.headers', true), '')::json->>'prefer';
  if v_prefer ilike '%tx=rollback%' then return true; end if;
  select array_agg(x order by x) into v_sorted from unnest(p_keys) x;   -- fixed lock order
  foreach k in array coalesce(v_sorted, '{}') loop
    perform pg_advisory_xact_lock(hashtextextended('hearth.rl:' || k, 0));
    v_limit := 10;
    if k = 'anon:all' then v_limit := 500; end if;
    if (select count(*) from private.rate_limit_events e
         where e.key = k and e.at > now() - interval '10 minutes') >= v_limit then
      return true;
    end if;
  end loop;
  return false;
end $$;

create or replace function private.rl_fail(p_keys text[], p_action text) returns void
language sql security definer set search_path = '' as $$
  insert into private.rate_limit_events (key, action) select unnest(p_keys), p_action;
  delete from private.rate_limit_events where at < now() - interval '1 hour';
$$;

-- Invite codes: typed codes are case/space/dash-insensitive; link tokens are hex.
-- A pasted full link works too (everything after the last '/').
create or replace function private.invite_hash(p_code text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text := regexp_replace(regexp_replace(coalesce(p_code, ''), '^.*/', ''), '[\s-]', '', 'g');
begin
  v := case when length(v) >= 32 then lower(v) else upper(v) end;
  return encode(extensions.hmac(v, (select value from private.secrets where name = 'invite_pepper'), 'sha256'), 'hex');
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.my_spaces()
returns table (space_id uuid, name text, role public.member_role, inviter_name text, can_post boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, sm.role, inv.display_name,
         case sm.role when 'viewer' then s.viewers_can_post else true end
  from public.space_members sm
  join public.spaces s on s.id = sm.space_id and s.deleted_at is null
  left join public.profiles inv on inv.id = sm.invited_by
  where sm.user_id = auth.uid()
  order by sm.joined_at, s.id
$$;

-- Posters only (owner/adult). Viewers, co-parents and strangers get [].
create or replace function public.my_circles(p_space uuid)
returns table (circle_id uuid, name text, member_count integer, member_names text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, count(cm.user_id)::integer,
         coalesce(array_agg(pr.display_name order by pr.display_name) filter (where cm.user_id is not null), '{}')
  from public.circles c
  left join public.circle_members cm on cm.circle_id = c.id
  left join public.profiles pr on pr.id = cm.user_id
  where c.space_id = p_space and c.deleted_at is null
    and p_space = any ((select private.my_managed_space_ids())::uuid[])
  group by c.id, c.name, c.created_at
  order by c.created_at, c.name, c.id
$$;

-- Newest first, keyset on (published_at, id). Visibility is exactly can_view_post()
-- restricted to published posts, evaluated set-wise: the caller's circles in this
-- space (one short index scan each on post_audiences_feed_idx) plus the caller's own
-- posts. Everything per post (media, hearts, audience) comes back in the same query.
create or replace function public.get_feed(
  p_space uuid, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (post_id uuid, author_id uuid, author_name text, caption text, published_at timestamptz,
               media jsonb, heart_count integer, i_hearted boolean, comment_count integer,
               audience jsonb, seen_count integer, reach_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ts  timestamptz := coalesce(p_before_ts, 'infinity');
  v_id  uuid := coalesce(p_before_id, '00000000-0000-0000-0000-000000000000');
begin
  if v_uid is null or not exists (
       select 1 from public.space_members sm join public.spaces s on s.id = sm.space_id and s.deleted_at is null
       where sm.space_id = p_space and sm.user_id = v_uid) then
    return;
  end if;
  return query
  with circ as (
    select cm.circle_id
    from public.circle_members cm join public.circles c on c.id = cm.circle_id
    where cm.user_id = v_uid and c.space_id = p_space and c.deleted_at is null
  ), cand as (
    select x.post_id as pid, x.feed_at as ts
    from circ cross join lateral (
      select pa.post_id, pa.feed_at from public.post_audiences pa
      where pa.circle_id = circ.circle_id and pa.feed_at is not null
        and (pa.feed_at, pa.post_id) < (v_ts, v_id)
      order by pa.feed_at desc, pa.post_id desc
      limit v_lim) x
    union
    select mine.id, mine.published_at from (
      select p.id, p.published_at from public.posts p
      where p.author_id = v_uid and p.space_id = p_space and p.status = 'published' and p.deleted_at is null
        and (p.published_at, p.id) < (v_ts, v_id)
      order by p.published_at desc, p.id desc
      limit v_lim) mine
  ), page as (
    select pid, ts from cand order by ts desc, pid desc limit v_lim
  )
  select p.id, p.author_id, pr.display_name, p.caption, p.published_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'media_id', m.id, 'kind', m.kind, 'width', m.width, 'height', m.height,
                            'duration_ms', m.duration_ms, 'status', m.upload_status) order by m.position)
                   from public.media_items m
                   where m.post_id = p.id and (m.upload_status = 'ready' or p.author_id = v_uid)), '[]'::jsonb),
         p.reaction_count,
         exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = v_uid),
         p.comment_count,
         case when p.author_id = v_uid then aud.audience end,
         case when p.author_id = v_uid then aud.seen end,
         case when p.author_id = v_uid then aud.reach end
  from page
  join public.posts p     on p.id = page.pid and p.deleted_at is null and p.status = 'published'
  join public.profiles pr on pr.id = p.author_id
  left join lateral (
    select (select jsonb_agg(jsonb_build_object(
                     'circle_id', c.id, 'name', c.name,
                     'member_count', (select count(*) from public.circle_members cm2 where cm2.circle_id = c.id))
                   order by c.name, c.id)
            from public.post_audiences pa join public.circles c on c.id = pa.circle_id and c.deleted_at is null
            where pa.post_id = p.id and p.author_id = v_uid) as audience,
           r.seen, r.reach
    from (select count(*)::integer as reach, count(pv.user_id)::integer as seen
          from (select distinct cm.user_id
                from public.post_audiences pa
                join public.circles c on c.id = pa.circle_id and c.deleted_at is null
                join public.circle_members cm on cm.circle_id = pa.circle_id
                where pa.post_id = p.id and cm.user_id <> p.author_id
                  and p.author_id = v_uid) u                   -- one-time filter: skipped for non-authors
          left join public.post_views pv on pv.post_id = p.id and pv.user_id = u.user_id) r
  ) aud on true
  order by page.ts desc, page.pid desc;
end $$;

-- Draft; idempotent on (author, p_client_id). Replaces 0001's create_post.
drop function public.create_post(uuid, text, uuid[], uuid[], timestamptz);
create or replace function public.create_post(
  p_client_id uuid, p_space uuid, p_caption text, p_circle_ids uuid[],
  p_taken_at timestamptz default null, p_child_ids uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_post uuid;
begin
  if v_uid is null or not public.can_post_in_space(p_space) then
    raise exception 'you cannot post in this space' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '23514';
  end if;
  select id into v_post from public.posts where author_id = v_uid and client_id = p_client_id;
  if found then return v_post; end if;
  if coalesce(cardinality(p_circle_ids), 0) = 0 then
    raise exception 'choose at least one circle' using errcode = '23514';
  end if;
  -- every circle must be a live circle of this space that the poster can see
  if exists (select 1 from unnest(p_circle_ids) cid
             where not exists (select 1 from public.circles c
                               where c.id = cid and c.space_id = p_space and c.deleted_at is null
                                 and (c.space_id = any (private.my_managed_space_ids())
                                      or c.id = any (private.my_circle_ids())))) then
    raise exception 'circle not found in this space' using errcode = '23514';
  end if;
  insert into public.posts (space_id, author_id, caption, taken_at, client_id)
  values (p_space, v_uid, p_caption, p_taken_at, p_client_id)
  on conflict (author_id, client_id) do nothing
  returning id into v_post;
  if v_post is null then   -- lost a race with an identical retry
    select id into v_post from public.posts where author_id = v_uid and client_id = p_client_id;
    return v_post;
  end if;
  insert into public.post_audiences (post_id, circle_id) select distinct v_post, unnest(p_circle_ids);
  insert into public.post_children (post_id, child_id) select distinct v_post, unnest(coalesce(p_child_ids, '{}'));
  return v_post;
end $$;

create or replace function public.publish_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.posts;
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  select * into v from public.posts where id = p_post for update;
  if v.author_id is distinct from auth.uid() then
    raise exception 'only the author can publish' using errcode = '42501';
  end if;
  if v.status = 'published' then return; end if;     -- idempotent
  if not public.can_post_in_space(v.space_id) then
    raise exception 'you cannot post in this space' using errcode = '42501';
  end if;
  if exists (select 1 from public.media_items where post_id = p_post and upload_status <> 'ready')
     or not exists (select 1 from public.media_items where post_id = p_post) then
    raise exception 'all media must finish uploading first' using errcode = '23514';
  end if;
  update public.posts set status = 'published' where id = p_post;
end $$;

-- Soft delete. Gone from every feed at once; wrapped keys destroyed now
-- (crypto-shred), blobs queued for the purge worker. Idempotent for the author.
create or replace function public.delete_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.posts;
begin
  select * into v from public.posts where id = p_post for update;
  if found and v.author_id = auth.uid() and v.deleted_at is not null then return; end if;
  if not found or not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v.author_id is distinct from auth.uid() then
    raise exception 'only the author can delete this post' using errcode = '42501';
  end if;
  update public.posts set deleted_at = now() where id = p_post;
  insert into public.storage_purge_queue (object_key, reason)
  select k, 'post_deleted' from public.media_items m, unnest(array[m.display_key, m.thumb_key]) k
  where m.post_id = p_post;
  delete from public.media_keys mk using public.media_items m where m.id = mk.media_id and m.post_id = p_post;
end $$;

create type public.heart_state as (i_hearted boolean, heart_count integer);
create or replace function public.toggle_heart(p_post uuid) returns public.heart_state
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.heart_state;
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if not public.can_comment_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'reactions are turned off here' using errcode = '42501';
  end if;
  delete from public.reactions where post_id = p_post and user_id = v_uid;
  if not found then
    insert into public.reactions (post_id, user_id, emoji) values (p_post, v_uid, '❤️') on conflict do nothing;
  end if;
  select exists (select 1 from public.reactions where post_id = p_post and user_id = v_uid), p.reaction_count
    into r from public.posts p where p.id = p_post;
  return r;
end $$;

create type public.comment_ref as (comment_id uuid, created_at timestamptz);
create or replace function public.add_comment(p_client_id uuid, p_post uuid, p_body text) returns public.comment_ref
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  r public.comment_ref;
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if not public.can_comment_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'comments are turned off here' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '23514';
  end if;
  select id, created_at into r from public.comments where author_id = v_uid and client_id = p_client_id;
  if found then return r; end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'a comment must be 1 to 500 characters' using errcode = '23514';
  end if;
  insert into public.comments (post_id, author_id, body, client_id)
  values (p_post, v_uid, v_body, p_client_id)
  on conflict (author_id, client_id) do nothing
  returning id, created_at into r;
  if r.comment_id is null then
    select id, created_at into r from public.comments where author_id = v_uid and client_id = p_client_id;
  end if;
  return r;
end $$;

create or replace function public.get_comments(p_post uuid, p_limit integer default 50)
returns table (comment_id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  return query
  select c.id, c.author_id, pr.display_name, c.body, c.created_at
  from public.comments c join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post and c.deleted_at is null
  order by c.created_at, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.mark_seen(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_view_post(p_post) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if (select author_id from public.posts where id = p_post) = auth.uid() then return; end if;
  insert into public.post_views (post_id, user_id) values (p_post, auth.uid())
  on conflict (post_id, user_id) do update set last_seen_at = now();
end $$;

-- Returns the plaintext code and link ONCE. Only HMACs are stored.
create type public.invite_created as (invite_id uuid, code text, link text, expires_at timestamptz);
drop function public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer);
create or replace function public.create_invite(
  p_space uuid, p_role public.member_role, p_circle_ids uuid[],
  p_channel public.invite_channel default 'link', p_target_email text default null,
  p_target_phone text default null, p_ttl interval default interval '7 days', p_max_uses integer default 1)
returns public.invite_created
language plpgsql security definer set search_path = '' as $$
declare
  v_code  text;
  v_token text := encode(extensions.gen_random_bytes(20), 'hex');     -- 160 bits, for links
  v_id    uuid;
  v_exp   timestamptz := now() + least(p_ttl, interval '30 days');
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';     -- no 0/O/1/I/L/U
  v_bytes bytea := extensions.gen_random_bytes(10);
begin
  if not public.is_space_manager(p_space) then
    raise exception 'only space owners/adults can invite' using errcode = '42501';
  end if;
  if p_role <> 'viewer' and not public.is_space_owner(p_space) then
    raise exception 'only owners can invite owners/adults' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_circle_ids), 0) = 0 then
    raise exception 'invite must place the person in at least one circle' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_circle_ids) cid
             where not exists (select 1 from public.circles c
                               where c.id = cid and c.space_id = p_space and c.deleted_at is null)) then
    raise exception 'circle not in this space' using errcode = '23514';
  end if;
  select string_agg(substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1), '' order by i)
    into v_code from generate_series(0, 9) i;
  insert into public.invites (space_id, role, channel, code_hash, link_hash, target_email, target_phone,
                              expires_at, max_uses, created_by)
  values (p_space, p_role, p_channel, private.invite_hash(v_code), private.invite_hash(v_token),
          lower(p_target_email), p_target_phone, v_exp, p_max_uses, auth.uid())
  returning id into v_id;
  insert into public.invite_circles (invite_id, circle_id) select distinct v_id, unnest(p_circle_ids);
  return (v_id, v_code,
          (select value from private.secrets where name = 'invite_link_base') || v_token,
          v_exp)::public.invite_created;
end $$;

-- 22023 for every bad invite (unknown, expired, revoked, used up, addressed to
-- someone else): one message, so a guess can't tell a real code from a fake one.
drop function public.redeem_invite(text);
create or replace function public.redeem_invite(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_inv  public.invites;
  v_user auth.users;
  v_keys text[];
  v_ok   boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_keys := private.rl_keys();
  if private.rl_blocked(v_keys) then
    return private.api_error('54000', 'Too many tries. Wait 10 minutes.', 429);
  end if;
  select * into v_inv from public.invites
   where code_hash = private.invite_hash(p_code) or link_hash = private.invite_hash(p_code)
   for update;
  v_ok := found;
  select * into v_user from auth.users where id = auth.uid();
  if not v_ok or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.use_count >= v_inv.max_uses
     or (v_inv.target_email is not null and lower(coalesce(v_user.email, '')) <> v_inv.target_email)
     or (v_inv.target_phone is not null and coalesce(v_user.phone, '') <> v_inv.target_phone)
     or not exists (select 1 from public.spaces where id = v_inv.space_id and deleted_at is null) then
    perform private.rl_fail(v_keys, 'redeem');
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;

  insert into public.space_members (space_id, user_id, role, invited_by)
  values (v_inv.space_id, auth.uid(), v_inv.role, v_inv.created_by)
  on conflict (space_id, user_id) do nothing;          -- never silently changes an existing role
  insert into public.circle_members (circle_id, user_id, added_by)
  select ic.circle_id, auth.uid(), v_inv.created_by from public.invite_circles ic
   join public.circles c on c.id = ic.circle_id and c.deleted_at is null
   where ic.invite_id = v_inv.id
  on conflict do nothing;
  insert into public.notification_prefs (user_id, space_id, push, email_digest)
  values (auth.uid(), v_inv.space_id, true, case when v_inv.role = 'viewer' then 'weekly'::public.digest_freq else 'off' end)
  on conflict do nothing;
  update public.invites set use_count = use_count + 1 where id = v_inv.id;
  return to_json(v_inv.space_id);
end $$;

-- Before sign-in: "Chase invited you to <space>". Nothing else.
create or replace function public.invite_preview(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_keys text[]; v_inviter text; v_space text;
begin
  v_keys := private.rl_keys();
  if private.rl_blocked(v_keys) then
    return private.api_error('54000', 'Too many tries. Wait 10 minutes.', 429);
  end if;
  select pr.display_name, s.name into v_inviter, v_space
  from public.invites i
  join public.spaces s on s.id = i.space_id and s.deleted_at is null
  join public.profiles pr on pr.id = i.created_by
  where (i.code_hash = private.invite_hash(p_code) or i.link_hash = private.invite_hash(p_code))
    and i.revoked_at is null and i.expires_at > now() and i.use_count < i.max_uses;
  if not found then
    perform private.rl_fail(v_keys, 'preview');
    return private.api_error('22023', 'invite is invalid or expired', 400);
  end if;
  return json_build_object('inviter_name', v_inviter, 'space_name', v_space);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase's default privileges hand new public functions to anon and
-- authenticated, so start from nothing and grant explicitly.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;   -- policy helpers only; no table grants

grant execute on function
  private.my_space_ids(), private.my_managed_space_ids(), private.my_owned_space_ids(),
  private.my_circle_ids(), private.my_managed_circle_ids(), private.my_household_ids(),
  private.my_admin_household_ids(), private.my_guardian_child_ids(), private.my_managed_child_ids(),
  private.post_in_circles(uuid, uuid[])
to authenticated;

-- Posts are soft-deleted only through delete_post() (which also destroys the keys).
revoke update (deleted_at) on public.posts from authenticated;

-- S9: hashes are never client-readable, not even by managers.
revoke select on public.invites from authenticated;
grant select (id, space_id, role, channel, target_email, target_phone, expires_at, max_uses, use_count,
              created_by, created_at, revoked_at) on public.invites to authenticated;

grant execute on function
  public.space_role(uuid), public.is_space_member(uuid), public.is_space_manager(uuid),
  public.is_space_owner(uuid), public.can_post_in_space(uuid), public.can_comment_in_space(uuid),
  public.is_household_member(uuid), public.is_circle_member(uuid), public.can_see_circle(uuid),
  public.is_child_guardian(uuid), public.can_view_post(uuid), public.is_post_author(uuid),
  public.can_see_profile(uuid), public.plan_video_cap(public.plan_tier),
  public.create_household(text), public.create_space(uuid, text),
  public.set_post_audience(uuid, uuid[]), public.prepare_media_upload(uuid, jsonb), public.space_upload_quota(uuid),
  public.delete_comment(uuid), public.child_birth_date(uuid), public.export_my_data(), public.request_account_export(),
  public.request_account_deletion(),
  -- beta API
  public.my_spaces(), public.my_circles(uuid),
  public.get_feed(uuid, timestamptz, uuid, integer),
  public.create_post(uuid, uuid, text, uuid[], timestamptz, uuid[]), public.publish_post(uuid), public.delete_post(uuid),
  public.toggle_heart(uuid), public.add_comment(uuid, uuid, text), public.get_comments(uuid, integer),
  public.mark_seen(uuid),
  public.create_invite(uuid, public.member_role, uuid[], public.invite_channel, text, text, interval, integer),
  public.redeem_invite(text), public.invite_preview(text)
to authenticated;
grant execute on function public.invite_preview(text) to anon;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- mark_media_upload_result and purge_soft_deleted stay service_role only.
