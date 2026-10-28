-- 0018: hardening from the Oct 28 privacy-security review (docs/reviews/2026-10-28-harden.md).

-- HARD-12: reactions change only through set_reaction and toggle_heart (tests/reactions_test.sql).
-- 0001/0011 still let a member insert or update their row straight through PostgREST, which skipped 0017's
-- three-emoji list and the "replies off" switch: any short word could be saved and reaction_summary showed it
-- to everyone (a free-text side channel past the reply rules). Both RPCs are security definer, so they keep
-- working; taking a reaction back by delete stays allowed. The check makes the table itself refuse anything
-- but ❤️ 😂 👍 (every row so far came from toggle_heart or set_reaction).
revoke insert, update on public.reactions from authenticated;
alter table public.reactions add constraint reactions_emoji_known check (emoji in ('❤️', '😂', '👍'));

-- HARD-17: once a family has a few dozen posts, the planner's estimate for feed_rows (behind get_feed and
-- get_timeline) passes jit_above_cost and Postgres compiles the query before running it: 1.5-2 s per page on the
-- test harness instead of 20-50 ms (tests/timeline_test.sql). The query is many small index lookups; JIT never pays.
alter function private.feed_rows(uuid[]) set jit = off;
