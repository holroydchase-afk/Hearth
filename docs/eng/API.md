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
| `create_post` (0019 adds) | `+ p_title text = null` | `post_id` | CAP-1/2. Optional title for the whole set; trimmed, blank means none, over 80 characters `23514`. The app sends it only when there is one, so an untitled post still matches an older server. |
| `get_feed`, `get_timeline` (0019 add) | same | `+ title text \| null` | CAP-3/11. Same audience as the post (a post you can't see never shows its title). Never in a notice, log or report (CAP-10). |
| `get_feed` (0010 adds) | same | `+ taken_at timestamptz \| null` | TIME-1. When the post's photos were taken (read on the phone). Photos uses it for the "Older photos" card: posts taken more than 30 days before they were shared. Order is unchanged. |
| `get_timeline` (0010) | `p_space, p_before_at timestamptz = null, p_before_id uuid = null, p_limit int = 20 (max 50)` | same rows as `get_feed`, plus `taken_at timestamptz \| null, sort_at timestamptz` | TIME-2/3. Newest taken first: keyset on `(sort_at, id)` where `sort_at = coalesce(taken_at, published_at)`. Visibility comes from the **same function as `get_feed`** (`private.visible_posts`, below); a post you can't see is simply absent. Not a member: empty. Index on `(space_id, coalesce(taken_at, published_at) desc, id desc)`. |
| `get_timeline_years` (0010) | `p_space, p_tz text = 'UTC'` | `[{year int, post_count int, photo_count int}]` | TIME-3/4 "Pick a year". Newest year first. Year of `sort_at` in `p_tz` (the app sends the phone's time zone). Counts include only posts the caller can see and only ready photos. Not a member: empty. Bad time zone: `22023`. |

**One visibility check (0010).** `private.visible_posts(p_space uuid)` returns the published, non-deleted posts in that space the caller may see (`post_id, published_at, taken_at`). `get_feed` and `get_timeline` (and `get_timeline_years`) both read it; neither has its own copy, so 0011's share-history cutoff (AUD-20) lands in one place. Checked by `backend/tests/timeline_test.sql`.

| `publish_post` | `p_post` | void | All media must be `ready`. Idempotent: publishing an already published post is a no-op. |
| `edit_post_words` (0020) | `p_post, p_title, p_caption` | `timestamptz` (the "Edited" time) | CAP-6..8. The sender changes the title and caption together; each is trimmed and blank means none. Title over 80 or caption over 2000 characters `23514`. A post you can't see, or a deleted one, `P0002`; anyone but the sender, or a sender who can no longer send to any of the post's groups, `42501`. No notice; comments and reactions stay. HARD-18: this is the only way to change a post's words (direct `UPDATE` on `posts` is revoked). |
| `get_feed`, `get_timeline` (0020 add) | same | `+ words_edited_at timestamptz \| null` | CAP-6. When the sender last changed the words; the card says "Edited". |
| `delete_post` | `p_post` | void | Author only. Soft delete; the post vanishes from every feed immediately, and media is queued for purge. Idempotent. |
| `toggle_heart` | `p_post` | `{i_hearted, heart_count}` | Viewers allowed. Kept for app builds before 0017; it adds or takes back a ❤️. |
| `set_reaction` (0017) | `p_post, p_emoji text` | `{my_reaction text \| null, heart_count int, counts jsonb}` | REACT-1..6. `p_emoji` is `❤️`, `😂` or `👍`, else `22023`. One reaction per person per post: the same one again takes it back, another switches (an update, so no second notice). Not visible: `P0002`; viewer replies off: `42501`. `counts` is `{"❤️": 2, "😂": 1}` over the reactions the caller may read (reply rules below); `heart_count` is their sum. |
| `reaction_summary` (0017) | `p_posts uuid[]` (first 100 used) | `[{post_id, my_reaction text \| null, counts jsonb}]` | REACT-2. The app calls it after each feed page. Posts the caller can't see are left out. `get_feed`'s `heart_count` counts every kind and `i_hearted` means "I reacted", unchanged. An app on a server without it (`PGRST202`) shows hearts only. Since 0018 these two RPCs (and `toggle_heart`) are the only way to write a reaction: a direct insert or update on `reactions` is `42501` (HARD-12). |
| `add_comment` | `p_client_id, p_post, p_body` | `{comment_id, created_at}` | Body is 1–500 characters after trim. Idempotent on `p_client_id`. |
| `get_comments` | `p_post, p_limit = 50` | `[{comment_id, author_id, author_name, body, created_at}]` | Oldest first |
| `mark_seen` | `p_post` | void | Idempotent; feeds "Seen by" |
| `redeem_invite` | `p_code` | `space_id` | `22023` for any bad code. Rate limited (S10): 10 failures per user per 10 minutes, then `54000`. |
| `invite_preview` | `p_code` | `{inviter_name, space_name}` or `22023` | Callable by **anon** (shows "Chase invited you" before sign-in). Rate limited like redeem. Leaks nothing else. 0011 (UX-G7): also `22023` for every invite `redeem_invite` would refuse for the invite's own sake (a relative's invite that no longer places anyone: its household or group retired, or its old group now has something under it; one rule, `private.invite_places`). Since 0013 (GRP-12) the only such case is an invite naming a group that has been retired. Only for that case the error's `details` is the inviter's name (the app says "Ask Chase for a new one."); unknown, expired, used and revoked codes carry no name (BETA-JOIN-3). Not counted as a rate-limit failure. |
| `create_invite` | existing signature + `p_name text = null`; returns `{code, link}` | | Only for posters (owner or adult). `p_name` is what the family calls the invitee ("Grandma June"); it becomes their name on joining unless they already chose one. Bad name: `23514`. `link` is `private.secrets.invite_link_base` + a 160-bit hex link token; since 0014 (ONB-3/4) that base is `https://thefreighttrains-team-hearth.expo.app/join/`, the hosted web build's join route, so `/join/<token>` and a typed `/join/<code>` both work (`invite_preview` and `redeem_invite` take either). Never `hearth.family` until it's bought (ONB-8); `backend/scripts/smoke-check.sh` fails if hosted still points there. |
| `rename_circle` | `p_circle, p_name` | void | Posters only. Not a manager of that group's space, or no such group: `P0002`. Empty, over 60 characters, or another group's name: `23514`. |
| `set_group_replies_shared` | `p_circle, p_on boolean` | void | AUD-9. Posters only (else `P0002`). On: members of this group read each other's replies on posts shared to it. Off by default. |
| `set_reply_audience` | `p_space, p_choice: 'parents'\|'everyone'` | void | AUD-10. Owner only (`42501`; non-member `P0002`; bad choice `23514`). Default `parents`. |
| `set_my_name` | `p_name` | void | 1–40 characters after trim; no `@`, `<`, `>` or line breaks (`23514`). |
| `my_profile` | — | `{user_id, display_name, name_set}` | `name_set` is false for an email-prefix placeholder; the app asks posters for a name once. |
| `register_push_token` | `p_token, p_platform: 'ios'\|'android'\|'web'` | void | Saves this phone's Expo token. Idempotent. A token re-registered by another user moves to them (shared phone). Bad token or platform: `23514`. |
| `set_notification_prefs` | `p_space, p_push boolean, p_email_digest: 'off'\|'daily'\|'weekly'` | void | Per space. Not a member: `P0002`. Bad choice: `23514`. Push on but no phone registered falls back to a daily email. |
| `report_client_error` | `p_app_version, p_os, p_screen, p_kind, p_code = null` | void | Callable by **anon**. Fixed-shape fields only (version, `ios 18.1`, route name, error type, error code); free text is `23514`, so no caption, email, URL or key can get in. 30/hour per person, then `54000`. Kept 30 days. |

## Who reads replies (AUD-8/9/10, migration 0009)
A reply is a comment or a heart. A relative's reply is readable by: its author; the post's author; the space's owners/adults; members of an audience group with `replies_shared`; or everyone who can see the post if the space's `reply_audience = 'everyone'`. Parents' replies reach everyone who can see the post. `get_comments`, `comment_count`, `heart_count`, `toggle_heart` and direct table reads all follow this rule. `get_feed` adds `reply_scope: 'parents'|'group'|'everyone'` (who will read the caller's replies on that post); `my_spaces` adds `reply_audience`; `my_circles` adds `replies_shared`. **0011 replaces the `replies_shared` switch with the household and event rules below.**

## Groups, households, events, roles and share history (0011, SPEC-GROUPS; contract tests first)
Failing tests written first (Oct 17): `backend/tests/groups_test.sql`, `backend/tests/aud16/`, `backend/tests/setup_v2_test.sh`, `backend/tests/timeline_future_test.sql`, `app/src/screens/__tests__/familyShape.test.tsx`. Every container is a `circles` row with `kind`: `everyone | group | household | event` (the app says "group"). Allowed links: household→group, household→event, group→event (`link_allowed`). `p_history` is `'all'` ("Share all past photos") or `'new'` ("Only new photos": shared from that moment on, by `published_at`, never `taken_at`); there is no default.

| RPC | Args | Returns | Notes |
|---|---|---|---|
| `can` | `p_space, p_capability: 'post'\|'send_to_everyone'\|'make_events'\|'invite'\|'set_up_family'\|'family_settings'` | boolean | AUD-21. The one permission check. First build reads only the role (owner, adult = parent, viewer = relative) and `viewers_can_post`. Only parents get `send_to_everyone` and `make_events`. Not a member: false. |
| `can_send_to` | `p_circle` | boolean | AUD-21, privacy item 2. Used by `create_post`, the `post_audiences` insert policy **and** `publish_post` (re-checked at publish). `everyone` needs `can(space, 'send_to_everyone')`; a relative may send only to containers they are a derived member of, and only when `can(space, 'post')`. Never another space. Refusal: `42501`. |
| `create_level` | `p_space, p_kind: 'group'\|'household'\|'event', p_name` | `circle_id` | AUD-13. Parents only (else `P0002`). `everyone` (there is exactly one per space) or an unknown kind: `23514`. Same name rules as `rename_circle`. |
| `link_level` | `p_parent, p_child, p_history: 'all'\|'new'` | void | AUD-13/19. Parents only (`P0002`). A pair `link_allowed` refuses, a loop, a cross-space link, or a missing/bad `p_history`: `23514`. Idempotent for the same pair. |
| `unlink_level` | `p_parent, p_child` | void | AUD-15. Parents only (`P0002`). Access is gone in the same transaction. |
| `place_person` | `p_group, p_user, p_history` (0013 renames `p_household`) | void | AUD-12/13/19, GRP-10. Parents only (`P0002`). Since 0013 any live group, household or event; Everyone: `23514`; missing/bad `p_history`: `23514`. A person may be in several groups. |
| `unplace_person` | `p_household, p_user` | void | AUD-15. Parents only (`P0002`). |
| `retire_level` | `p_circle` | void | Added in the build (family-setup v2). Parents only (`P0002`); Everyone: `23514`, also for a direct `UPDATE` of `circles.deleted_at` (trigger `everyone_stays`, S-0011-7). Retiring is one-way: no RPC un-retires, and a direct `UPDATE` setting `deleted_at` back to null is `23514` (same trigger, S-0011-8). Soft-deletes a group, household or event (sets `deleted_at`); derived membership is rebuilt in the same transaction. Posts keep their other audiences. |
| `reply_readers` | `p_post` | `text[]` (names the family uses) \| null | REPLY-11, privacy item 7. Who will read the **caller's** reply on this post: exactly the members for whom `can_see_reply` would be true, never the caller. Only people who can see the post now (after any cutoff). Null ("not found") for a post the caller can't see. The comment box says "Memaw, Pawpaw, Granny, Chase and Danielle will read this." |
| `create_invite` (0011 changes) | `+ p_history text` (required when `p_role = 'viewer'`); `p_circle_ids` names one household | `{invite_id, code, link, expires_at}` | AUD-19. Missing/bad `p_history`, or a non-household: `23514`. Redeeming copies the choice: `space_members.sees_from` (and the placement's) is null for `all`, the invite's creation time for `new`. A removed-then-re-invited person gets the new invite's choice; no old cutoff survives (privacy item 10). |
| `my_circles` (0011 changes) | `p_space` | `+ kind, parent_ids uuid[]`; **drops** `replies_shared` | REPLY-12, privacy item 13. Only containers the caller can see; a relative never learns other households, groups or events exist (AUD-14). |
| `set_group_replies_shared` | — | — | **Dropped in 0011** (REPLY-12), with `circles.replies_shared`. |

**Tables (0011).** `circle_links (parent_id, child_id, sees_from)`, `circle_people (circle_id, user_id, sees_from)`, `circle_members` (+ `sees_from`) are written **only by triggers and the RPCs above**: app users have no insert/update/delete on any of them (privacy item 3). Same-space, `link_allowed` and loop checks are triggers, so even a direct insert is `23514`.

**Reply rule (0011, SPEC-GROUPS section 6).** Reader R may read reply X by W on post P only if R can see P and one holds: R is W; R or W is a parent; R or W is P's author; R and W are placed in the same household (direct `circle_people` rows, never derived group membership: no relay); R and W are both in an event in P's audience; or the owner set `reply_audience = 'everyone'`. **Readers are fixed when the reply is written** (privacy item 5, default chosen Oct 17; Chase can change it): moving someone into a household or adding a household to an event later never lets new people read older replies; anyone who stops qualifying stops reading at once. Widening someone's share history in place (e.g. placed again with "Share all past photos") is recorded on the membership (`circle_members.widened_at`, `sees_from_before`, set by trigger): for posts the old cutoff hid, they read only replies written after the widening (S-0011-6).

**Share-history cutoff.** One predicate (`sees_from is null or published_at >= sees_from`), called by `can_view_post`, `private.visible_posts` (feed, timeline, years), `claim_notification_batches`, `get_comments`, `can_see_profile` and so `sign-media`. AUD-20 parity test across all of them.

**As built (0011, Oct 17).** Answers to the contract's open assumptions:
- **Parents** (owner, adult) see every published post through `private.sees_post`; they are not written into `circle_members`, so `my_circles` counts are unchanged. On the hosted project an adult gains any posts in groups they were not in.
- **Invites.** A relative's invite names exactly one circle: a household, or a legacy v1 group with no child links (0011). 0013 replaces this: invites to any group(s), per `docs/product/SPEC-GROUPS.md` v2 (GRP-12). Redeeming a household invite places the person there (`circle_people`) and joins them to Everyone (`space_members.in_everyone`); a legacy group invite writes direct `circle_members` rows as before. Someone who should be only in an event needs a later option.
- **Refusals.** A relative sending to Everyone, or to a container they belong to but may not send to: `42501`. A container that is not theirs or doesn't exist: `23514` (it behaves as not found). `publish_post` re-checks and refuses with `42501`.
- **`reply_readers`** returns `text[]` of display names sorted by name, never the caller; null if the caller can't see the post. The app shows up to 6 names, then "and N more people", and falls back to the `reply_scope` words if the server has no list.
- **Privacy review of the build (Oct 17, S-0011-1..4).** (1) Household and event readers are also fixed by when a container joined the post's audience (`post_audiences.added_at`): a house added to a post later sees the photo, not the replies written before; app users may insert only `post_id, circle_id` there. (3) Until 0013 (SPEC-GROUPS v2, GRP-12: then only a retired group refuses), `redeem_invite` refuses (`22023`, not consumed) a relative's legacy-group invite once that group is retired or has anything linked under it. (4) The v2 dry run's "before" is the 0010 rule (author or member), so it counts what 0011 gives a Parent and prints "<name> is a Parent: ..." for each adult.
- **`can_see_reply(post, writer)`** (2-arg, for feed and badge counts) judges as of the writer's first reply on the post (their heart or earliest comment), or now if none. Per-reply checks (`get_comments`, table policies) use each reply's own `created_at`.
- **family-setup v2** places people by display name (`profiles.display_name`, case-insensitive) and lists anyone it could not place.
- **App:** `CreateInviteArgs.history: 'all'|'new'` (required for viewers), `Circle.kind`, `Circle.parent_ids`, `HearthApi.replyReaders(post)`; `setGroupRepliesShared` and `Circle.replies_shared` are gone.

## Groups v2: comment settings, copying people, multi-group invites, feature switches, event rows (0013, SPEC-GROUPS v2)
Failing tests written first (Oct 18): `backend/tests/groups_v2_test.sql`, `backend/tests/grp1/`, `backend/supabase/functions/sign-media/index_test.ts` (FLAG-4). Comment settings are `'private'` ("Private"), `'on_group_posts'` ("Shared on this group's posts") and `'always'` ("Always shared").

| RPC | Args | Returns | Notes |
|---|---|---|---|
| `set_comment_mode` | `p_circle, p_mode` | void | GRP-9. Parents only (else `P0002`). Any value but the three, or null: `23514`. Everyone: `23514` (the owner's `set_reply_audience` is the one way to open Everyone). A direct `UPDATE` of `circles.comment_mode` is `42501`. Every change is logged with its time (`comment_mode_log`). |
| `add_people_from` | `p_target, p_source, p_history` | void | GRP-11. Parents only (`P0002`). Copies every relative now in `p_source` into `p_target`, once, in one transaction (parents are not copied; someone already there is skipped). Copied, not linked: people added to the source later are not added. Target Everyone, different families, or missing/bad `p_history`: `23514`. |
| `create_invite` (0013 changes) | same signature | same | GRP-12. A relative's invite names **one or more** live groups of any kind, Everyone included; `p_history` still required. Redeeming places the person in each named group (`circle_people`) and in Everyone only if Everyone is named (or, for an invite made before 0013, a household). If a named group has been retired since, `invite_preview` and `redeem_invite` answer `22023` (preview with the inviter's name). |
| `my_circles` (0013 changes) | `p_space` | `+ comment_mode text` | GRP-13. Parents only, as before; relatives still get `[]`. This is the only way to read a setting: `circles.comment_mode` is not readable by app users (`42501`), and `comment_mode_log` rows are visible only to parents. |
| `get_feed`, `get_timeline` (0013 add) | same | `+ event_id uuid \| null, event_name text \| null` | EVT-1. The event the post was sent to, only for that event's members (whose share-history cutoff the post passes) and parents. Anyone else gets nulls. |
| `can` (0013 adds) | `p_capability: + 'use_video'` | boolean | Parents only to start. |
| `my_features` | `p_space` | `[{feature}]` | FLAG-1/2. The features on for the caller in that family: global switch (`private.feature_flags`, Hearth only, no app grant) **and** family add-on (`space_features`, parents write it directly: `insert (space_id, feature, enabled)`, `update (enabled)`) **and** `can(space, capability)`. Default off for add-ons: `video_posting` (capability `use_video`). Default **on** for off-switches (0016, HELP-R4): `photo_helpers_duplicates` and `photo_helpers_screens_blur` (capability `post`); a missing row counts as on, a `false` global or family row turns it off. |
| `space_members` + `profiles` (table reads, app `familyPeople`) | `select user_id, role from space_members where space_id = p_space`; then `select id, display_name from profiles where id in (...)` | `[{user_id, name, role}]` | GRP-15/16. No new grant: existing RLS (0002 `space_members_select`, 0012 `can_see_profile`). A parent gets everyone in the family; a relative only herself and the parents. Only the parents' Groups screen calls it (to tick people for a new group); never an email. |
| `prepare_media_upload` (0013 changes) | same | same | FLAG-4. A video item while `video_posting` is off for the caller: `42501` with message `video_posting_off`; nothing is created. `sign-media` answers `403 {"error":"video_posting_off"}` and signs nothing. |

**Reply rule (0013, SPEC-GROUPS v2 section 2).** Reader R may read reply X by W on post P only if R can see P and one holds: R is W; R or W is a parent; R or W is P's author; the owner set `reply_audience = 'everyone'`; or a live group G had both R and W as members when X was written and G's effective setting is `always`, or `on_group_posts` with G on P's audience by then. Effective setting = the less open of the setting when X was written and the setting now. R must also have been able to see P when X was written (unchanged from 0011). One function, `private.group_reply_ok`, holds the group part; `reply_ok` (RLS, `get_comments`, `can_see_reply`, `reply_readers`), `reply_scope` and the feed counts all use it. 0013 backfills households to `always` and events to `on_group_posts`, which is the 0011 rule exactly (GRP-1). `reply_scope` is `'group'` when a group setting lets someone other than the parents and the poster read the caller's next reply on that post.

**App (EVT-2..4, Oct 18).** `FeedPost.event_id` / `event_name` (optional; null or missing = no event the caller is in). Photos shows an event's first loaded post as an event card and its later posts as one update line (`EVENT_LATER_POSTS_IN_PHOTOS` in `app/src/feed/events.ts`, false until Chase decides EVT-3); the Events list and each event's posts are built from the loaded feed pages, so no new RPC. The contract test "EVT-1 feed and timeline rows carry the event id and name..." holds the FakeBackend to the server rule.

**Timeline and future capture dates (Oct 17).** `get_timeline`'s `sort_at` and `get_timeline_years` treat a `taken_at` later than `published_at` as `published_at` (`timeline_future_test.sql`). The phone ignores capture dates more than 1 day in the future (BETA-BULK-1).

## Messenger relay (0015, SPEC-MESSENGER; contract tests `app/src/api/contract/chat.contract.test.ts`)

Bodies, key packages and signing keys are base64 MLS bytes the server never opens. Every call on a chat the caller isn't in (not a member, not a parent, a household, deleted, or no such circle) is `P0002`.

| RPC | Args | Returns | Errors |
|---|---|---|---|
| `chat_list` | `p_space` | `circle_id, kind, title, named, member_count` per chat I'm in; `named=false` means the title lists the people (AUD-14) | `P0002` not in the space |
| `chat_publish_device` | `p_signature_key, p_key_packages text[]` (1-50) | void; a new signing key drops the old phone's unused packages | `23514` not base64 / count; `42501` signed out |
| `chat_key_package_count` | none | my unused packages on the server | |
| `chat_start` | `p_circle` | `true` if I started the chat (make the MLS group), `false` if someone had | `P0002` |
| `chat_roster` | `p_circle` | `user_id, name, signature_key` (null until they open Messages) | `P0002` |
| `chat_claim` | `p_circle, p_users uuid[]` | one `user_id, key_package` per listed person in the chat who has one; used up | `P0002` |
| `chat_send` | `p_circle, p_kind` (`commit`/`welcome`/`message`), `p_epoch, p_body, p_recipient` (welcome only) | row id | `23505` a commit for that epoch exists (MSG-5); `23514` kind, recipient, base64, > 64 KB |
| `chat_fetch` | `p_circle, p_after, p_limit` (≤ 500) | rows after `p_after` in id order, created since I joined; welcomes only to their recipient | `P0002` |

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
