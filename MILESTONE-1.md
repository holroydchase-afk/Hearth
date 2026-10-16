# Milestone 1: Chase uses Hearth end to end

Your morning doc. Do the steps in order and Claude handles the rest. The gate is in `BETA-SPEC.md` ("Milestone gates").

## The $99 question, answered first

**You need the $99 Apple Developer membership to pass milestone 1, but not to start it.**

- **Expo Go** (free, from the App Store) runs Hearth on your iPhone today: sign in, post, see photos, comment, heart, save to phone. It **cannot receive push notifications** from our server (Expo SDK 53+); push needs a "development build" of our own app.
- **A push-enabled iPhone build needs a paid Apple Developer account.** A free Apple ID can't sign the push permission.
- The M1 gate includes NOTIFY-3 (tap a push and the post opens), so the $99 is on the M1 path. Email notices work without it.

**Suggested order:** start in Expo Go now (steps 1–4). Enroll in Apple ($99, approval can take 1–2 days) the day the Expo Go run works. Then switch to the real build for push.

## What you do (about 40 minutes plus Apple's wait)

| # | Step | Time | Unblocks |
|---|---|---|---|
| 1 | Cloud environment settings: allow `mcp.supabase.com`, `api.supabase.com`, `jqvgjfbhzbvfdhtnvgzr.supabase.co`, `exp.host`, `expo.dev`, `api.resend.com` | 5 min | Claude can deploy |
| 2 | Supabase → Account → Access Tokens: make one; save it as environment secret `SUPABASE_ACCESS_TOKEN`. Also save the database password as `SUPABASE_DB_PASSWORD` | 5 min | `db push`, function deploys, hosted test runs |
| 3 | Make a free account at expo.dev; Access tokens → save as `EXPO_TOKEN` | 5 min | Push project ID, builds |
| 4 | Make a free account at resend.com and save its API key as a **Supabase** function secret, not here: Supabase → Edge Functions → Secrets → `RESEND_API_KEY` | 5 min | Email notices. For M1, Resend's test sender can mail only you, which is all M1 needs |
| 5 | Make a second email for a test account (e.g. `you+test@gmail.com`) | 1 min | The "second test account" in the gate |
| 6 | Print `MEDIA_KEK` twice and keep the copies in two places (Claude will show you how to generate it once; never in chat) | 5 min | Gate: key on paper ×2 |
| 7 | Later, after the Expo Go run works: enroll at developer.apple.com ($99/yr) | 10 min + wait | Push on your iPhone (NOTIFY-3) |

Never paste a key, token or password into chat. Secrets go in the environment settings or in Supabase.

## What Claude does after steps 1–3

1. Confirms it can see the project through the Supabase connection (read-only).
2. Deploys with the CLI: `supabase link`, `supabase db push` (migrations 0001–0006, no demo data), `supabase functions deploy sign-media notify`, and the secrets from `backend/supabase/functions/.env.example`.
3. Schedules `notify` every minute.
4. Runs the SQL suites against the hosted project 3× (gate line 1).
5. Sets `app/.env.local` to the hosted project and gives you the Expo Go QR code.

## The demo (2 days, at least 10 posts)

Phone A = your iPhone (you). Account B = your test email, signed in on the web build or a second device.

| Day | Do | Expect | Criterion |
|---|---|---|---|
| 1 | Sign in with the 6-digit email code | In within a minute; no password | JOIN-2 |
| 1 | Make groups "Just me (test)" and "Test viewer"; invite account B to "Test viewer" | B joins from the link | JOIN-1 |
| 1 | Post 3 photos to "Test viewer" in 3 taps or fewer | At the top of your Photos right away; B sees all 3 within a minute | SHARE-1 |
| 1 | As B: tap a photo, use Next/Back, then Close | Full screen; buttons work, not just swipes | SEE-3 |
| 1 | Post 1 photo to "Just me (test)" | B never sees it | AUD-1 |
| 1 | Turn on airplane mode, post, turn it off | It sends on its own | SHARE-4 |
| 1 | As B: comment and heart | You get one notice (email in Expo Go; push after the $99 build) | REPLY-3, NOTIFY-4 |
| 1 | Save a photo to your phone; check its info in Photos | It's there at 2048 px with no location | M-09, SEE-5 |
| 2 | Keep posting until 10+ posts over 2 days | Sent = received, 0 lost; 0 crash reports | Gate |
| After $99 | Real build: lock the phone, have B post, tap the notice | Opens that post (cold and warm start) | NOTIFY-3 |

Log each line in the Test Log as you go, or tell Claude and it will.
