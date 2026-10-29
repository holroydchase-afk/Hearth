# Handoff

## Oct 26: Photos screen UI review and fixes (branch claude/project-thread-vhp0f2, PR)
- ux-reviewer on Chase's phone screenshot plus the web demo at 390 and 1280: 5/10 → 6/10. Review: `docs/reviews/2026-10-26-photos-screen.md`.
- Built test-first: UI-26 no "Check for new photos" button (auto-refresh on open and return, plus pull-down), "By date" with the system sort icon beside Messages in one row (DEC-41); UI-27 avatar letter skips "The".
- The gear in Chase's screenshot is Expo Go's developer button, not ours.
- **Parked:** filter Photos by group (Chase, Oct 26; not scheduled).
- Oct 29: brought up to date with main after release M1.1; decision renumbered DEC-39 → DEC-41 (DEC-39 is captions, DEC-40 is PR #69).
- Next: publish to Expo Go after merge (Chase's word). Next gap: tall cards from the always-open reply box (DEC-30 keeps it).

## Oct 28, release M1.1 phase 7: reusable blocks (branch claude/project-thread-kzt7by-rel6, draft PR, stacked on phase 6)
- **Lesson written:** `docs/eng/LESSONS.md` Oct 28 (every proof runs in CI; a flaky test is a finding; heavy RPCs plan with JIT off).
- **Give-back (INTAKE only, per STACK.md: no extraction until a second product needs it):** `docs/portfolio/INTAKE-2026-10-28-reusable-blocks.md` (also in the project files) offers Product Studio the jest-expo fetch snippet, the Supabase JIT rule and the CI rule for studio-agents and pm-tools.
- **Next exact step:** Chase merges #63-#68 in order, says "deploy 0018 and 0019", then pastes the two Oct 28 INTAKEs to Product Studio.

## Oct 28, release M1.1 phase 6: demo (branch claude/project-thread-kzt7by-rel5, draft PR, stacked on phase 5)
- **Live today (verified 08:00 UTC):** chaseholroyd.com/demo/hearth/ answers, passes the showcase sweep at phone and laptop width with no console errors (the not-found page's 404 is expected), first card in about 2.1 s. It's the older build: two-line bar, no titles.
- **New build:** `app/dist-demo-site` from this branch passes `npm run e2e:site` 8/8 on a Pages-like host; first card in about 1.2 s; titles and the new bar and laptop frame show.
- **Portfolio / public presence:** `docs/portfolio/INTAKE-2026-10-28-demo-refresh.md` asks Product Studio to re-copy the demo after Chase merges #63-#66 (a ready tarball is in the project files, `portfolio/hearth-demo-site-2026-10-28.tgz`) and to refresh the page's test counts (660+ app, 960+ database).
- **Next exact step:** Chase merges #63-#66, then pastes the INTAKE to Product Studio.

## Oct 28, release M1.1 phase 5: post titles (branch claude/project-thread-kzt7by-rel4, draft PR, stacked on phase 4)
- **Why this enhancement:** of everything waiting, it's the one a recruiter sees in the first ten seconds of the demo: cards read like real posts ("Mia's 5th birthday", then the caption, then photos). Chase approved the spec's picks (DEC-39), so it's the highest-value item that needs no new call from him.
- **Built, test-first (CAP-1..5, 10..12):** an optional Title box (80 characters) on Share; the card shows the title as a heading above the caption; a long caption folds to 4 lines with Read more / Show less; By date shows titles too; two demo moments carry titles. Migration **0019** adds `posts.title`, `create_post(p_title)` and the title on `get_feed` / `get_timeline` (not deployed: needs Chase's word, after 0018). The log check now treats `title` like `caption`.
- **Left:** change the words after posting (CAP-6..8), a bulk title (CAP-9), and a grandparent-ux pass on the words.
- **Tests (3 green runs):** app Jest 664 + 1 skipped, typecheck, web e2e 4, demo e2e 5, real-API contract 65/65, backend SQL all suites (new `captions_test.sql`), PRIV-2 12/12.
- **Portfolio / public presence:** demo cards now show titles once the demo is rebuilt (phase 6).
- **Next exact step:** Chase says "merge" (after phases 2-4), then "deploy 0018 and 0019" and an app update.

## Oct 28, release M1.1 phase 4: harden (branch claude/project-thread-kzt7by-rel3, draft PR, stacked on phase 3)
- **Review:** privacy-security (with the qa-tdd lens) read everything since Oct 24 (`docs/reviews/2026-10-28-harden.md`).
- **Fixed, test-first:** HARD-12 (P1): members could write reactions straight to the table, skipping the three-emoji list and "replies off". Migration **0018** closes it (not deployed: needs Chase's word). HARD-13: sign out now deletes the cached feed (captions, names, reactions). HARD-17 (P1, found by running the real-API contract 3×): Postgres JIT-compiled the feed query once a family had a few dozen posts, 1.5-2 s per Photos page instead of 20-50 ms; 0018 turns JIT off for it.
- **Open tickets:** HARD-14 (B11), HARD-15 (T11), HARD-16 (B12), all P2/P3. Captions' sketched migration is now 0019.
- **Tests (3 green runs):** backend SQL all suites, app Jest, real-API contract, typecheck, PRIV-2 log check.
- **Next exact step:** Chase says "merge" (after phases 2 and 3), then "deploy 0018" (it speeds up Photos and closes the reactions hole).

## Oct 28, release M1.1 phase 3: UI to 8/10 (branch claude/project-thread-kzt7by-rel2, draft PR, stacked on phase 2)
- **Score:** the studio ux-reviewer scored the public demo 5/10 before and 8/10 after (`docs/reviews/2026-10-28-ui-8.md`).
- **Built, test-first (UI-1..5):** a one-line demo bar with one row of matching chips; a centred laptop frame with proof points and a "Read the case study" link; gray Open buttons in Messages; the demo's Me names Sam instead of a placeholder email; the showcase sweep waits for each screen. Persona check all Green (`docs/product/decisions/2026-10-28-ui-polish.md`).
- **Tests (3 green runs):** app 654 + 1 skipped, typecheck clean, demo e2e 9, showcase sweep 48 shots with a clean console.
- **Portfolio / public presence:** the demo's bar and laptop frame change; the live site still serves the Oct 22 build until phase 6's INTAKE re-hosts it.
- **Next exact step:** Chase says "merge" (after phase 2's PR). The release continues with phase 4 (harden).

## Oct 28, release M1.1 phase 2: works for real (branch claude/project-thread-kzt7by-rel1, draft PR)
- **Found (REAL-1, P0 for testing):** since the SDK 58 move, jest-expo swaps the global fetch for Expo's native-only one. So `scripts/contract-real.sh` (the app's HearthApi contract against the real Postgres + PostgREST API) got no answers at all: 60 of 63 checks failed with UNKNOWN. CI never ran it, so nobody saw it. The app itself was fine; the proof that it works against the real backend was gone.
- **Fixed, test-first:** `app/jest.environment.js` keeps Node's network fetch, and the harness uses it (`netFetch.test.ts`, REAL-1). Two contract tests assumed a fresh database per test (T10 now makes its own group; TIME-2 allows more than one page), and the harness now knows who each JWT client is. All 63 real-API checks pass, and so do all backend SQL suites (local Postgres 16). A new CI job, "App contract on the real API (PostgREST)", runs this on every PR.
- **Tests (3 green runs):** app 648 + 1 skipped, typecheck clean, web e2e 4, real-API contract 63/63, backend SQL all suites.
- **Next exact step:** Chase says "merge". The release continues with phase 3 (UI to 8/10) on a stacked branch.

## Oct 28: Hearth moved onto the generic studio agents (TRACKER R16, branch claude/project-thread-0hdj2z, PR)
- **Why:** Chase, Oct 28: "go over the generic agent updates". This pulls R16 forward from after the beta. It's process only, with no app change.
- **Done:** synced from studio-agents main (2f27166): staff-pm, qa-tdd, engineer (replaces app-engineer), privacy-security, positioning (replaces marketing), ux-reviewer and architect (new). grandparent-ux stays Hearth's own. funding-analyst is archived in `docs/archive/agents/`. On Chase's ask ("the strongest agents, don't lose anything, combine and build"), each agent is the studio text plus a built-in "Hearth notes" section generated from `docs/eng/AGENT-NOTES.md` by the new `scripts/sync-agents.sh` (AGENTS-1..3, `scripts/tests/sync_agents_test.sh`). `check-agents.sh` now fails on drift. All the old Hearth agents are kept whole in `docs/archive/agents/`. The CLAUDE.md roster and the live references are updated.
- **Give-back:** an INTAKE asks Product Studio to add the persona check and the crypto bar to the generic staff-pm and privacy-security (`/mnt/project-files/portfolio/INTAKE-2026-10-28-agent-giveback.md`).
- **Next exact step:** Chase says "merge".

## Oct 27: plan for post titles and captions (branch claude/project-thread-095lsp, PR)
- **Why:** Chase, Oct 27: "the poster should be able to have a social media type post describing the set of pictures. Similar to Instagram and Facebook." The Polish Freeze is on, so this is a plan, not a build.
- **Planned:** an optional 80-character title plus today's caption for the whole set, folded with Read more, changeable by the sender from More (no notice, comments kept), one title for a bulk send; no per-photo captions, mentions, hashtags, links or AI help (AI-FEATURES R6). Words stay out of every notice and log. Migration sketched (now 0019), size M.
- **Next exact step:** Oct 28, Chase took all four picks (DEC-39) and said merge. Chase lifted all freezes Oct 28; the Oct 28 2:15am release run decides whether and when captions get built (TRACKER R21).

## Oct 27: Supabase starter pieces for the studio (branch claude/project-thread-0hdj2z, PR)
- **Why:** Chase, Oct 27, asked to work through the reuse list one item at a time ("Let's go"). That's new scope under the Polish Freeze, on his explicit word. This is Hearth's half of pm-tools `docs/intakes/hearth-supabase-starter.md` (Crew Clock needs Supabase next).
- **Built, test-first:** `docs/supabase-starter/` holds invite codes on the studio template's orgs (STARTER-INV-1..7, 25 checks) and token-only `deploy.sh` and `smoke-check.sh` with no Hearth defaults (STARTER-DEPLOY-1..5, STARTER-SMOKE-1..2, 17 checks). There's a new CI job `supabase-starter` (studio-agents pinned at 5a90300, PR #11). Hearth's own backend is unchanged.
- **Also from the list:** the other gaps (ACCOUNTS template, architecture skeleton, check-agents and check-logs scripts) went to Product Studio as an INTAKE. The photo privacy library and the other Expo-only pieces are skipped: STACK.md says to extract only once a second product needs something.
- **Next exact step:** Chase says "merge". Then Product Studio copies the four files into studio-agents `templates/supabase/` (see the folder's README).

## Oct 26: SDK 58 (branch claude/project-thread-d16zyx, PR)
- **Why:** Chase's Expo Go moved to SDK 58, so the SDK 57 reactions update wouldn't open ("No launchable updates"). The Expo Go check missed it because Expo's `expoGoSdkVersion` lagged (LESSONS.md, Oct 26).
- **Done:** expo 58.0.19, React Native 0.88, jest-expo 58, jest 30; `app/.npmrc` keeps legacy peer deps until the tests move to @testing-library/react-native 14. Check fixed (EXPO-5). 0017 and the Oct 25 reactions are already on the server.
- **Next exact step:** Chase says "merge, publish"; then he opens the standing Expo Go link.

## Oct 25: Love, Haha, Like and Comment reactions (branch claude/project-thread-d16zyx, draft PR)
- **Why:** Chase, Oct 25: "I want the love, haha, like, comment. Just emojis/icons, no label." New scope under the Polish Freeze, on his explicit word; icon-only overrides DS-3 (DEC-38, persona check `decisions/2026-10-25-reactions.md`).
- **Built, test-first:** migration 0017 (`set_reaction`, `reaction_summary`; `backend/tests/reactions_test.sql`, REACT-1..6), `HearthApi.setReaction` / `reactionSummary` (Fake, Supabase with a hearts-only fallback before 0017, contract tests), the store's `react()`, and the card row ❤️ 😂 👍 💬 with per-kind counts (REACT-7..9 in `moments.test.tsx`).
- **Next exact step:** Chase says "merge"; then deploy 0017 and publish to Expo Go on his word.

## Oct 24: moment cards in Photos (merged, PR #54)
- **Why:** Chase saw the old stacked card on Oct 24. The Oct 19 thread had only made a prototype (`prototype/moments.html`) and then waited on questions, so nothing reached the app.
- **Built, test-first (MOMENT-1..8, `app/src/screens/__tests__/moments.test.tsx`):** one compact card per upload, with a photo collage (`PhotoCollage.tsx`), a Love and Comment row, the newest comment, a one-row reply box (DEC-30 kept), and More for "Who can see this" and Delete. Uploads within an hour are separate cards (SESS-1..3 retired; `feed/sessions.ts` is kept unused until Chase confirms). The SWIPE tests now cover the swipe in the event timeline.
- **Next exact step:** merged Oct 25. Publishing to Expo Go and rebuilding the demo and portfolio screenshots wait on his word.

## Oct 24, night shift 4: recruiter-share readiness, hardening round 2 (branch claude/project-thread-kzt7by-ready, draft PR)
- **Recruiter check:** the published demo works end to end, live, on phone and laptop, and matches the repo build. The README and case study now link it, and the case study's decision count is right (RD-1, RD-2). It's ready to send.
- **Fixed test-first:** HARD-8 (full screen kept the same photo when a new post arrived), HARD-9 (a double tap on Love it), HARD-10 (no signal while joining: honest words and Try again), HARD-11 ("Saved" only once the server has her notice choice). Review: `docs/reviews/2026-10-24-share-ready.md`.
- **Tests (3 green runs):** app 633 + 1 skipped, typecheck clean, web e2e 4, demo e2e 9, sweep unchanged.
- **Next exact step:** Chase says "merge". After the merge, rebuild the demo for Product Studio (`cd app && bash scripts/build-demo.sh`) so the live demo gets HARD-8 to HARD-11; that's optional, since the live one already works.

## Oct 23, night shift 3: harden existing features (branch claude/project-thread-kzt7by-harden, draft PR)
- **Done, test-first:** review `docs/reviews/2026-10-23-harden.md` (6 fixed: 0 P0, 3 P1, 3 P2; HARD-6 checked out fine). P1s: a lost signal while making a group no longer makes a duplicate on retry (HARD-1); Share says plainly when there's no group to send to (HARD-3); the demo opens when a browser blocks storage (HARD-7, `app/src/platform/webStorage.ts`, architecture 03 updated).
- **Tests (3 green runs):** app 626 + 1 skipped, typecheck clean, web e2e 4, demo e2e 9 + 44 screenshots (no console errors, no visual change).
- **Next exact step:** Chase reviews and says "merge" (MERGING.md). Nothing to deploy; publish to Expo Go only on Chase's word.

## Oct 22–23, power hour (Chase)
- Merged on Chase's word: #33, #34, #36, the recruiter-ready stack #37 to #45 (no-login demo + fixes), and #32 (on-device opt-in AI, renumbered DEC-28 to DEC-31 because the night shift used DEC-28).
- Oct 23: `EXPO_PUBLIC_SUPABASE_ANON_KEY` saved in Expo's preview environment (Chase's "ok 3"; both public settings now live there, so `eas update --environment preview` needs no export step). Published main 3cd7eb7 to the preview channel (group 80906a4a); the standing Expo Go link serves it.
- Oct 23: D1, D2, D5, D7, D9 decided (DEC-32 to DEC-36, persona check `decisions/2026-10-23-notice-sender-names.md`).
- Oct 23: name check: Fridge Door is taken ("Fridge Door: Kids Drawings" app and several FridgeDoor products), so it's dropped. MARKETING.md shortlist updated; Front Room and Homeplace are next to re-check. Name final: still no. PR #49 merged. Five more Kinfolk-style names logged (Our Folks, Porch Swing, Sunday Supper, Homecoming, Kith); Chase still deciding.
- Chase pasted the demo INTAKE into Product Studio (Oct 22). Next: messenger test MS3.

## Portfolio / public presence
- **Oct 22, shipped (portfolio PR #15, merged and deploying):** Product Studio hosts the no-login demo at chaseholroyd.com/demo/hearth/ (copied from `app/dist-demo-site/`, built from main 10001df) and refreshed family-photos.html per `INTAKE-2026-10-22-demo.md`. The page now has "Try the demo", named groups, AES-256-GCM and MLS, no "Seen by" count, eight agents, 600+ app tests and 800+ database checks, a laptop shot and three phone shots. The placeholder name is kept, and neither expo.app nor the repo is linked. To update the hosted demo later, rebuild here and send Product Studio an intake to re-copy `dist-demo-site/`. Note: the demo bundle's Expo config includes the Expo owner slug (not a link or a secret). **Next:** open chaseholroyd.com/demo/hearth/ on a phone and a laptop and re-run the review against the live URL.
- **Oct 22:** chaseholroyd.com/family-photos.html already shows Hearth under a placeholder name ("name coming"); Product Studio owns that page. Hearth handed Product Studio an INTAKE block (`docs/portfolio/INTAKE-2026-10-22.md`): refresh the test counts, add three sample-data iPhone screenshots from `docs/portfolio/screens/`, add the encryption and "no Seen by" points.
- **Oct 22, recruiter-ready sprint v2:** review in `docs/reviews/2026-10-22-recruiter-ready.md` (RR-1..16: 5 P0, 7 P1, 4 P2). Main gap: no no-login sample-data demo. Fix loop builds one (demo build, sample pictures, demo bar, laptop frame) for Product Studio to host at chaseholroyd.com/demo/hearth/. Round 1a done: demo build with a sample family, demo bar, Grandma's view (`npm run export:web:demo`, `npm run e2e:demo`). Round 1b done: laptop frame with a story panel, plain not-found page. Round 1c done: `npm run build:demo-site` builds the demo for chaseholroyd.com/demo/hearth/ (tested on a Pages-like static server). Round 1d done: README and case study agree (600+ app tests, 800+ database checks, eight agents, demo), portfolio screenshots re-shot from the demo, new INTAKE. Round 2 done: every demo screen re-checked (no new P0/P1), RR-11 groups words, RR-13 test-all exit code, RR-17 shorter demo bar. **Exact next step:** RR-4 waits on Product Studio (Chase pastes `docs/portfolio/INTAKE-2026-10-22-demo.md`). Round 3 done: RR-15 (full-screen photo survives a reload on a static host). Left: RR-16 (confirm disabled buttons with a real user; nothing to build). Round 4 (nightly run, Oct 22): fresh re-check found RR-18 (Messages counted parents without saying so; fixed with "Parents are in every chat.") and RR-19 (a stale next-step line in this file; fixed). **Oct 24: published and checked live.** chaseholroyd.com/demo/hearth/ passed the full showcase sweep at phone and laptop width, light and dark (`SHOWCASE_BASE=https://chaseholroyd.com/demo/hearth/ SHOWCASE_DIR=<dir> npm run e2e:demo -- demo-showcase.spec.js`). Full screen survives a reload, and family-photos.html carries the Oct 22 INTAKE. Review: `docs/reviews/2026-10-24-share-ready.md`.
- **Don't link publicly:** the expo.app web build (the live app on the family's real backend, sign-in only) or the repo (private until the name is final, then AGPL-3.0 per DEC-7). The public no-login demo is built (`app/scripts/build-demo.sh`) for chaseholroyd.com/demo/hearth/; Product Studio hosts it from `docs/portfolio/INTAKE-2026-10-22-demo.md` (Chase pastes it there), which also fixes the page's households wording and test counts and swaps in screenshots from the demo.

## Oct 22: photo helper off-switches (R15, HELP-R4; branch claude/project-thread-u4hx6x)
- **Built, test-first:** migration 0016 adds `photo_helpers_duplicates` (same photo twice, already sent, look-alikes) and `photo_helpers_screens_blur` (screenshots, blurry) to the 0013 flag system. They are off-switches: on unless Hearth's global row or the family's row says off, for anyone who can post, never for a viewer who can't. The app reads them from `my_features` and each helper obeys its own switch; with both off no preview is read. Tests: `backend/tests/photo_helpers_test.sql` (13), HELP-R4 app tests in `helpers.test.ts`, `bulk.test.tsx`, `groupsV2.test.ts`, contract test.
- **Tests (3 green runs):** app 619 + 1 skipped, typecheck clean, backend SQL all suites green (HELPERS 13/13), prototype e2e 33, web e2e 4.
- **Done:** 0016 is live on hosted (deployed Oct 23, smoke 9/9) and the Expo Go update is published.
- **Decisions to review:** the app treats the helpers as off until `my_features` answers (same as video, FLAG-5), so a failed read on a bad network means no helpers that time. Only the family's owner can switch them (FLAG-3 rule). No on-screen switch yet (TRACKER R17).

## Oct 22: studio ux-reviewer synced (recruiter-ready sprint)
- Synced `ux-reviewer` from studio-agents (PR #6 branch `claude/project-thread-wvkxmq`, showcase review mode) with `scripts/sync.sh`; roster row added to `CLAUDE.md`. The rest of `examples/hearth/MIGRATION.md` (swap staff-pm, qa-tdd, privacy-security, app-engineer and marketing for the generic ones, archive funding-analyst) is not done: those Hearth agents carry Hearth-only facts, so it waits for after the Nov 22 beta (TRACKER row R16). Decision to review.

## Oct 21, night shift 1: freeze lifted, review, ranked list, first fixes (branch claude/project-thread-kzt7by)
- **Done:** app review (`docs/product/reviews/2026-10-21-app-review.md`); ranked list in `TRACKER.md` "Sequence to milestone 2"; `docs/eng/PERFORMANCE.md` with measured encryption speed; DEC-28, DEC-29 and the speed-architecture persona check. Built test-first: R1 parallel sending (PERF-UP-1..3), R2 no "Seen by", R3 photos fill the card.
- **R4 (part):** `app/src/crypto/aesGcm.ts` picks native, then crypto.subtle, then JavaScript; upload and viewing use the async path. The native module is installed with the first development build (registerNativeAesGcm), not now: Expo Go can't load it.
- **R5 done:** T8 (RFC 9180 A.2.1 vector passes: our HPKE matches the standard), T9 (QA-3 test pins seed.sql's post dates), T10 (fake chatFetch has the joined-at cutoff, contract test).
- **R7 done:** root README, case study, iPhone screenshots (`SNAPSHOT_DIR=../docs/portfolio/screens npm run e2e:web`). e2e core-loop now expects no "Seen by". R6 moved to P2 (LG persona, REPLY-11).
- **R9 done:** cold start 260 ms median (web + fake). **R10 done:** `SPEC-PHOTO-HELPERS.md` + persona check; build is R15.
- **R8 done (A3):** photos seen before open from the phone, offline too. `media/cache.ts` keeps ciphertext files (`platform/mediaStore.ts`, cache folder, 400 max) and item keys sealed under a Keychain/Keystore key; `FeedStore.onRefreshed` prunes them, sign-out wipes them. Web keeps nothing. Tests A3-1..6. Docs: 02, 03 "On the phone", 04 former-member row.
- **R12 done:** thumbnail loop starts from a guess based on the display JPEG (`media/pipeline.ts`, R12 RV-P5 tests).
- **R15 part 1 done:** `share/helpers.ts` (HELP-R5, DUP-1, SHOT-1), BatchReview lines with "Send them too" and "Show what we left out"/"Put back" (HELP-ALL-1), picker reads library id and screenshot flag (`media/pick.ts`), `media/pixels.ts` (dHash, sharpness, darkness) tested on synthetic pictures.
- **R14 done:** audit unchanged on expo 57.0.30; one advisory ships (decode-uri-component in expo-router, crafted link could freeze the app). Review RV-X4 corrected.
- **R15 part 2 done:** look-alikes from a 160 px preview (`media/preview.ts`, jpeg-js 0.4.4 from npm, `pixels.ts`), lines appear after the screen opens; blur built but off (`BLUR_UNDER` null) until tuned. PERF-HELP-1: 30 ms per photo without JIT.
- **R11 done:** Photos header buttons two to a row (`PhotosScreen.tsx`, `photosHeader.test.tsx`); sketch and persona check in `docs/product/decisions/2026-10-21-photos-header.md`. Portfolio iPhone screenshots refreshed.
- **R15 DUP-2 done:** "already sent" from a 30-day list of preview fingerprints on the phone (`share/sentBefore.ts`).
- **R6 dropped** by Chase Oct 21, kept in mind (DEC-30).
- **Next exact step (Oct 21 plan):** everything left is blocked. R15 blur tuning needs Chase's 40 labeled photos; R15 server flags need a migration Chase deploys; R4 needs a development build; R13 needs FLAG-7. The nightly task now runs the recruiter-ready fix loop instead.
- **Decisions to review:** "already sent" compares a fingerprint of the small preview, not the full file (HELP-DUP-2). Photos header buttons two to a row, labels may wrap to two lines (R11). Look-alike lines appear a moment after the review screen opens (Send never waits). R15 helpers are on by default with an in-code switch, not a server flag yet (HELP-R4); Android screenshots come from the "Screenshots" album only. R3 crops tall or wide photos in the card to fill the frame (the full photo is one tap away). A3 keeps photo keys on the phone, sealed under a Keychain/Keystore key (RV-X6); a removed member's offline phone keeps showing kept photos until its next refresh.
- **Blockers:** none. A1 can't be checked on a phone until a development build exists.

## Earlier: end of day 2 (Thu Oct 15, 2026, 10:30 pm)

## Oct 18: anchor A4 White-paper ready, architecture docs started (Chase's ask)
- Chase: build documentation as we go so it turns into white papers easily, for intelligent, privacy-focused tech readers. Logged as anchor A4 and an ideas-log row in `docs/product/ANCHORS.md`.
- New `docs/architecture/`: README (reader, writing rules, keep-current rule), system overview, data flow, encryption and keys, threat model. Each claim is labeled Built, Planned or Gap and cites code.
- CLAUDE.md rule 6: PRs that change how data is stored, moved, encrypted, logged or shared update the matching section in the same PR.
- Found while writing: `deploy.sh` doesn't schedule `purge_soft_deleted` on hosted (tracker row added).

## Oct 17, evening: milestone 1 runs in Expo Go (Chase's call)
1. **Decided:** milestone 1 runs fully in Expo Go. NOTIFY-3 (tap a push and the post opens) moves to milestone 2, so the $99 Apple account is off the M1 path; M1 notices come by email. Updated BETA-SPEC (criterion map, M1 and M2 gates), MILESTONE-1 and REMAINING.
2. **Focus:** milestone 1 only. Nothing new gets built until Chase has signed in and run the demo; the demo shows what to fix.
3. **Waiting on Chase, in order:**
   - [ ] Paste the two code email templates in the Supabase dashboard, then sign in once (Claude then runs `family-setup.sh` and sends account B's code).
   - [ ] Add the Backblaze B2 keys and `MEDIA_KEK` as Hearth environment secrets (photos), plus Resend (email notices). Never in chat.
   - [ ] Run the 2-day demo in Expo Go, with account B on the web build.
   - [ ] Later: Danielle's email for her poster invite (M2), the "Seen by" call (before M4), the phone survey (Oct 20).
4. **Stale items below, now closed:** PR #9 merged; 0010 and 0011 deployed to an empty database (Oct 17), so the v2 dry run, the apply step and the re-seed family list aren't needed.

## Oct 17, afternoon: family setup in one command, no database password (SETUP-API)
1. **Built, test-first (`backend/tests/setup_api_test.sh`, 34 checks; in `tests/run.sh` and on the real stack in CI):** `bash backend/scripts/family-setup.sh --chase-email <yours> --space-name 'Our kids' [--danielle-email <hers>]` sets up your family in the groups shape through the Management API, like `deploy.sh`. It needs only `SUPABASE_ACCESS_TOKEN` (no `SUPABASE_DB_URL`, no `psql`) and runs as you through the app's RPCs and RLS. It makes Everyone, both sides, each grandparent's house, a Test house for account B, the two events, and prints the invite codes. It stops once anyone else has joined (then use `family-setup-v2.sql`'s dry run).
2. **Why:** hosted now runs 0001–0011 and is empty, so the v1 `family-setup.sql` then v2 would hand account B an invite to a group v2 retires. MILESTONE-1 step 5 and the demo rows now use this script and the Test house.
3. **Next for you:** paste the sign-in code email templates (action item below), sign in once in Expo Go or the web build, then Claude runs the script and gives you account B's code.

## Oct 17 overnight: bulk upload + timeline, family shape, two review rounds (PR #9)
1. **Built, test-first:** bulk upload by date taken + timeline + Jump to year (migration 0010; one batch notice per bulk import); family shape: Everyone, groups, households, events, Parents, share history (migration 0011) and `backend/scripts/family-setup-v2.sql` (dry run by default). 0012 (households only) is not built.
2. **Reviews and fixes:** privacy-security on 0010 and 0011 (S-0011-1..8: replies fixed by when a house joined a post or when someone's share history was widened; Everyone can't be retired even by a direct update; retiring is one-way, so a direct update can't un-retire a group or household; stale invites refused). grandparent-ux (UX-G1..G9: plainer share and group words; an invite that no longer works says "Ask Chase for a new one." before anyone types, signed in or out; signed in, that screen has a "Go to Photos" button).
3. **Tests (3 green runs, Oct 17 morning):** backend SQL 639 (RLS 120, API 169, notify 60, setup 5, reply 47, timeline 38, groups 168, timeline-future 6, AUD-16 11, setup v2 15), deploy 20, EAS 6, prototype 33, Jest 340 + 1 skipped, typecheck clean, web e2e 1.
4. **Known gaps:** `get_timeline` p95 is 2–5.5 ms on a 2-CPU box against a 5 ms target (re-measure on hosted); without `expo-media-library` there's no fallback to a photo's creation time when it has no EXIF date; Deno tests run only in CI (not installed here); "Seen by" still conflicts with A2 (your call); M-13..M-16 (bulk-pick on your iPhone, airplane mode mid-batch, location stripped) need your phone.
5. **Action items for Chase:** see the checkboxes at the top of the list below (merge, then the v2 dry run before any deploy).

## Oct 17: groups, households, events built (SPEC-GROUPS first build, app-engineer)
1. **Built, test-first (qa-tdd's red tests now green):** migration 0011 (family shape, section 10 privacy review), `backend/scripts/family-setup-v2.sql` (dry run by default), and the app (share-history pick with no default, comment box names its readers, per-group switch gone, events in the share sheet, timeline card opens the post, future capture dates ignored). 0012 (households only) is not built yet. Contract notes: `docs/eng/API.md` "As built (0011)".
2. **Tests:** backend SQL 607, deploy 20, EAS 6, prototype 33, Jest 329 + 1 skipped, typecheck clean, web e2e 1. Deno is not installed in this sandbox.
3. **Chase:** don't deploy 0011 yet. Run the v2 dry run on a copy of the database with `-v sister_name=...`, read the gains/losses with staff-pm, then take a backup and apply with `-v apply=yes`.

## Oct 17, 3 am: groups, households, events, roles (spec only, staff-pm; replaces "one family hierarchy")
1. **Specced, not built:** `docs/product/SPEC-GROUPS.md` (renamed from SPEC-HIERARCHY.md), from your 2:47 am answer. Fixed shape: Everyone, set groups (your side, Danielle's side), households just under them; a person can be in several households and groups (Danielle's sister in Memaw's and Pawpaw's houses). Events combine any groups and households (Charleston trip, Gigi's birthday, custom groups). Only parents send to Everyone. Adding anyone asks "Share all past photos" or "Only new photos", no default. Criteria BETA-AUD-11 to 22, REPLY-7 to 13; AUD-9 retires.
2. **Migration order (also in the overnight plan):** 0010 timeline, 0011 family shape (removes the 0009 switch), `family-setup.sql` v2 re-seed, 0012 households-only. Next: privacy-security review, then qa-tdd failing tests. Before milestone 3; doesn't block M1 or M2.

## Oct 17, 2 am: first real deploy (Chase's ask, without function keys)
1. **Live on `jqvgjfbhzbvfdhtnvgzr`:** migrations 0001–0009 (the Management API accepts begin/commit, so the migration-transaction question is settled), both edge functions, `NOTIFY_CRON_SECRET`, and the `hearth-notify` and `hearth-purge-client-errors` cron jobs.
2. **Failed, step 5/5 (sign-in email: 6-digit code):** `PATCH config/auth` returned 403 "Missing required permission(s): project_admin_write". The access token is scoped and can't change project settings. Until this is fixed, sign-in emails send Supabase's default link, not a code.
3. **Action items for Chase:**
   - [x] **Merge PR #9** (bulk upload + timeline, family shape, review fixes).
   - [x] *(Moot: deployed Oct 17 to an empty database.)* **DON'T run `deploy.sh` from main until the v2 dry run is reviewed.** Deploying applies 0010 and 0011; 0011 changes who reads replies and needs the v2 re-seed right after.
   - [x] *(Moot, empty database.)* **v2 dry run, on a copy of the database** (a restored backup or a Supabase branch with 0010 and 0011 applied, never the live one): `psql "$SUPABASE_DB_URL" -v chase_email=you@example.com -v space_name='Our kids' -v sister_name='<her name>' -f backend/scripts/family-setup-v2.sql`. Read each person's "gains N posts, loses M posts" line with staff-pm (expected: Danielle gains 3 posts as a Parent, since Parents see every post). It needs `SUPABASE_DB_URL` (the database connection string from the Supabase dashboard; `SUPABASE_ACCESS_TOKEN` alone isn't enough, since the script runs through `psql`), `psql` installed, and your account signed in once in the app.
   - [x] *(Done: 0010 and 0011 deployed Oct 17.)* **Then apply:** take a backup, run `deploy.sh` (applies 0010 and 0011), and right after run the same command on the live database with `-v apply=yes` added.
   - [ ] **Sign-in code email.** Either paste the templates in the Supabase dashboard (Authentication → email templates: Magic Link and Confirm signup, subject `Your Hearth code: {{ .Token }}`, bodies from `backend/supabase/templates/`; code length 6, expiry 3600 s), or make a token with project admin write, replace the `SUPABASE_ACCESS_TOKEN` secret, and rerun `deploy.sh` (applied steps are skipped).
   - [ ] **Function keys.** Fill the values in `backend/supabase/functions/.env.example` (Backblaze B2, `MEDIA_KEK`, `ALLOWED_ORIGINS`, Resend, `APP_LINK_BASE`, Expo). Add them as Hearth environment secrets so a session can write `.env` and rerun the deploy. Until then, photos (sign-media) and notifications (notify) are deployed but can't work.
   - [ ] **Cleanup after the keys are in:** delete the placeholder Supabase secret `HEARTH_KEYS_PENDING`. It was set only because `supabase secrets set --env-file` rejects an empty file.
   - [x] **Groups spec, 3 one-word answers** (Oct 17, 3:26 am: Groups, Parents; event replies default to Event) (`docs/product/SPEC-GROUPS.md` §9): event replies Event or Household (rec. Event); a relative's post goes to Groups or Everyone (rec. Groups); who sends to Everyone and makes events, Parents or Owner (rec. Parents).
   - [x] *(Moot: `family-setup.sh` makes a fresh family.)* **Family list for the re-seed** (spec §2): Danielle's sister's name; put her in both Memaw's and Pawpaw and Granny's houses (rec. yes); who was at Gigi's birthday; any sibling of yours to place in both your parents' houses.

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
- **Native look (Oct 19, PR #30):** the app follows Apple's rules on iPhone and Material 3 on Android, plus Hearth's overrides (`docs/product/DESIGN-SYSTEM.md`). Every look is saved in `docs/design/versions/`; add a folder with `app/e2e-web/snapshot.spec.js` whenever the look changes.
- **Agent update (Oct 19): `grandparent-ux` is Hearth's UI/UX designer.** It designs as well as reviews, introduces itself to Chase, uses the ranked family personas (Bebar, Gigi, Phyllis first; Scott and John on Android) instead of "Grandma June", and measures sizes and contrast rather than guessing.
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
