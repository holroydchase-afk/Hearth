-- 0008: rename_circle. The app renamed groups with a direct table update that was
-- never tested against the real backend, and a duplicate name came back as 23505
-- (the app expects 23514). One RPC with the API.md error codes.
create or replace function public.rename_circle(p_circle uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v_space uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select space_id into v_space from public.circles where id = p_circle and deleted_at is null;
  -- not a manager of this group's space: same answer as a group that doesn't exist
  if v_space is null or not public.is_space_manager(v_space) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'a group name is 1-60 characters' using errcode = '23514';
  end if;
  if exists (select 1 from public.circles where space_id = v_space and name = v_name and id <> p_circle) then
    raise exception 'another group already has that name' using errcode = '23514';
  end if;
  update public.circles set name = v_name where id = p_circle;
end $fn$;

revoke execute on function public.rename_circle(uuid, text) from public, anon;
grant execute on function public.rename_circle(uuid, text) to authenticated, service_role;
