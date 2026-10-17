# Handoff: end of day 2 (Thu Oct 15, 2026, 10:30 pm)

## Oct 17, 3 am: groups, households, events, roles (spec only, staff-pm; replaces "one family hierarchy")
1. **Specced, not built:** `docs/product/SPEC-GROUPS.md` (renamed from SPEC-HIERARCHY.md), from your 2:47 am answer. Fixed shape: Everyone, set groups (your side, Danielle's side), households just under them; a person can be in several households and groups (Danielle's sister in Memaw's and Pawpaw's houses). Events combine any groups and households (Charleston trip, Gigi's birthday, custom groups). Only parents send to Everyone. Adding anyone asks "Share all past photos" or "Only new photos", no default. Criteria BETA-AUD-11 to 22, REPLY-7 to 13; AUD-9 retires.
2. **Migration order (also in the overnight plan):** 0010 timeline, 0011 family shape (removes the 0009 switch), `family-setup.sql` v2 re-seed, 0012 households-only. Next: privacy-security review, then qa-tdd failing tests. Before milestone 3; doesn't block M1 or M2.

## Oct 17, 2 am: first real deploy (Chase's ask, without function keys)
1. **Live on `jqvgjfbhzbvfdhtnvgzr`:** migrations 0001–0009 (the Management API accepts begin/commit, so the migration-transaction question is settled), both edge functions, `NOTIFY_CRON_SECRET`, and the `hearth-notify` and `hearth-purge-client-errors` cron jobs.
2. **Failed, step 5/5 (sign-in email: 6-digit code):** `PATCH config/auth` returned 403 "Missing required permission(s): project_admin_write". The access token is scoped and can't change project settings. Until this is fixed, sign-in emails send Supabase's default link, not a code.
3. **Action items for Chase:**
   - [ ] **Sign-in code email.** Either paste the templates in the Supabase dashboard (Authentication → email templates: Magic Link and Confirm signup, subject `Your Hearth code: {{ .Token }}`, bodies from `backend/supabase/templates/`; code length 6, expiry 3600 s), or make a token with project admin write, replace the `SUPABASE_ACCESS_TOKEN` secret, and rerun `deploy.sh` (applied steps are skipped).
   - [ ] **Function keys.** Fill the values in `backend/supabase/functions/.env.example` (Backblaze B2, `MEDIA_KEK`, `ALLOWED_ORIGINS`, Resend, `APP_LINK_BASE`, Expo). Add them as Hearth environment secrets so a session can write `.env` and rerun the deploy. Until then, photos (sign-media) and notifications (notify) are deployed but can't work.
   - [ ] **Cleanup after the keys are in:** delete the placeholder Supabase secret `HEARTH_KEYS_PENDING`. It was set only because `supabase secrets set --env-file` rejects an empty file.
   - [ ] **Groups spec, 3 one-word answers** (`docs/product/SPEC-GROUPS.md` §9): event replies Event or Household (rec. Event); a relative's post goes to Groups or Everyone (rec. Groups); who sends to Everyone and makes events, Parents or Owner (rec. Parents).
   - [ ] **Family list for the re-seed** (spec §2): Danielle's sister's name; put her in both Memaw's and Pawpaw and Granny's houses (rec. yes); who was at Gigi's birthday; any sibling of yours to place in both your parents' houses.

## Oct 17: deploy review fixes (DEPLOY-2, DEPLOY-3)
1. **Built, test-first (`backend/tests/deploy/deploy_test.sh`, now 20 checks):** function deploys pass `--use-api`, so Supabase bundles them and no Docker is needed (DEPLOY-2). A migration the API rejects now prints its file name and the Postgres error, with the cron secret redacted; before, it said only "failed" (DEPLOY-3).
2. **Doc:** `docs/product/MILESTONE-1.md` step 2 now says the hosted test runs and `family-setup.sql` still need `SUPABASE_DB_URL`.
3. **Not verified live:** the Management API has not yet run a migration transaction on the hosted project; the first real deploy will show it.

## Oct 16 afternoon: deploy needs only the access token
1. **Built, test-first (DEPLOY-1, `backend/tests/deploy/deploy_test.sh`, 16 checks, stubbed, in CI and `test-all.sh`):** `backend/scripts/deploy.sh` now applies migrations and the notify cron through the Supabase Management API (`POST /v1/projects/{ref}/database/query`) instead of `supabase db push` and `psql`. Each migration runs in one transaction and is recorded in `supabase_migrations.schema_migrations` (the CLI's own table), so reruns skip what's applied. The `link` step is gone; steps are now 1/5–5/5.
2. **Needs you:** only `SUPABASE_ACCESS_TOKEN`. `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` are no longer needed to deploy. The hosted SQL suites and `family-setup.sql` still use `psql`, so they will need a connection string or the same API route later.

## Oct 16: who reads replies (Chase's call), and the real family
1. **Family:** `docs/product/PERSONAS.md` is now your real family (Gammy Barbara … Grandma Phyllis, Gigi Sarah, Bebar Fred with the smart frame). Docs live in `docs/product` and `docs/eng`; `docs/product/STORY.md` is the story agents read.
2. **Built (migration 0009, AUD-8/9/10):** by default only the parents (and the post's author) read a relative's comment or heart; counts leave hidden ones out; parents' replies reach everyone. A group can turn on "members see each other's replies". The owner can open replies to everyone (Me screen). The comment box says who will read it. privacy-security fixes: raw counters hidden, no profile leak through replies, no setting leak.
3. **Tests (3 green runs):** SQL 116 + 169 + 48 + 5 + 37 reply; Deno 26; Jest 245 + 1 skipped; typecheck clean; web e2e 1; app contract vs real PostgREST 85 passed (9 skipped).
4. **Next (your direction):** nested groups (a group inside a group, e.g. person → household → side → whole family), set up by a guided flow or by select/drag. This changes who sees posts, so it gets its own spec and review.
5. **Your calls:** should adults (Danielle) also flip the group switch, or only you? A viewer who posts (off by default) has their replies treated like a parent's on their own post.

## Oct 16 morning: sign-in and sign-up for every persona (Chase's ask)
1. **Day-1 blocker fixed:** Supabase's default sign-in email sends a link, not a code. New templates show the 6-number code big and in the subject, have no links, and warn "Never read this code to anyone who calls or texts you". `deploy.sh` step 5 pushes them to the hosted project.
2. **Built, test-first, grandparent-ux reviewed:** pasted codes with spaces or dashes work; "I have an invite code" on the first screen and on "Almost there" (BETA-JOIN-8), with the code on your invite card and in the text ("Hi, it's Chase… call me and I'll help. Your code is …"); a Junk/Spam hint and a 60 s wait before a new code; "Did you mean june@yahoo.com?"; a clear wrong-email message, while the server still gives no oracle (JOIN-3).
3. **Not built (staff-pm call):** an in-app "Start a family" (deferred to milestone 7 so Hearth stays invite-only); you still use `family-setup.sql`. Couples sharing one email work as one account; that needs a line in the guide, not code.
4. **Tests (3 green runs):** SQL 116 + 169 + 48 + 5; Deno 26; Jest 237 + 1 skipped; typecheck clean; web e2e 1.
5. **Next:** deploy (MILESTONE-1 steps 1–4), then the Expo Go demo. The first real sign-in checks that the email template took.

## Overnight Oct 16, part 4 (staff-pm build queue, unattended)
1. **Built, test-first, reviewed:** real names (0007; posters set theirs once, invites carry "Grandma June", notices use the full chosen name; privacy-security fixes: no bypass, header-safe, no impersonation). `rename_circle` RPC (0008; duplicates were 23505). No dead `hearth.family` link in emails until the site exists. SHARE-4 kill-at-every-step coverage. On-phone notice timing log + Me-screen report (AE-10, cleared on sign-out). "Take me off Hearth" (JOIN-7) for non-owners. grandparent-ux: the comment box names who can read it; no nameless emails.
2. **Tests (3 green runs):** SQL 116 + 169 + 48 + 5; Deno 23; Jest 223 + 1 skipped; typecheck clean; web e2e 1. **App contract vs real PostgREST: 79 passed** (local harness; 9 skipped need a joiner email or B2). One earlier run had 1 app test fail and ~35 reruns couldn't reproduce it; failure names are captured from now on.
3. **Your calls (logged in docs/product/ANCHORS.md):** who sees comments; Seen by; what happens when the space owner deletes their account.
4. **Skipped:** demo rehearsal in a browser against the local stack (needs GoTrue for sign-in); do it on staging.
5. **Next:** deploy (MILESTONE-1 steps 1–4), then the family setup script and the Expo Go demo.

## Overnight Oct 16, part 3 (staff-pm product review)
1. **Found:** comments are readable by everyone a post was shared with, but the app said "Sent. Chase will see it." Fixed the words (BETA-REPLY-6). *Who should see comments* (story: Grandma A without Grandpa B) is logged in docs/product/ANCHORS.md for Chase; staff-pm leans "the poster plus people who share a group with the commenter".
2. **Built:** `backend/scripts/family-setup.sql` (space, starter groups, test-viewer invite, Danielle's poster invite; run as Chase through RPCs; 5 tests). `backend/scripts/deploy.sh` (one-command deploy; dry-run only). `docs/product/MILESTONE-1.md` (Chase's steps, the $99 answer, Expo Go yes/no, 2-day demo).
3. **Tests, 3 green runs:** SQL 116 + 141 + 48 + 5 setup; Deno 19; Jest 196 + 1 skipped; typecheck clean; web e2e 1 ×3.
4. **Reflection point armed** (docs/product/REMAINING.md): no more backend/test polish until a deploy or a device run.
5. **Resume at 4 am ET:** a scheduled check-in restarts this session; next is whatever doesn't need access (staff-pm's list), then deploy once Chase finishes MILESTONE-1 steps 1–4.

## Overnight Oct 16–17, part 2 (after reading ANCHORS + the story doc)
1. **staff-pm:** BETA-SPEC and REMAINING now follow your milestones. Every criterion maps to a milestone and traces to a story problem or anchor; new NOTIFY-7 and AUD-7; ring dates dropped. Flagged: NOTIFY-6 vs A2, JOIN-7 (Apple rule only), AUD-4 (persona-only), SHARE-6 video (still deferred).
2. **Built, test first:** app saves push token + notification choice to the server; emails arrive when Help promises (6 pm / Sunday 8 am Eastern); notices say "From Chase on Hearth" (NOTIFY-7); posters can no longer read *when* each person last looked (AUD-7; "Seen by" unchanged); removed authors can't edit old captions (S12, migration 0005); our own error reports with fixed fields only, no SDKs (OPS-1, migration 0006).
3. **Tests, 3 green runs:** SQL 116 RLS + 141 API + 48 NOTIFY; Deno 19; Jest 195 + 1 skipped; typecheck clean; web e2e 1. CI on main was green before this batch.
4. **Needs you:** same as part 1 (network allow-list + `SUPABASE_ACCESS_TOKEN`, then keys). Decide NOTIFY-6 / "Seen by" before milestone 4.
5. **Next:** deploy to staging once access exists; check whether Expo Go can run milestone 1 without the $99 Apple account; tracker hygiene (close S12).

## Overnight Oct 16: notification sender (AE-2)
1. **Built:** migration 0003 adds an outbox filled on publish/comment/heart and a batching claim (at most 1 push per 10 min and 1 email per day; access is re-checked at send time). New RPCs `register_push_token` and `set_notification_prefs` are in docs/eng/API.md. The `notify` edge function sends through Expo Push and Resend with the first name and post id only, retries failed sends, and drops dead phone tokens.
2. **Tests (one full run):** SQL 110 RLS + 130 API + 46 NOTIFY green; Deno 17 (5 sign-media + 12 notify); Jest 179 passed + 1 skipped; typecheck clean; web e2e 1 passed (the day-2 note said 3/3, worth a look). Nothing is deployed.
3. **Needs you, access:** in the environment's network settings, allow `mcp.supabase.com`, `api.supabase.com` and `jqvgjfbhzbvfdhtnvgzr.supabase.co`, and add `SUPABASE_ACCESS_TOKEN` as an environment secret. Then Claude can run `bash backend/scripts/deploy.sh` (migrations and cron go through the Management API).
4. **Needs you, keys:** put the values listed in `backend/supabase/functions/.env.example` into Supabase secrets, the values in `app/.env.example` into `app/.env.local`, and add GitHub secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. The service_role key stays inside Supabase only.
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
5. **Missing API endpoints:** push-token save, notification prefs, profile name, who hearted, re-signing an upload after a crash (see `app/README.md`, "docs/eng/API.md gaps").
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
- Decisions (picks in `docs/product/CORE-FEATURES.md`): an Android test phone (~$100), upgrading the Claude plan, and the 5 product questions.

## Next session, in order
- **New agent (Oct 16): `marketing`.** Logs and develops Chase's positioning ideas in `docs/product/MARKETING.md`. The chief of staff (main session) routes by the roster in `CLAUDE.md`; `scripts/check-agents.sh` keeps it in sync.
0. **Read `docs/product/ANCHORS.md` (added Oct 16, midnight).** Chase reframed Hearth as a proof of concept with new milestones. staff-pm: reconcile `docs/product/BETA-SPEC.md`, `docs/product/REMAINING.md` and the ring gates to those milestones (Ring 0 ≈ Chase only, then wife, then 1 savvy relative). Raise the A2 "Seen by" conflict as a decision for Chase before milestone 4. Don't delete built features.
1. Confirm the repo is pushed and CI is running. Fix CI until it's green; that closes S16.
2. **staff-pm:** daily triage. Update the Test Log.
3. **app-engineer + qa-tdd, test-first:** the notification sender (Expo push + Resend email, batched, with no image or caption in the payload) plus the missing RPCs.
4. **Infra:** staging Supabase deploy, Resend sending domain, an invite-link/privacy-policy page.
5. First Android internal build (EAS), then iPhone TestFlight once Apple approves.

## Links
- **Plans (claude.ai docs):** Hearth Beta Plan (with a Personas tab), Hearth Funding Plan.
- **Published pages:** Hearth Family Photos prototype (claude.ai/artifact/SbUX3TQP2crBZ5o68Kho2a), Hearth Test Log (claude.ai/artifact/XnfnBsuPL7ayedPHBpvctD).
- **Project docs:** `claude/hearth-*.md` and `claude/agents/*.md` in the "Family photo sharing" Project.
