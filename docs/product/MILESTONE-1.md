# Milestone 1: Chase uses Hearth end to end

Your morning doc. Do the steps in order and Claude handles the rest. The gate is in `docs/product/BETA-SPEC.md` ("Milestone gates").

## The $99 question, answered first

**You don't need the $99 Apple Developer membership for milestone 1** (Chase, Oct 17: milestone 1 runs in Expo Go; the push check moved to milestone 2).

- **Expo Go** (free, from the App Store) runs Hearth on your iPhone today: sign in, post, see photos, comment, heart, save to phone. It **cannot receive push notifications** from our server (Expo SDK 53+); push needs a "development build" of our own app.
- **A push-enabled iPhone build needs a paid Apple Developer account.** A free Apple ID can't sign the push permission.
- NOTIFY-3 (tap a push and the post opens) is now a milestone 2 check, so the $99 is off the M1 path. In milestone 1, notices come by email.

**Order:** run all of milestone 1 in Expo Go. Enroll in Apple ($99, approval can take 1–2 days) when milestone 2 starts.

## What you do (about 40 minutes plus Apple's wait)

| # | Step | Time | Unblocks |
|---|---|---|---|
| 1 | Cloud environment settings: allow `mcp.supabase.com`, `api.supabase.com`, `jqvgjfbhzbvfdhtnvgzr.supabase.co`, `exp.host`, `expo.dev`, `api.expo.dev`, `api.resend.com` | 5 min | Claude can deploy |
| 2 | Supabase → Account → Access Tokens: make one; save it as environment secret `SUPABASE_ACCESS_TOKEN`. That is the only Supabase secret the deploy needs: migrations and the cron run through the Management API. Family setup (step 5 below) goes through the same API. Only the hosted test runs (step 3) still use `psql`, so also save the connection string (Supabase → Connect → URI) as `SUPABASE_DB_URL` | 5 min | Migrations, function deploys, cron, family setup; with `SUPABASE_DB_URL`, hosted test runs |
| 3 | Make a free account at expo.dev; Access tokens → save as environment secret `EXPO_ACCESS_TOKEN` (`npm run eas -- …` in `app/` passes it to EAS CLI as `EXPO_TOKEN`) | 5 min | Push project ID, builds |
| 4 | Make a free account at resend.com and save its API key as a **Supabase** function secret, not here: Supabase → Edge Functions → Secrets → `RESEND_API_KEY` | 5 min | Email notices. For M1, Resend's test sender can mail only you, which is all M1 needs |
| 5 | Make a second email for a test account (e.g. `you+test@gmail.com`) | 1 min | The "second test account" in the gate |
| 6 | Print `MEDIA_KEK` twice and keep the copies in two places (Claude will show you how to generate it once; never in chat) | 5 min | Gate: key on paper ×2 |
| 7 | At milestone 2, not before: enroll at developer.apple.com ($99/yr) | 10 min + wait | Push on your iPhone (NOTIFY-3, now a milestone 2 check) |

Never paste a key, token or password into chat. Secrets go in the environment settings or in Supabase.

## What Claude does after steps 1–3

1. Confirms it can see the project through the Supabase connection (read-only).
2. Runs `bash backend/scripts/deploy.sh` (try `--dry-run` first): applies migrations 0001–0009 through the Management API (no demo data; ones already applied are skipped), sets the function secrets from `backend/supabase/functions/.env`, deploys `sign-media` and `notify`, and schedules `notify` every minute with its own cron secret (never the service_role key).
3. Runs the SQL suites against the hosted project 3× (gate line 1; needs `SUPABASE_DB_URL`). They wipe the database, so this happens only before any real photos; after that the project keeps its data.
4. Sets `app/.env.local` to the hosted project and gives you the Expo Go QR code.
5. After you sign in once: runs `bash backend/scripts/family-setup.sh --chase-email <yours> --space-name 'Our kids' --mom-email <hers>`. It needs only `SUPABASE_ACCESS_TOKEN` (no `SUPABASE_DB_URL`, no `psql`) and works as you, through the app's own rules. It creates your family in the groups shape: Everyone, Chase's side and Mom's side, each grandparent's house under its side, a **Test house** for account B (under no group), and the Charleston trip and Birthday at Gigi's events. It prints account B's invite code (Test house) and, for milestone 2, Mom's poster invite. Re-running prints fresh codes; once anyone else has joined it stops (then `family-setup-v2.sql`'s dry run is the tool). The app has no screens for creating a family or groups yet.

## Will it run in Expo Go? (checked Oct 16, without a phone)

| Path | Expo Go on iPhone | Notes |
|---|---|---|
| App bundles for iOS and Android | Yes | Both build (3.6 MB); packages match SDK 57 (upgraded Oct 18; current Expo Go only opens SDK 57) |
| Sign-in code, crypto, secure storage | Yes | Pure JS + Expo modules that ship in Expo Go |
| Pick, resize, strip location, upload | Yes | image-picker, image-manipulator, file-system |
| Save to phone | Yes | media-library (Android Expo Go is limited; recheck at milestone 5) |
| Push + tap to open | **No** | Needs our own build ($99 Apple) |
| `hearth.family/join` links open the app | **No** | Account B opens the invite in the web build (`/join/<code>`) instead |

## The demo (2 days, at least 10 posts)

Phone A = your iPhone (you). Account B = your test email, signed in on the web build or a second device.

| Day | Do | Expect | Criterion |
|---|---|---|---|
| 1 | Sign in with the 6-digit email code | In within a minute; no password | JOIN-2 |
| 1 | As account B, tap "I have an invite code" and type the Test house code (web build) | B joins and sees only Everyone and Test house posts | JOIN-1 |
| 1 | Post 3 photos to "Test house" in 3 taps or fewer | At the top of your Photos right away; B sees all 3 within a minute | SHARE-1 |
| 1 | As B: tap a photo, use Next/Back, then Close | Full screen; buttons work, not just swipes | SEE-3 |
| 1 | Post 1 photo to "Gammy's house" only | B never sees it | AUD-1 |
| 1 | Turn on airplane mode, post, turn it off | It sends on its own | SHARE-4 |
| 1 | As B: comment and heart | You get one notice (email in Expo Go; push after the $99 build) | REPLY-3, NOTIFY-4 |
| 1 | Save a photo to your phone; check its info in Photos | It's there at 2048 px with no location | M-09, SEE-5 |
| 2 | Keep posting until 10+ posts over 2 days | Sent = received, 0 lost; 0 crash reports | Gate |
| Milestone 2 | Real build ($99): lock the phone, have B post, tap the notice | Opens that post (cold and warm start) | NOTIFY-3 (not in the M1 gate) |

Log each line in the Test Log as you go, or tell Claude and it will.

**Checking "0 lost" (QA-3).** At the end of day 2, Claude (or you) runs this read-only check. It counts what you shared to Everyone and the Test house, then checks as account B, through the same access rules the app uses, that each post shows with every photo ready. It prints post ids and counts only, never captions or links. The "Gammy's house" post is left out on purpose, since B should never see it.

```
bash backend/scripts/sent-vs-received.sh --sender-email YOUR_EMAIL --receiver-email ACCOUNT_B_EMAIL --since 2026-10-19 --audience Everyone --audience 'Test house'
```

It ends with `RESULT: sent N, received N, lost 0` when nothing was lost, and lists each missing post otherwise.
