-- 0004: BETA-AUD-7 (anchor A2, guilt-free). No member can read when another member
-- last looked at anything. post_views keeps feeding "Seen by" (who has seen: NOTIFY-6,
-- still Chase's call) and the seen/reach counts in get_feed, but its timestamps are
-- no longer readable by app users. Server-side functions (security definer) still use them.
revoke select on public.post_views from authenticated, anon;
grant select (post_id, user_id) on public.post_views to authenticated;
