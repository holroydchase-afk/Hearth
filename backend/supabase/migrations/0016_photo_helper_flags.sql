-- 0016: photo helper off-switches (SPEC-PHOTO-HELPERS HELP-R4, TRACKER R15). Tests: tests/photo_helpers_test.sql.
-- Two features on the 0013 flag system: photo_helpers_duplicates (same photo twice, already sent, look-alikes) and
-- photo_helpers_screens_blur (screenshots, blurry). They are off-switches, not add-ons (DEC-18): ON unless Hearth's
-- global row or the family's row says off. Anyone who can post gets them; a viewer who can't post never does.
-- The helpers run on the phone only (HELP-R2): the server stores the on/off rows and nothing about any photo.
-- video_posting keeps its default-off rule (FLAG-1).

-- the capability a feature needs (null = unknown feature: off)
create or replace function private.feature_capability(p_feature text) returns text
language sql immutable set search_path = '' as $$
  select case p_feature
    when 'video_posting' then 'use_video'
    when 'photo_helpers_duplicates' then 'post'
    when 'photo_helpers_screens_blur' then 'post'
  end
$$;

-- What a missing row means: off for add-ons (video_posting), on for off-switches (the photo helpers).
create or replace function private.feature_default_on(p_feature text) returns boolean
language sql immutable set search_path = '' as $$
  select p_feature in ('photo_helpers_duplicates', 'photo_helpers_screens_blur')
$$;

-- Is p_feature on for the caller (auth.uid()) in p_space? Global switch AND family switch AND can(capability).
-- A missing global or family row falls back to feature_default_on.
create or replace function private.feature_on(p_space uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cap text := private.feature_capability(p_feature);
  v_def boolean := private.feature_default_on(p_feature);
begin
  if p_space is null or v_cap is null or auth.uid() is null then return false; end if;
  return coalesce((select f.enabled from private.feature_flags f where f.feature = p_feature), v_def)
     and coalesce((select sf.enabled from public.space_features sf where sf.space_id = p_space and sf.feature = p_feature), v_def)
     and public.can(p_space, v_cap);
end $$;

-- the global kill switches, on (my_features lists only features with a global row)
insert into private.feature_flags (feature, enabled) values
  ('photo_helpers_duplicates', true),
  ('photo_helpers_screens_blur', true)
on conflict (feature) do nothing;
