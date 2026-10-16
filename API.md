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
| `publish_post` | `p_post` | void | All media must be `ready`. Idempotent: publishing an already published post is a no-op. |
| `delete_post` | `p_post` | void | Author only. Soft delete; the post vanishes from every feed immediately, and media is queued for purge. Idempotent. |
| `toggle_heart` | `p_post` | `{i_hearted, heart_count}` | Viewers allowed |
| `add_comment` | `p_client_id, p_post, p_body` | `{comment_id, created_at}` | Body is 1–500 characters after trim. Idempotent on `p_client_id`. |
| `get_comments` | `p_post, p_limit = 50` | `[{comment_id, author_id, author_name, body, created_at}]` | Oldest first |
| `mark_seen` | `p_post` | void | Idempotent; feeds "Seen by" |
| `redeem_invite` | `p_code` | `space_id` | `22023` for any bad code. Rate limited (S10): 10 failures per user per 10 minutes, then `54000`. |
| `invite_preview` | `p_code` | `{inviter_name, space_name}` or `22023` | Callable by **anon** (shows "Chase invited you" before sign-in). Rate limited like redeem. Leaks nothing else. |
| `create_invite` | existing signature + returns `{code, link}` | | Only for posters (owner or adult) |
| `register_push_token` | `p_token, p_platform: 'ios'\|'android'\|'web'` | void | Saves this phone's Expo token. Idempotent. A token re-registered by another user moves to them (shared phone). Bad token or platform: `23514`. |
| `set_notification_prefs` | `p_space, p_push boolean, p_email_digest: 'off'\|'daily'\|'weekly'` | void | Per space. Not a member: `P0002`. Bad choice: `23514`. Push on but no phone registered falls back to a daily email. |

## Notifications (server only)
Triggers queue a notice on publish (audience members, not the author) and on a comment or heart (the post's author, never the reactor). The `notify` edge function runs on a 1-minute cron, calls `claim_notification_batches()` (service_role only) and sends one notice per recipient: at most 1 push per 10 minutes, and 1 email per day (or week). **Payload:** the actor's first name, counts and post id only; never a photo, caption, comment text or child's name. Push `data.postId` opens the post.

## Edge function `sign-media`
The request and response shapes documented at the top of `backend/supabase/functions/sign-media/index.ts` (GET view, POST upload, POST finalize) are the contract.
- **Upload:** the client encrypts each file with AES-256-GCM using the returned per-item key before the PUT.
- **Order:** `create_post` (draft) → `sign-media upload` → PUT encrypted bytes → `finalize` → `publish_post`.

## Scale targets (checked by `backend/tests/perf/`)
- **`get_feed`:** p95 under 30 ms in the database for a viewer in a space with 20,000 posts, on a table of about 1M posts across about 50k spaces.
- **Per-row work:** RLS helpers are wrapped as `(select auth.uid())` so they run once per statement, not once per row.
- **Indexes:** every foreign key and every RLS lookup path is indexed.
