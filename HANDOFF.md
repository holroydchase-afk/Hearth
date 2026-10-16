# Handoff: end of day 2 (Thu Oct 15, 2026, 10:30 pm)

## Overnight Oct 16: notification sender (AE-2)
1. **Built:** migration 0003 adds an outbox filled on publish/comment/heart and a batching claim (at most 1 push per 10 min and 1 email per day; access is re-checked at send time). New RPCs `register_push_token` and `set_notification_prefs` are in API.md. The `notify` edge function sends through Expo Push and Resend with the first name and post id only, retries failed sends, and drops dead phone tokens.
2. **Tests (one full run):** SQL 110 RLS + 130 API + 46 NOTIFY green; Deno 17 (5 sign-media + 12 notify); Jest 179 passed + 1 skipped; typecheck clean; web e2e 1 passed (the day-2 note said 3/3, worth a look). Nothing is deployed.
3. **Needs you, access:** in the environment's network settings, allow `mcp.supabase.com`, `api.supabase.com` and `jqvgjfbhzbvfdhtnvgzr.supabase.co`, and add `SUPABASE_ACCESS_TOKEN` as an environment secret. Then Claude can run `supabase db push` and `supabase functions deploy sign-media notify`.
4. **Needs you, keys:** put the values listed in `backend/supabase/functions/.env.example` into Supabase secrets, the values in `app/.env.example` into `app/.env.local`, and add GitHub secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`. The service_role key stays inside Supabase only.
5. **Open:** the 1-minute cron for `notify` (after deploy); the app doesn't call the two new RPCs yet (contract test first); email links go to `hearth.family/p/<id>`, which needs the website plus an Android `/p` link filter. **PM call:** with "3 posts in 10 min", the first post buzzes right away (to keep NOTIFY-1 within 60 s) and the rest go out as 1 notice.

## Verified state (rerun independently at 1:30 pm)
- **Backend:** 110 RLS + 130 API SQL tests green. Deno sign-media tests 5/5. Integration smoke test 4/4 over real PostgREST. `get_feed` p95 is under 2 ms at 1M posts.
- **App:** typecheck clean; Jest 179 passed + 1 skipped (live-API block); web e2e 3/3. Contract tests against real PostgREST: 19/19 of the runnable ones.
- **Prototype + Test Log:** 32/32 prototype cases green. The Test Log page is published; its data covers runs through day 2 morning only.

## Not done
1. **GitHub: done (Oct 15, 10:45 pm).** Code lives at github.com/holroydchase-afk/Hearth, and Claude can push to it. Start every session at claude.ai/code with Hearth selected. No more zips or bundles.
2. **CI (`.github/workflows/ci.yml`)** runs on every push. Getting it green closes S16: the backend tests on a real Supabase stack. Check the Actions tab for the latest result.
3. **Notifications aren't built**, push or email. This is the biggest gap. NOTIFY-1/2/3 and REPLY-3 depend on it.
4. **Nothing has run on a real phone yet.** Unverified: resize, save to phone, OTP email, deep links, push.
5. **Missing API endpoints:** push-token save, notification prefs, profile name, who hearted, re-signing an upload after a crash (see `app/README.md`, "API.md gaps").
6. **The Test Log isn't updated.**
   - S9 and S10 still show open there.
   - New app suites and runs aren't recorded.
   - Run `tracker/build_seed.py` and push it to the Test Log artifact (claude.ai/artifact/XnfnBsuPL7ayedPHBpvctD).
7. **Video is off for the beta.** iOS location metadata can't be stripped without a transcoder.

## Chase's to-dos (blocking)
- Confirm Apple Developer enrollment.
- Create the accounts:
  - Supabase: a staging and a prod project, both East US
  - Backblaze B2: US East, which can't be changed later
  - Expo, Resend, and the Google Play Console
- Run the name check, then buy the domain.
- Phone survey by Oct 20: each person's phone model, OS version, and the email they actually check.
- Decisions (picks in `CORE-FEATURES.md`): an Android test phone (~$100), upgrading the Claude plan, and the 5 product questions.

## Next session, in order
0. **Read `ANCHORS.md` (added Oct 16, midnight).** Chase reframed Hearth as a proof of concept with new milestones. staff-pm: reconcile `BETA-SPEC.md`, `REMAINING.md` and the ring gates to those milestones (Ring 0 ≈ Chase only, then wife, then 1 savvy relative). Raise the A2 "Seen by" conflict as a decision for Chase before milestone 4. Don't delete built features.
1. Confirm the repo is pushed and CI is running. Fix CI until it's green; that closes S16.
2. **staff-pm:** daily triage. Update the Test Log.
3. **app-engineer + qa-tdd, test-first:** the notification sender (Expo push + Resend email, batched, with no image or caption in the payload) plus the missing RPCs.
4. **Infra:** staging Supabase deploy, Resend sending domain, an invite-link/privacy-policy page.
5. First Android internal build (EAS), then iPhone TestFlight once Apple approves.

## Links
- **Plans (claude.ai docs):** Hearth Beta Plan (with a Personas tab), Hearth Funding Plan.
- **Published pages:** Hearth Family Photos prototype (claude.ai/artifact/SbUX3TQP2crBZ5o68Kho2a), Hearth Test Log (claude.ai/artifact/XnfnBsuPL7ayedPHBpvctD).
- **Project docs:** `claude/hearth-*.md` and `claude/agents/*.md` in the "Family photo sharing" Project.
