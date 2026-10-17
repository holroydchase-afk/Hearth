# Hearth app (Expo SDK 54, TypeScript strict, expo-router)

The real Hearth mobile app: a private family photo feed for grandparents. Built test-first against
`../API.md`; the UX follows `../UX-REVIEW.md` (group not circle, Help tab for viewers, Bigger text
on by default for viewers, 48 pt targets, 17 pt+ text, "Love it", "Save to my phone").

## Run

| Command | What |
|---|---|
| `npm test` | Jest (jest-expo) unit + screen + contract tests against FakeApi. ~15 s. |
| `npm run typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess`. |
| `npm run e2e:web` | Exports the web bundle in FakeApi mode (`EXPO_PUBLIC_HEARTH_FAKE=1`) and runs the Playwright core-loop smoke test at 360×740. |
| `npm run test:contract:real` | Starts `../backend/tests/integration/start.sh` (fresh DB + PostgREST :3001), runs the docs/eng/API.md contract tests through `SupabaseApi`, stops it. |
| `npm run eas -- <command>` | EAS CLI (`whoami`, `build`, `update`) with the environment's `EXPO_ACCESS_TOKEN` passed as `EXPO_TOKEN`. Tested by `scripts/tests/eas_test.sh` (EXPO-1). Needs `api.expo.dev` on the network allowlist. |
| `npx expo start` | Dev server (needs the env below, or `EXPO_PUBLIC_HEARTH_FAKE=1`). |

## Architecture

- `src/api/HearthApi.ts` – interface mirroring docs/eng/API.md (+ email-OTP auth + presigned byte transfer).
  - `SupabaseApi.ts` – supabase-js RPCs + `sign-media` edge function.
  - `fake/FakeBackend.ts` – in-memory backend enforcing the same visibility, idempotency, error codes, invite rules and S10 rate limit.
  - `contract/` – one contract suite run against every implementation (FakeApi always; SupabaseApi when env is set).
- `src/upload/queue.ts` – persistent upload queue: draft → uploading → finalizing → published, plus failed-retryable (backoff 2/4/8/15/30 s, kicked on app foreground) and failed. Idempotent through `p_client_id`. Data keys stay in memory only.
- `src/media/pipeline.ts` – 2048 px long edge, ~40 KB thumbnail (≤48 KB cap), re-encode strips metadata and the output bytes are **scanned** for EXIF/XMP before upload, orientation applied by the decoder, video ≤ 60 s check.
- `src/crypto/media.ts` – AES-256-GCM, `aes-256-gcm-chunked-v1` (64 KiB chunks, STREAM-style nonces: prefix‖index‖last-flag) with `@noble/ciphers`.
- `src/feed/store.ts` – keyset pagination, per-user cached first page, optimistic hearts/comments/delete, comment drafts that survive refreshes (B6).
- `src/errors/messages.ts` – docs/eng/API.md codes → plain words. `src/ui/ErrorBoundary.tsx` – last line of defense.
- Screens (`src/screens`, routes in `src/app`): Join (invite link), Sign in, Photos, Full-screen viewer, Share, Groups (posters), Help (viewers), Me (posters). Viewers see two tabs: Photos and Help.

## Real backend

Set in `.env` or EAS secrets:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_HELP_PHONE=+13045550100      # behind "Call Chase" on the Help tab
```

Supabase Auth: enable Email, and change the "Magic Link" email template to show `{{ .Token }}` (a
6-digit code) instead of a link. The app calls `signInWithOtp` + `verifyOtp({type:'email'})`.
Deep links: scheme `hearth://join/<code>`, plus `https://hearth.family/join/<code>` (associated
domains / Android intent filter in `app.json`; the AASA/assetlinks files still have to be hosted).
Push: `app.json` has `extra.eas.projectId` (Expo project `@thefreighttrains-team/hearth`, linked Oct 17, 2026 with `npm run eas -- init`). Without it push is a no-op. Don't commit what `eas init` writes back: it expands the config and adds Android permissions (RECORD_AUDIO, storage); keep only `owner` and `extra.eas` (EXPO-2).

Contract tests against any PostgREST/Supabase stack:

```
HEARTH_API_URL=http://127.0.0.1:3001      # PostgREST root (set HEARTH_REST_ROOT=0 for a Supabase base URL)
HEARTH_ANON_KEY=...  HEARTH_SERVICE_KEY=... # service key only to mark test media ready without B2
HEARTH_USERS_JSON='{"alex":{"id":"…","jwt":"…"}, …}'
HEARTH_CAST='{"poster":"alex","viewerIn":"grandma_rivera","viewerOut":"grandma_chen","ratelimit":"blair","joiner":"…"}'  # default = backend seed
HEARTH_JOINER_EMAIL=...   # enables the 3 redeem tests (needs a signed-in non-member)
HEARTH_MEDIA=1            # enables the 4 sign-media tests (needs the edge function + B2)
npx jest src/api/contract
```

## Verified here (Oct 15, 2026)

- `npm test`: 17 suites, 179 passed, 1 skipped (the SupabaseApi block, skipped when env unset). 3 consecutive runs green, 12–15 s each. Red runs saved in `test-results/red-*.txt` before each implementation.
- `npm run typecheck`: clean.
- `npm run e2e:web`: core loop (Chase shares → Grandma Jo joins by invite link and sees it → Nana Ruth does not → heart → comment → full-screen + Close → Chase sees "1 person loves this", the comment, "Seen by 1 of 2" → delete). Runs the **real** picker/manipulator/encryption path in Chromium: the stored bytes are ciphertext; decrypted, the image is 2048×1365 with no EXIF though the fixture had GPS EXIF. 3/3 green.
- Contract vs the real backend (PostgREST + Postgres 16, migrations 0001+0002 + seed): 19/19 executed tests pass, 3 runs in a row. Not executed there: 3 redeem tests (seed has no signed-in non-member) and 4 sign-media tests (no edge function/B2 in the harness).
- `SupabaseApi` wire mapping (RPC names, `p_*` args, sign-media HTTP status → code, OTP calls) unit-tested with a mocked client.

## Not verified (needs a phone, a person, or a service)

- Any native build (iOS/Android), TestFlight/Play, real devices, Dynamic Type at max size on a device, 360 px Android with large font, dark mode on device.
- expo-image-manipulator, expo-file-system `File.bytes()`, expo-media-library save, and Uint8Array `fetch` PUT bodies **on device** (only the web implementations ran).
- Real email OTP (Supabase Auth), session persistence over 7 days (JOIN-5), deep links / universal links, push delivery and tap-to-open (NOTIFY-1/3), the `sign-media` edge function with B2.
- Swipe between photos (implemented with PanResponder; buttons are tested). Pinch zoom (SEE-4) and video playback are not built.
- Video posting is **off** (`VIDEO_POSTING_ENABLED=false`): iOS videos carry location metadata that can't be stripped on device without a transcoder, so claiming `exif_stripped: true` would be false. Duration check exists and is tested.
- Bigger text is saved on the phone only. The notification choice and the push token also go to the server (`set_notification_prefs`, `register_push_token`, AE-2).

## docs/eng/API.md gaps / ambiguities (simplest reading taken)

1. No re-sign call for existing media rows: if the app dies after `sign-media upload`, the queue deletes its own unpublished draft and restarts under a new `p_client_id` (never a visible duplicate; may leave purged drafts).
2. `publish_post` "all media must be ready": the backend also requires ≥1 media item (code 23514). FakeApi now matches.
3. `aes-256-gcm-chunked-v1` chunk layout is not specified anywhere; defined in `src/crypto/media.ts`. Any web viewer must use the same layout.
4. `create_invite` link carries a separate token, not the code; `redeem_invite`/`invite_preview` accept either.
5. No RPC for: who hearted a post (REPLY-1 "audience sees who hearted it" can't be shown; the app shows a count).
6. `get_comments` on an invisible post: backend raises P0002, FakeApi returns `[]`; both allowed by docs/eng/API.md.
7. 22023 wording: docs/eng/API.md says "This invite is too old or already used. Ask {inviter} for a new one."; BETA-JOIN-3 says "has expired"; UX-REVIEW bans "expired". The app uses docs/eng/API.md's sentence.
