# 2. Data flow

How data moves through Hearth, one flow at a time. Each step says who sees what. Component names are defined in [01-system-overview.md](01-system-overview.md); "family space" is one family's shared area (`spaces` in code), and "groups" are the audiences inside it (`circles` in code).

## Sign-in (Built)

1. The person enters an email address. Supabase Auth sends a 6-digit code through Resend SMTP; the code expires in 1 hour.
2. The app exchanges the code for a session (a JWT). Every later database call and every `sign-media` call carries it, and Postgres reads the user's id from it (`auth.uid()`).
3. New members join through an invite created by a parent; the invite decides which family space and groups they land in.

**Invite links (Built, migration 0014).** `create_invite` returns a 10-letter code (for typing or reading aloud) and a link: the hosted web build's address (Expo's EAS Hosting, `https://thefreighttrains-team-hearth.expo.app/join/`) plus a 160-bit random token. Both are stored only as keyed hashes (S9). The app's one join route, `/join/<code-or-token>`, shows "Chase invited you" through `invite_preview` and joins through `redeem_invite`; both accept either value and share the rate limit (S10: 10 failures per account or address in 10 minutes). The parent sends the link from their own Messages app; Hearth doesn't send it.

**Who sees what.** Supabase and Resend see the email address and the code. Supabase Auth logs the IP address (a residency gap, see 01). The phone carrier sees the invite text. The web host sees the invite link's path, token included, in its request logs; **planned (ONB-6, milestone 2):** the token moves after `#`, which browsers never send. Before 0014 links pointed at `hearth.family`, a domain Hearth hasn't bought; `backend/scripts/smoke-check.sh` fails if hosted still does. **Planned:** text-message codes as the default (tracker D11); other sign-in options (D12).

## Posting a photo (Built)

1. **On the phone.** The photo is decoded (applying its rotation), resized to a display and a thumbnail version, and re-encoded as JPEG at the media policy's size and quality (2048 px, 0.82). The encoder may still write a small Exif block (iOS writes colour space and pixel size), so a pure-TypeScript cleaner then copies each JPEG segment by segment and keeps only the image itself, the JFIF header and the colour profile (ICC, e.g. Display P3); location, date, camera and lens, serial numbers, software, maker notes (including Apple's Live Photo ID), XMP, face regions, IPTC, comments, unknown blocks and anything after the image end are removed. A verifier re-reads the result and refuses to continue (`META_<GROUP>`, e.g. `META_LOCATION`) if anything the policy strips survived. The rules are one frozen, versioned object in the app's code (`app/src/media/policy.ts`, `clean.ts`, `pipeline.ts`); no server setting can change them. The date taken is read from the photo picker, not the file, and only the date is sent. On a bulk pick the photo helpers (`app/src/share/helpers.ts`, R15) also read, on the phone, the library id and whether the library marks a photo as a screenshot; they only decide what to leave out of this send, and neither value is sent or stored. For look-alikes and blur the phone renders a 160 px preview of each picked photo and reads its pixels in TypeScript (`app/src/media/preview.ts`, `pixels.ts`); the preview and the numbers worked out from it stay on the phone. To say "you already sent these", the phone keeps a SHA-256 of each sent photo's preview for 30 days in its own storage (`app/src/share/sentBefore.ts`); a fingerprint can't be turned back into a picture and is never sent. Video posting is off until video location data can be stripped the same way (`app/src/media/prepare.ts`).
   If a photo fails for good, the app sends one error report with only the error code and the screen name `upload` (never the file, a URL, a key, a caption or any metadata) to our own fixed-shape error table.
2. **Draft.** The app calls `create_post` with a caption and the chosen groups. It is idempotent on a client-generated id, so a retry never creates a duplicate.
3. **Upload grant.** The app asks `sign-media` for an upload. Postgres checks the caller may post in that space and creates pending media rows; the database refuses any row not marked `exif_stripped`. `sign-media` creates a fresh 256-bit key per item, stores it wrapped, and returns the key plus presigned PUT URLs valid for 10 minutes.
4. **Encrypt and upload.** The app encrypts each version with its key (format in [03](03-encryption-and-keys.md)) and PUTs the ciphertext straight to B2. The signed URL only accepts `application/octet-stream`.
5. **Finalize and publish.** `sign-media` checks each object's size in B2 and marks it ready; `publish_post` makes the post visible to its audience.

The upload queue survives app restarts and bad signal; each step can be retried safely.

**Who sees what.** B2 sees ciphertext and sizes only. Supabase stores the caption, the audience, dimensions and byte sizes in plaintext, and the wrapped key.

## Viewing (Built)

1. The timeline comes from `get_timeline` / `get_feed`, which return only posts the caller may see. One predicate, `private.sees_post` (migration 0011), decides visibility for RLS, the feed, `sign-media` and notices alike. Parents in a family space see every published post in it.
2. For each post the app calls `GET sign-media?post_id=…`. The function first checks `can_view_post` as the caller; if that fails it returns `404 not_found`, the same as a post that doesn't exist. It then reads media rows under the caller's RLS, unwraps each key with `MEDIA_KEK`, and returns 10-minute GET URLs and the keys.
3. The app downloads ciphertext, decrypts it in memory and shows it. Decrypted bytes touch disk only when the person taps "Save to my phone" (`app/src/media/cache.ts`). On iPhone and Android the ciphertext and its item key are kept on the phone (key sealed under a Keychain/Keystore key), so a photo seen before opens with no network call; see [03-encryption-and-keys.md](03-encryption-and-keys.md) "On the phone". A refresh that no longer lists a post drops its kept files and keys. The last feed page (captions, names, reactions) is cached on the phone for a fast start; signing out deletes it, with the kept photos and the notice-timing log (HARD-13).

## Replies, hearts and notices (Built; push is milestone 2)

1. Comments and hearts are rows in Postgres. A reply is readable by the parents, the post's author, the writer's own household and people in the same event on that post; the readers are fixed when the reply is written (migration 0011, `SPEC-GROUPS.md` §6).
2. Triggers write a notice to an outbox table (migration 0003). Every minute `pg_cron` runs `notify`, which batches notices per person and sends email through Resend (and push through Expo from milestone 2).
3. A notice carries the actor's chosen display name, counts and a post link. For a bulk import it may also name the month and year the photos were taken. It never carries a photo, caption, comment text or child's name, and `notify` logs counts only.

**Planned:** a setting to send notices with no names (tracker D9).

## Messages (Built, migration 0015)

Group chat is end-to-end encrypted with MLS: phones seal messages before sending, the server relays them, and the history lives on each phone. The full flow is in [06-messenger.md](06-messenger.md).

## Deletion

- **Delete a post (Built).** `delete_post` soft-deletes the post, deletes its wrapped keys and queues its B2 objects for removal. With the keys gone, Hearth can no longer decrypt those objects, even before they are removed.
- **Delete my account (Built, partly).** `request_account_deletion` hides the person's posts and comments, removes hearts, push tokens and memberships, and marks the profile deleted.
- **Gap.** The nightly hard purge (`purge_soft_deleted`, 30 days) is not scheduled by `backend/scripts/deploy.sh`; the worker that deletes queued B2 objects, removes the auth user and builds data exports is not written (`backend/README.md`). Database backups keep deleted rows, including wrapped keys, for Supabase's backup window.

---
Last checked against code: 2026-10-28, sign out clears the feed cache (state/AppContext.tsx, HARD-13); earlier 2026-10-21, R15 photo helpers (share/helpers.ts, media/pick.ts) and A3 kept photo files (media/cache.ts); earlier 2026-10-19, a522a3a (plus migrations 0014, 0015) and 624fc39 (MEDIA-1/2/3 on-phone cleaner)
