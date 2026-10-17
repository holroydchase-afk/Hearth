# Hearth app ↔ backend contract (v1, beta)

This contract is the single source of truth. The app's `HearthApi` interface mirrors it. The backend implements it in Postgres RPCs (called over PostgREST through supabase-js) plus the `sign-media` edge function.

Any change requires a contract-test update first; the contract tests live in `app/src/api/contract/`.

## Rules every endpoint follows
- **Identity:** callers are authenticated with a Supabase JWT, and `auth.uid()` is the caller.
- **Access:** RLS and `can_view_post()` decide everything. A post the caller can't see behaves exactly like a post that doesn't exist (empty result or `P0002 not found`), never `42501`, so its existence can't leak.
- **Error codes** (`code` field from PostgREST):

  | Code | Meaning | App shows |
  |---|---|---|
  | `23514` | rule violated (no audience, empty comment, …) | the plain message |
  | `42501` | not allowed (viewer tried to post, …) | "You can't do that here" |
  | `P0002` | not found or not visible | "This was removed" |
  | `22023` | invalid invite or code (any reason) | "This invite is too old or already used. Ask {inviter} for a new one." |
  | `54000` | rate limited | "Too many tries. Wait 10 minutes." |
- **Time:** timestamps are ISO 8601 UTC. IDs are UUIDs.
- **Idempotency:** every create takes a client-generated UUID, `p_client_id`. Retrying with the same `p_client_id` returns the original row and creates no duplicate. The app's upload queue relies on this.

## RPCs (POST /rest/v1/rpc/<name>)

| RPC | Args | Returns | Notes |
|---|---|---|---|
| `my_spaces` | — | `[{space_id, name, role: 'owner'\|'adult'\|'viewer', inviter_name, can_post}]` | Usually one space in the beta |
| `my_circles` | `p_space` | `[{circle_id, name, member_count, member_names: text[]}]` | Only circles the caller owns or manages (posters). Viewers get `[]`. Names are "group" in the UI. |
| `get_feed` | `p_space, p_before_ts timestamptz = null, p_before_id uuid = null, p_limit int = 20 (max 50)` | `[{post_id, author_id, author_name, caption, published_at, media: [{media_id, kind, width, height, duration_ms, status}], heart_count, i_hearted, comment_count, audience: [{circle_id, name, member_count}] \| null, seen_count \| null, reach_count \| null}]` | Newest first, using a keyset on `(published_at, id)`. `audience`, `seen_count` and `reach_count` are non-null **only for the author**. Only published, non-deleted, visible posts appear. One round trip, with no N+1 queries. |
| `create_post` | `p_client_id, p_space, p_caption, p_circle_ids uuid[], p_taken_at = null` | `post_id` | Creates a **draft**. Idempotent on `(author, p_client_id)`. At least one circle is required (`23514`). |
| `create_post` (0010 adds) | `+ p_batch_id uuid = null, p_batch_size int = null` | `post_id` | BULK-6. Posts from one bulk pick share `p_batch_id`; `p_batch_size` is how many posts the batch has (1–100). Both or neither, else `23514`. `p_taken_at` is the capture time read on the phone (BULK-1); only the date leaves the phone. |
| `get_feed` (0010 adds) | same | `+ taken_at timestamptz \| null` | TIME-1. When the post's photos were taken (read on the phone). Photos uses it for the "Older photos" card: posts taken more than 30 days before they were shared. Order is unchanged. |
| `get_timeline` (0010) | `p_space, p_before_at timestamptz = null, p_before_id uuid = null, p_limit int = 20 (max 50)` | same rows as `get_feed`, plus `taken_at timestamptz \| null, sort_at timestamptz` | TIME-2/3. Newest taken first: keyset on `(sort_at, id)` where `sort_at = coalesce(taken_at, published_at)`. Visibility comes from the **same function as `get_feed`** (`private.visible_posts`, below); a post you can't see is simply absent. Not a member: empty. Index on `(space_id, coalesce(taken_at, published_at) desc, id desc)`. |
| `get_timeline_years` (0010) | `p_space, p_tz text = 'UTC'` | `[{year int, post_count int, photo_count int}]` | TIME-3/4 "Pick a year". Newest year first. Year of `sort_at` in `p_tz` (the app sends the phone's time zone). Counts include only posts the caller can see and only ready photos. Not a member: empty. Bad time zone: `22023`. |

**One visibility check (0010).** `private.visible_posts(p_space uuid)` returns the published, non-deleted posts in that space the caller may see (`post_id, published_at, taken_at`). `get_feed` and `get_timeline` (and `get_timeline_years`) both read it; neither has its own copy, so 0011's share-history cutoff (AUD-20) lands in one place. Checked by `backend/tests/timeline_test.sql`.

| `publish_post` | `p_post` | void | All media must be `ready`. Idempotent: publishing an already published post is a no-op. |
| `delete_post` | `p_post` | void | Author only. Soft delete; the post vanishes from every feed immediately, and media is queued for purge. Idempotent. |
| `toggle_heart` | `p_post` | `{i_hearted, heart_count}` | Viewers allowed |
| `add_comment` | `p_client_id, p_post, p_body` | `{comment_id, created_at}` | Body is 1–500 characters after trim. Idempotent on `p_client_id`. |
| `get_comments` | `p_post, p_limit = 50` | `[{comment_id, author_id, author_name, body, created_at}]` | Oldest first |
| `mark_seen` | `p_post` | void | Idempotent; feeds "Seen by" |
| `redeem_invite` | `p_code` | `space_id` | `22023` for any bad code. Rate limited (S10): 10 failures per user per 10 minutes, then `54000`. |
| `invite_preview` | `p_code` | `{inviter_name, space_name}` or `22023` | Callable by **anon** (shows "Chase invited you" before sign-in). Rate limited like redeem. Leaks nothing else. |
| `create_invite` | existing signature + `p_name text = null`; returns `{code, link}` | | Only for posters (owner or adult). `p_name` is what the family calls the invitee ("Grandma June"); it becomes their name on joining unless they already chose one. Bad name: `23514`. |
| `rename_circle` | `p_circle, p_name` | void | Posters only. Not a manager of that group's space, or no such group: `P0002`. Empty, over 60 characters, or another group's name: `23514`. |
| `set_group_replies_shared` | `p_circle, p_on boolean` | void | AUD-9. Posters only (else `P0002`). On: members of this group read each other's replies on posts shared to it. Off by default. |
| `set_reply_audience` | `p_space, p_choice: 'parents'\|'everyone'` | void | AUD-10. Owner only (`42501`; non-member `P0002`; bad choice `23514`). Default `parents`. |
| `set_my_name` | `p_name` | void | 1–40 characters after trim; no `@`, `<`, `>` or line breaks (`23514`). |
| `my_profile` | — | `{user_id, display_name, name_set}` | `name_set` is false for an email-prefix placeholder; the app asks posters for a name once. |
| `register_push_token` | `p_token, p_platform: 'ios'\|'android'\|'web'` | void | Saves this phone's Expo token. Idempotent. A token re-registered by another user moves to them (shared phone). Bad token or platform: `23514`. |
| `set_notification_prefs` | `p_space, p_push boolean, p_email_digest: 'off'\|'daily'\|'weekly'` | void | Per space. Not a member: `P0002`. Bad choice: `23514`. Push on but no phone registered falls back to a daily email. |
| `report_client_error` | `p_app_version, p_os, p_screen, p_kind, p_code = null` | void | Callable by **anon**. Fixed-shape fields only (version, `ios 18.1`, route name, error type, error code); free text is `23514`, so no caption, email, URL or key can get in. 30/hour per person, then `54000`. Kept 30 days. |

## Who reads replies (AUD-8/9/10, migration 0009)
A reply is a comment or a heart. A relative's reply is readable by: its author; the post's author; the space's owners/adults; members of an audience group with `replies_shared`; or everyone who can see the post if the space's `reply_audience = 'everyone'`. Parents' replies reach everyone who can see the post. `get_comments`, `comment_count`, `heart_count`, `toggle_heart` and direct table reads all follow this rule. `get_feed` adds `reply_scope: 'parents'|'group'|'everyone'` (who will read the caller's replies on that post); `my_spaces` adds `reply_audience`; `my_circles` adds `replies_shared`.

## Groups, households, events, roles and share history (0011, SPEC-GROUPS; contract tests first)
Failing tests written first (Oct 17): `backend/tests/groups_test.sql`, `backend/tests/aud16/`, `backend/tests/setup_v2_test.sh`, `backend/tests/timeline_future_test.sql`, `app/src/screens/__tests__/familyShape.test.tsx`. Every container is a `circles` row with `kind`: `everyone | group | household | event` (the app says "group"). Allowed links: household→group, household→event, group→event (`link_allowed`). `p_history` is `'all'` ("Share all past photos") or `'new'` ("Only new photos": shared from that moment on, by `published_at`, never `taken_at`); there is no default.

| RPC | Args | Returns | Notes |
|---|---|---|---|
| `can` | `p_space, p_capability: 'post'\|'send_to_everyone'\|'make_events'\|'invite'\|'set_up_family'\|'family_settings'` | boolean | AUD-21. The one permission check. First build reads only the role (owner, adult = parent, viewer = relative) and `viewers_can_post`. Only parents get `send_to_everyone` and `make_events`. Not a member: false. |
| `can_send_to` | `p_circle` | boolean | AUD-21, privacy item 2. Used by `create_post`, the `post_audiences` insert policy **and** `publish_post` (re-checked at publish). `everyone` needs `can(space, 'send_to_everyone')`; a relative may send only to containers they are a derived member of, and only when `can(space, 'post')`. Never another space. Refusal: `42501`. |
| `create_level` | `p_space, p_kind: 'group'\|'household'\|'event', p_name` | `circle_id` | AUD-13. Parents only (else `P0002`). `everyone` (there is exactly one per space) or an unknown kind: `23514`. Same name rules as `rename_circle`. |
| `link_level` | `p_parent, p_child, p_history: 'all'\|'new'` | void | AUD-13/19. Parents only (`P0002`). A pair `link_allowed` refuses, a loop, a cross-space link, or a missing/bad `p_history`: `23514`. Idempotent for the same pair. |
| `unlink_level` | `p_parent, p_child` | void | AUD-15. Parents only (`P0002`). Access is gone in the same transaction. |
| `place_person` | `p_household, p_user, p_history` | void | AUD-12/13/19. Parents only (`P0002`). Households only (a group, event or Everyone: `23514`); missing/bad `p_history`: `23514`. A person may be in several households. |
| `unplace_person` | `p_household, p_user` | void | AUD-15. Parents only (`P0002`). |
| `reply_readers` | `p_post` | `text[]` (names the family uses) \| null | REPLY-11, privacy item 7. Who will read the **caller's** reply on this post: exactly the members for whom `can_see_reply` would be true, never the caller. Only people who can see the post now (after any cutoff). Null ("not found") for a post the caller can't see. The comment box says "Memaw, Pawpaw, Granny, Chase and Mom will read this." |
| `create_invite` (0011 changes) | `+ p_history text` (required when `p_role = 'viewer'`); `p_circle_ids` names one household | `{invite_id, code, link, expires_at}` | AUD-19. Missing/bad `p_history`, or a non-household: `23514`. Redeeming copies the choice: `space_members.sees_from` (and the placement's) is null for `all`, the invite's creation time for `new`. A removed-then-re-invited person gets the new invite's choice; no old cutoff survives (privacy item 10). |
| `my_circles` (0011 changes) | `p_space` | `+ kind, parent_ids uuid[]`; **drops** `replies_shared` | REPLY-12, privacy item 13. Only containers the caller can see; a relative never learns other households, groups or events exist (AUD-14). |
| `set_group_replies_shared` | — | — | **Dropped in 0011** (REPLY-12), with `circles.replies_shared`. |

**Tables (0011).** `circle_links (parent_id, child_id, sees_from)`, `circle_people (circle_id, user_id, sees_from)`, `circle_members` (+ `sees_from`) are written **only by triggers and the RPCs above**: app users have no insert/update/delete on any of them (privacy item 3). Same-space, `link_allowed` and loop checks are triggers, so even a direct insert is `23514`.

**Reply rule (0011, SPEC-GROUPS section 6).** Reader R may read reply X by W on post P only if R can see P and one holds: R is W; R or W is a parent; R or W is P's author; R and W are placed in the same household (direct `circle_people` rows, never derived group membership: no relay); R and W are both in an event in P's audience; or the owner set `reply_audience = 'everyone'`. **Readers are fixed when the reply is written** (privacy item 5, default chosen Oct 17; Chase can change it): moving someone into a household or adding a household to an event later never lets new people read older replies; anyone who stops qualifying stops reading at once.

**Share-history cutoff.** One predicate (`sees_from is null or published_at >= sees_from`), called by `can_view_post`, `private.visible_posts` (feed, timeline, years), `claim_notification_batches`, `get_comments`, `can_see_profile` and so `sign-media`. AUD-20 parity test across all of them.

**Timeline and future capture dates (Oct 17).** `get_timeline`'s `sort_at` and `get_timeline_years` treat a `taken_at` later than `published_at` as `published_at` (`timeline_future_test.sql`). The phone ignores capture dates more than 1 day in the future (BETA-BULK-1).

## Notifications (server only)
Triggers queue a notice on publish (audience members, not the author) and on a comment or heart (the post's author, never the reactor). The `notify` edge function runs on a 1-minute cron, calls `claim_notification_batches()` (service_role only) and sends one notice per recipient: at most 1 push per 10 minutes; email goes out when the Help screen promises (Eastern): each evening from 6 pm, or Sunday from 8 am. **Payload:** the actor's chosen display name, counts and post id only (a bulk import's batch notice also names the month and year its photos were taken, "from July 2024", counted only from posts that recipient can see); never a photo, caption, comment text or child's name. Push `data.post_id` opens the post.

**Batch notice (BULK-6, 0010).** Post notices for posts with a `batch_id` wait until all `batch_size` posts of the batch are published, or 30 minutes after the first one was queued (a killed batch still tells people), then go out as **1 notice per recipient** for the whole batch. `claim_notification_batches()` adds `is_batch boolean` (true when the claimed post notices all come from bulk batches), `photo_count int` (ready photos in the claimed posts the recipient can see), `taken_from timestamptz` and `taken_to timestamptz` (min/max `taken_at` of those posts, null if none). Push text: "Chase added 48 photos from July 2024" (full month name, in Eastern time). Still no photo, caption or child's name.

## Edge function `sign-media`
The request and response shapes documented at the top of `backend/supabase/functions/sign-media/index.ts` (GET view, POST upload, POST finalize) are the contract.
- **Upload:** the client encrypts each file with AES-256-GCM using the returned per-item key before the PUT.
- **Order:** `create_post` (draft) → `sign-media upload` → PUT encrypted bytes → `finalize` → `publish_post`.

## Scale targets (checked by `backend/tests/perf/`)
- **`get_timeline` (0010):** p95 under 5 ms in the database at 1M posts (plan target). **Measured Oct 17: 6–14 ms, so not met yet.** The per-post reply rule in the shared row builder costs about 5 ms a page; see `backend/tests/perf/RESULTS.md`.
- **`get_feed`:** p95 under 30 ms in the database for a viewer in a space with 20,000 posts, on a table of about 1M posts across about 50k spaces.
- **Per-row work:** RLS helpers are wrapped as `(select auth.uid())` so they run once per statement, not once per row.
- **Indexes:** every foreign key and every RLS lookup path is indexed.
