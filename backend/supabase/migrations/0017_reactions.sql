-- 0017: Love, Haha and Like on a moment (Chase, Oct 25; REACT-1..6, tests/reactions_test.sql).
-- The reactions table is unchanged: one row per person per post, its emoji now one of three. set_reaction switches
-- or takes back; reaction_summary gives the per-kind counts the card shows. Counts follow the reply rules
-- (can_see_reply, AUD-8) like hearts always have. Switching kinds is an UPDATE, so notify_heart (after insert) sends
-- nothing new. toggle_heart and the feed's heart_count / i_hearted stay as they were, so older app builds work.

create type public.reaction_state as (my_reaction text, heart_count integer, counts jsonb);

-- Per-kind counts a caller may see, as {"❤️": 2, "😂": 1}.
create function private.reaction_counts(p_post uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k.emoji, k.n), '{}'::jsonb)
  from (select x.emoji, count(*)::integer as n
          from public.reactions x
         where x.post_id = p_post and public.can_see_reply(p_post, x.user_id)
         group by x.emoji) k
$$;

create function public.set_reaction(p_post uuid, p_emoji text) returns public.reaction_state
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_had text; r public.reaction_state;
begin
  if p_emoji is null or p_emoji not in ('❤️', '😂', '👍') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;
  if not public.can_view_post(p_post) then raise exception 'post not found' using errcode = 'P0002'; end if;
  if not public.can_comment_in_space((select space_id from public.posts where id = p_post)) then
    raise exception 'reactions are turned off here' using errcode = '42501';
  end if;
  select emoji into v_had from public.reactions where post_id = p_post and user_id = v_uid for update;
  if v_had = p_emoji then
    delete from public.reactions where post_id = p_post and user_id = v_uid;
  elsif v_had is not null then
    update public.reactions set emoji = p_emoji where post_id = p_post and user_id = v_uid;
  else
    insert into public.reactions (post_id, user_id, emoji) values (p_post, v_uid, p_emoji) on conflict do nothing;
  end if;
  r.my_reaction := (select emoji from public.reactions where post_id = p_post and user_id = v_uid);
  r.counts := private.reaction_counts(p_post);
  r.heart_count := (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(r.counts));
  return r;
end $$;

-- Posts the caller can't see are left out (a post you can't see behaves as "not found").
create function public.reaction_summary(p_posts uuid[])
returns table (post_id uuid, my_reaction text, counts jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id,
         (select x.emoji from public.reactions x where x.post_id = p.id and x.user_id = auth.uid()),
         private.reaction_counts(p.id)
  from public.posts p
  where p.id = any (p_posts[1:100]) and p.deleted_at is null and public.can_view_post(p.id)
$$;

revoke all on function public.set_reaction(uuid, text) from public, anon;
revoke all on function public.reaction_summary(uuid[]) from public, anon;
revoke all on function private.reaction_counts(uuid) from public, anon, authenticated;
grant execute on function public.set_reaction(uuid, text) to authenticated;
grant execute on function public.reaction_summary(uuid[]) to authenticated;
