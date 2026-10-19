# Accounts and names

Every outside account Hearth uses, which login it's under, and where the name "Hearth" is baked in. Use it for a rename, a handover, or moving off Chase's personal email. **No keys, tokens or passwords here, ever**; they live in the environment secrets or the service itself.

**Rule for Claude:** when Chase sets up a new account or a new name, add a row in the same session.

| Service | What it's for | Login | Where "Hearth" is | Rename cost |
|---|---|---|---|---|
| Claude (claude.ai) | Project "Hearth Photo Sharing", cloud environment "Hearth" (holds `SUPABASE_ACCESS_TOKEN`, `EXPO_ACCESS_TOKEN`), published pages | Chase's personal email | Project and environment names, page titles | Easy (rename in settings) |
| GitHub | Code, CI | `holroydchase-afk` | Repo `holroydchase-afk/Hearth` | Easy (GitHub redirects old links) |
| Expo | App builds and push | Chase's personal email; owner `thefreighttrains-team` | Project slug `hearth`, `app/app.json` name and scheme | Easy until the first store build |
| Supabase | Database, sign-in, functions | Chase's personal email | Project `jqvgjfbhzbvfdhtnvgzr` (project name in the dashboard), function and cron names `hearth-*` | Easy (display name only) |
| Resend | Sign-in code emails (custom SMTP), notices | Chase's personal email (set up Oct 17) | Sender name "Hearth"; sender email is `onboarding@resend.dev` until a domain is verified | Easy now; tied to the domain later |
| Backblaze B2 | Photo storage (US East, `s3.us-east-005.backblazeb2.com`) | Chase's personal email (set up Oct 18) | None: bucket `family-photos-testing-kq7m` (milestone 1 test data, private, encrypted) | Easy (make a new bucket) |
| Apple Developer ($99) | iPhone builds with push, TestFlight | Not set up yet | App ID `family.hearth.app` | **Permanent once on TestFlight** |
| Google Play ($25) | Android builds | Not set up yet | App ID `family.hearth.app` | **Permanent once uploaded** |
| Domain | Invite links, email sender, app links | Not bought yet (planned `hearth.family`) | Invite links, `app/app.json` link setup, email sender | **Hard once relatives have links** |

## Decide the name before

**Name final:** no

While this says no, `npm run eas -- build` and `submit` refuse (they would lock the app ID). Only Chase changes it to yes. **Rule for Claude:** before any step below, or anything else that makes the name hard to change, stop and warn Chase first, even if he asked for the step.

1. Buying the domain.
2. The first Apple or Google build.
3. Telling relatives the name.

Before those, a full rename of the app's words, emails, notices and docs is about an afternoon of work.
