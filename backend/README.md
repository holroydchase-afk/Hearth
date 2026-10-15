# Hearth backend

A private family photo and video feed. Postgres holds the who-can-see-what. Backblaze B2 holds the encrypted bytes. A single Edge Function is the only door between the two.

```
supabase/migrations/0001_init.sql      schema, RLS on every table, helper functions, triggers, RPCs
supabase/migrations/0002_beta_api.sql  the API.md RPCs, invite hardening (S9/S10), faster RLS, feed indexes
supabase/functions/sign-media/         presigned B2 URLs (SigV4 via Web Crypto) + per-item data keys
supabase/seed.sql                      demo: two households sharing one child
supabase/config.toml                   local stack for `supabase start` (CI)
tests/supabase_stub.sql                local stand-in for Supabase's auth schema/roles (not deployed)
tests/rls_test.sql                     110 permission assertions run as simulated users
tests/api_test.sql                     130 API.md contract assertions: every RPC, error codes, idempotency, rate limits
tests/run.sh / tests/run_supabase.sh   both SQL suites on local Postgres / on a real `supabase start` stack
tests/perf/                            1M-post scale test for get_feed (RESULTS.md)
tests/integration/                     PostgREST harness (start.sh/stop.sh) + Deno smoke test over real HTTP
```

## Security model, in plain English

- **Nobody sees a post unless the post was shared with a circle they're in.** That includes space owners. Every post names its audience as one or more circles, like "Grandparents – Dad's side" or "Co-parent". The single rule lives in `can_view_post()`, and both the database policies and the media signer use it.
- **Removed members lose everything in that space, including their own old posts and drafts.** `export_my_data()` still returns them.
- **Split families get two separate spaces.** Each parent owns a space for their household. To share with the other parent, you add them to your space as a viewer, in a "Co-parent" circle only. They see the posts you send to that circle, and they see that one circle's name. They don't see your other circles, who's in them, or your grandparents' profiles. The child record can be linked into both spaces, and linking grants no visibility on its own.
- **Changing the audience takes effect on the next request.** No copies or caches of permissions exist. The one lag: a media URL that was already handed out keeps working until it expires, at most **10 minutes**. The bytes it fetches are ciphertext, and the viewer only had the key because they were allowed to see the post at that moment.
- **Photos and videos are encrypted before they reach Backblaze.** For each upload, the function generates a random AES-256 key per item. The app encrypts the file with that key and uploads only ciphertext. We store the key wrapped (AES-KW) under a master key (`MEDIA_KEK`) that exists only in Edge Function secrets, never in the database or the app. Backblaze never sees a viewable photo. Deleting a key row destroys that item even before the blob itself is purged.
- **Location data is removed on the phone.** The app must strip EXIF, GPS, and maker metadata before encrypting. The server can't inspect ciphertext, so each upload has to carry `exif_stripped: true`. The function rejects uploads without it (422), and a database CHECK constraint refuses the row as well.
- **Clients can't touch billing, counters, keys, or object paths.** Column-level grants enforce this. Clients can't *read* the billing columns or the monthly video counter either (a co-parent would learn the household's activity); owners get them from `space_upload_quota()`. A child's `birth_date` is readable only by guardians, via `child_birth_date()`. So `select *` on `spaces` or `children` fails: name the columns. Object keys are derived server-side as `s/<space>/p/<post>/m/<media>/…`.
- **The free tier allows 10 video uploads per space per calendar month (UTC).** A database trigger enforces the cap with a row lock, so parallel uploads can't race past it. The counter tracks attempts, so deleting a video doesn't give the slot back.
- **Invites expire.** Each invite has a 10-character code for typing and a link with a 160-bit token. They're single-use by default and last at most 30 days. Both are stored only as HMAC-SHA256 under a server-side pepper (`private.secrets`), and the hash columns can't be read by any client, managers included (S9). An invite sent to an email address or phone number can only be redeemed by an account with that address or number. That fits Supabase magic-link and SMS OTP sign-in: grandparents never need a password. Every bad invite returns the same `22023` error. The reasons (unknown, expired, revoked, used up, or meant for someone else) are deliberately indistinguishable.
- **Guessing is rate limited (S10).** `redeem_invite` and `invite_preview` allow 10 failures per account and per client IP in 10 minutes, then return `54000`. A raised error would roll back the failure log, so through PostgREST these two RPCs *return* the error body with HTTP 400/429 and the log commits. supabase-js sees the same `{error: {code}}` either way. `Prefer: tx=rollback` is refused. The client IP is `cf-connecting-ip`, or else the last `X-Forwarded-For` hop.
- **There are no ad, tracking, or ML columns.** The migration header states that no content is used for AI training.

## What runs where

| Piece | Where | Free-tier fit |
|---|---|---|
| Postgres, Auth, RLS, RPCs | Supabase, US East | Free: 500 MB DB, 50k MAU (but it pauses after 1 week idle and has no backups, so use Pro, $25, before real families) |
| `sign-media` | Supabase Edge Functions | 500k invocations/mo free |
| Media bytes | Backblaze B2, **US East** account | First 10 GB free; egress free up to 3× stored |
| Email magic links | Resend (custom SMTP in Supabase Auth) | 3k/mo, 100/day |
| Push | Expo Push | free |

## Deploy for about $0

1. **Backblaze:** create the account and **pick US East at signup**, since the region is permanent. Create a **private** bucket `hearth-media`, then an application key scoped to that bucket with read/write. Note the S3 endpoint (e.g. `https://s3.us-east-005.backblazeb2.com`) and region (`us-east-005`). Add a CORS rule on the bucket that allows `GET, PUT, HEAD` from your web viewer origin. Native apps don't need it.
2. **Supabase:** create a project in **East US (N. Virginia)**. Then:
   ```bash
   supabase link --project-ref <ref>
   supabase db push                       # applies 0001_init.sql
   # demo data, optional and never in production:
   psql "$DB_URL" -f supabase/seed.sql
   ```
   In Auth settings, turn on Email (magic link) and, if you want it, Phone (SMS OTP, which needs a Twilio account and is not free). Set the Site URL / redirect to your app scheme.
3. **Secrets and function:**
   ```bash
   supabase secrets set \
     B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com B2_REGION=us-east-005 \
     B2_BUCKET=hearth-media B2_KEY_ID=... B2_APP_KEY=... \
     MEDIA_KEK=$(openssl rand -base64 32) ALLOWED_ORIGINS=https://app.example.com
   supabase functions deploy sign-media     # JWT verification stays ON
   ```
   Back up `MEDIA_KEK` offline. **If you lose it, you lose every photo.**
4. **Scheduled jobs** (enable `pg_cron` under Database → Extensions):
   ```sql
   select cron.schedule('hearth-purge', '17 4 * * *', $$select public.purge_soft_deleted('30 days')$$);
   ```
   You also need a small worker, running as service_role on a free cron (GitHub Actions or a scheduled Edge Function). It drains `storage_purge_queue` by calling B2 DeleteObject, builds `account_exports` zips, and removes `auth.users` rows after `request_account_deletion()`. Those three jobs aren't written yet.

## Client flows

- **The full RPC contract is `../API.md`.** The list below is the upload flow.
- **Post:** `create_post(p_client_id, p_space, p_caption, p_circle_ids[], p_taken_at?, p_child_ids?)` creates a draft. It's idempotent on `p_client_id`. `POST sign-media {action:"upload", post_id, items}` returns `{media_id, dek, display_put_url, thumb_put_url}`. The client strips metadata, encrypts with `dek`, and PUTs with `content-type: application/octet-stream`. Then it calls `POST sign-media {action:"finalize", media_ids}`, which HEAD-checks the sizes, followed by `publish_post(post)` (idempotent).
- **Feed:** `get_feed(p_space, p_before_ts?, p_before_id?, p_limit?)` returns one page per call, keyset-paginated. Hearts, comments and seen-by go through `toggle_heart`, `add_comment` / `get_comments` and `mark_seen`.
- **Delete:** `delete_post(post)` soft-deletes the post, destroys its wrapped keys and queues the blobs for purge. Clients can no longer set `posts.deleted_at` directly.
- **View:** `select * from posts` still returns only the rows you're allowed to see, but the app uses `get_feed`. `GET sign-media?post_id=…` returns 10-minute URLs plus keys. The client decrypts in memory.
- **Change audience:** `set_post_audience(post, circle_ids[])`.
- **Invite:** `create_invite(space, 'viewer', circle_ids[], 'email', 'grandma@…')` returns `{invite_id, code, link, expires_at}` once. You send the link yourself. Before sign-in, the app can call `invite_preview(code)` as anon to show "Alex invited you to …". After the magic-link sign-in it calls `redeem_invite(code)`, which returns the `space_id`.
- **Export or delete my account:** `export_my_data()` or `request_account_export()`; `request_account_deletion()`.

## Run the tests locally

```bash
# needs Postgres 15+ and a superuser
tests/run.sh                              # rls_test (110) + api_test (130), each on a fresh DB; non-zero on failure
deno test --allow-env supabase/functions/sign-media/   # SigV4 vs AWS test vector + handler smoke tests

# real HTTP through PostgREST (downloads the v12.2.3 static binary, checksum-pinned)
tests/integration/start.sh > /tmp/harness.json   # prints {url, anonKey, serviceRoleKey, users:{name:{id,jwt}}}
deno test --allow-read --allow-net --allow-env tests/integration/
tests/integration/stop.sh

tests/perf/run.sh                         # ~3 min: 1M posts / 50k spaces; fails if get_feed p95 >= 30 ms

# S16 on the real stack (what CI runs, see ../.github/workflows/ci.yml)
npx supabase@2.121.0 start && tests/run_supabase.sh
```

## Known caveats

- **Supabase isn't 100% US.** Auth logs (emails and IPs) and telemetry can be processed outside the US (see research.md §4). The promise we can keep: "photos, videos and the database live in the US, and the photos are encrypted with keys we control."
- **This is server-held-key encryption, not end-to-end.** A compromised Edge Function secret, or a malicious operator, could decrypt media. E2EE (per-circle keys on devices) is a later project and would complicate the web viewer and account recovery.
- **The 10-minute lag on revocation.** A URL or key already handed out can be reused until it expires. Keys are per item, so a viewer who saved a key keeps the ability to decrypt that item if they also saved the ciphertext. Rotating keys on audience change would require re-encrypting.
- **Video thumbnails and transcoding happen on the device.** The server never sees plaintext, so it can't make variants.
- **Both co-parents are equal owners of their own spaces.** There's no court-order or "supervised" mode, and no mechanism to stop a co-parent from reposting something they downloaded.
- **Seen-by receipts are always recorded.** Per API.md, `get_feed` gives every author the *count* (`seen_count` of `reach_count`, audience members only). The `post_views` rows (who saw it) are still readable only on the `family` plan.
- `tests/supabase_stub.sql` only imitates `auth.uid()` and the roles. CI runs both suites against a real `supabase start` stack (`tests/run_supabase.sh`). That job hasn't run yet: it needs GitHub Actions, because Docker images can't be pulled in the dev sandbox.
- **PostgREST 12 maps `P0002` to HTTP 500.** The `code` field is right, so the app must branch on `error.code`, not the HTTP status.
- **The per-IP rate limit depends on a trustworthy client IP header.** On hosted Supabase that's Cloudflare's `cf-connecting-ip`. Behind a gateway that doesn't set it, the last `X-Forwarded-For` hop may be the gateway itself, so every client would share one IP bucket. Check this once on the hosted project before Ring 1.
- **The invite pepper sits in the database (`private.secrets`).** It stops managers and API clients from cracking hashes offline. It doesn't help against someone holding a full database dump.
