-- 0012: overnight privacy audit (Oct 18). PRIV-1: Hearth's own tables never keep a raw IP address. Also S11, S13 and S15 below.
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

-- ---------------------------------------------------------------------------
-- S11 (Oct 15 security review): a guardian could unlink their child from the OTHER household's family space,
-- where the co-parent is only a viewer. Now only that space's parents (owner, adult) can unlink a child from it.
-- ---------------------------------------------------------------------------
drop policy space_children_delete on public.space_children;
create policy space_children_delete on public.space_children for delete to authenticated
  using (space_id = any ((select private.my_managed_space_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- S13: sharing a group made two relatives' profiles visible to each other, even after the group was deleted
-- or its family space was. Now the shared group must be live, in a live space. Otherwise as in 0009.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select p_user = auth.uid()
  or exists (
    select 1 from public.space_members me
    join public.space_members them on them.space_id = me.space_id
    join public.spaces s on s.id = me.space_id and s.deleted_at is null
    where me.user_id = auth.uid() and them.user_id = p_user
      and (me.role in ('owner','adult') or them.role in ('owner','adult')))
  or exists (
    select 1 from public.circle_members a
    join public.circle_members b on b.circle_id = a.circle_id
    join public.circles c on c.id = a.circle_id and c.deleted_at is null
    join public.spaces s on s.id = c.space_id and s.deleted_at is null
    where a.user_id = auth.uid() and b.user_id = p_user)
  or exists (select 1 from public.comments c
             where c.author_id = p_user and c.deleted_at is null and public.can_see_reply(c.post_id, p_user))
  or exists (select 1 from public.reactions r
             where r.user_id = p_user and public.can_see_reply(r.post_id, p_user))
$fn$;

-- ---------------------------------------------------------------------------
-- S15: sign-media's finalize step could mark a photo ready though its wrapped key was never saved, so viewers
-- got a photo nobody can decrypt. Ready now also needs the media_keys row; without it the item is 'failed'
-- (the app re-uploads it) and publish_post keeps refusing the post until every photo is ready.
-- ---------------------------------------------------------------------------
create or replace function public.mark_media_upload_result(p_media uuid, p_ok boolean) returns void
language sql security definer set search_path = '' as $$
  update public.media_items m
     set upload_status = case when p_ok and exists (select 1 from public.media_keys k where k.media_id = m.id)
                              then 'ready'::public.upload_status else 'failed'::public.upload_status end
   where m.id = p_media and m.upload_status = 'pending'
$$;
revoke execute on function public.mark_media_upload_result(uuid, boolean) from public, anon, authenticated;
grant execute on function public.mark_media_upload_result(uuid, boolean) to service_role;
