-- 0020: S14 (Test Log, Low). The free video cap (10 a month, plan_video_cap) counted per family space, so anyone
-- could make a second space and get 10 more. It now counts per person: each person's videos this month across
-- every free space they post in. A paid family's videos are neither capped nor counted. Tests: tests/video_cap_test.sql.
-- Like before, it counts attempts, not survivors: deleting a video does not give the month back. The space's own
-- counter (spaces.videos_this_month) keeps counting too, for the record, but no longer decides anything.

create table private.video_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  month   date not null,
  videos  integer not null default 0 check (videos >= 0),
  primary key (user_id, month)
);
-- Private schema: no grants, so app users can't read or change it (S14-6). Only the definer functions below touch it.

-- This month's free videos already counted for a person.
create or replace function private.videos_this_month(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.videos from private.video_usage u
                    where u.user_id = p_user and u.month = (date_trunc('month', now() at time zone 'utc'))::date), 0)
$$;

-- Backfill this month from the space counters' source rows: the videos each person already sent to a free space.
insert into private.video_usage (user_id, month, videos)
select m.uploader_id, (date_trunc('month', now() at time zone 'utc'))::date, count(*)
  from public.media_items m join public.spaces s on s.id = m.space_id
 where m.kind = 'video' and public.plan_video_cap(s.plan) is not null
   and m.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
 group by m.uploader_id;

-- Same as 0013 except the cap check: it locks and counts the uploader's own row, not the space's.
create or replace function public.tg_media_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_space   uuid;
  v_plan    public.plan_tier;
  v_month   date;
  v_count   integer;
  v_cap     integer;
  v_now_m   date := (date_trunc('month', now() at time zone 'utc'))::date;
begin
  select p.space_id into v_space from public.posts p where p.id = new.post_id;
  new.space_id    := v_space;
  new.uploader_id := coalesce(auth.uid(), (select author_id from public.posts where id = new.post_id));
  new.id          := coalesce(new.id, gen_random_uuid());
  new.display_key := format('s/%s/p/%s/m/%s/display', v_space, new.post_id, new.id);
  new.thumb_key   := format('s/%s/p/%s/m/%s/thumb',   v_space, new.post_id, new.id);
  new.upload_status := 'pending';

  if new.kind = 'video' then
    if auth.uid() is not null and not private.feature_on(v_space, 'video_posting') then
      raise exception 'video_posting_off' using errcode = '42501';
    end if;
    select plan, videos_month, videos_this_month into v_plan, v_month, v_count
      from public.spaces where id = v_space;
    if v_month <> v_now_m then v_count := 0; end if;
    v_cap := public.plan_video_cap(v_plan);
    if v_cap is not null then
      -- S14: one row per person per month; the row lock serializes that person's concurrent uploads.
      insert into private.video_usage (user_id, month) values (new.uploader_id, v_now_m) on conflict do nothing;
      if (select u.videos from private.video_usage u
           where u.user_id = new.uploader_id and u.month = v_now_m for update) >= v_cap then
        raise exception 'free_video_cap_reached'
          using errcode = 'P0001',
                hint = format('Each person can send %s videos a month on the free plan.', v_cap);
      end if;
      update private.video_usage set videos = videos + 1 where user_id = new.uploader_id and month = v_now_m;
    end if;
    update public.spaces set videos_month = v_now_m, videos_this_month = v_count + 1 where id = v_space;
  end if;
  return new;
end $$;

-- Same as 0001 except videos_this_month: the caller's own count this month (S14-2), still for posters only.
create or replace function public.space_upload_quota(p_space uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_space_member(p_space) then null else
    jsonb_build_object(
      'plan', s.plan,
      'video_cap', public.plan_video_cap(s.plan),
      'videos_this_month', case when not public.can_post_in_space(p_space) then null
                                else private.videos_this_month(auth.uid()) end,
      'can_post', public.can_post_in_space(p_space))
    || case when public.is_space_owner(p_space) then
         jsonb_build_object('plan_status', s.plan_status, 'plan_provider', s.plan_provider,
                            'plan_period_end', s.plan_period_end)
       else '{}'::jsonb end
  end
  from public.spaces s where s.id = p_space
$$;
