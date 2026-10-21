# Hearth tracker: what's next, what's missing, what's pending

The one list of everything open between Chase and Claude. Updated Oct 21, 2026.

**How it works**
- Work the **Sequence** top to bottom. One step at a time; nothing new gets built until milestone 1 passes (Chase, Oct 17).
- Every thread that finishes, adds or blocks something updates this file in the same PR. A thread is resolved once its open items are here.
- `HANDOFF.md` is the history log; this file is the to-do list. Scope still comes from `BETA-SPEC.md`, steps from `MILESTONE-1.md`.
- **Bugs found but not fixed** go in the Hearth Test Log as open tickets (B# bug, S# security, T# test fix), added to `tracker/build_seed.py` in the same PR that finds them; then rerun it. This file names a ticket only when it blocks a step here.
- Owner: **Chase** or **Claude**. Status: ☐ open, ◐ in progress, ☑ done (move to "Done" at the bottom).

## Goal: milestone 1 ready for testing

Chase uses Hearth end to end in Expo Go on his iPhone, with a test account B on the web build: sign in with a code, post photos, B sees them, B comments and hearts, Chase gets an email notice, 10+ posts over 2 days, nothing lost. Gate: `BETA-SPEC.md` "Milestone gates", row 1.

## Sequence to milestone 2 (review-driven, Oct 21)

The freeze is lifted (DEC-28). Ranked by staff-pm from `docs/product/reviews/2026-10-21-app-review.md`: what blocks M2 (Mom) first, then speed and stability, then G1, then the portfolio. Worked nightly at 2:15am ET until done.

| # | Item | Pri | Cost | Status |
|---|---|---|---|---|
| R1 | A2 parallel sending: display and thumbnail together, 2 photos at once, next post prepared during upload (RV-P1, PERF-UP-1..3) | P0 | S | ☑ Oct 21 |
| R2 | Drop "Seen by N of M" from cards (RV-U1, DEC-21) | P0 | S | ☑ Oct 21 |
| R3 | Photos fill the card frame, no grey bars on mixed tall and wide posts (RV-U2, UAT 8) | P0 | S | ☑ Oct 21 |
| R4 | A1 native encryption behind a switch; JavaScript stays in Expo Go; same vectors on both (RV-P2) | P0 | M | ◐ Oct 21: provider switch built (web uses crypto.subtle). Installing react-native-quick-crypto 1.1.8 (plus react-native-nitro-modules) waits for the first development build, since Expo Go can't load it |
| R5 | Test gaps T9 (date-dependent QA-3 test), T10 (fake chat joined-at cutoff), T8 (RFC 9180 vectors) | P1 | S | ☑ Oct 21: our HPKE matches RFC 9180 A.2.1; QA-3 test pins seed dates; fake chat has the joined-at cutoff |
| R6 | Reply readers asked only when the reply box opens, plus a "Write something back" button (RV-P3, RV-U4) | P2 | S | ☐ Moved down Oct 21: hiding the box adds a tap for the least tech-savvy relative (LG) and touches REPLY-11; needs a grandparent-ux sketch first. FlatList windowing already caps the extra calls at about 10 cards |
| R7 | Portfolio pack: root README, screenshots of the core flow (fake names), case study | P1 | M | ☑ Oct 21: `README.md`, `docs/portfolio/CASE-STUDY.md`, `docs/portfolio/screens/` (from `snapshot.spec.js`) |
| R8 | A3 Photos kept on the phone: the feed and encrypted photo files, keys in the keychain (RV-P4, RV-X6; privacy review first) | P1 | L | ☑ Oct 21: photos seen before open from the phone with no network; ciphertext files plus keys sealed under a Keychain/Keystore key, dropped when a post goes away and wiped at sign-out (A3-1..6). Decision to review: keys kept on the phone (03-encryption-and-keys "On the phone"). Phone timing still to measure |
| R9 | PERF-FEED-1 cold-start timing on the web build | P1 | S | ☑ Oct 21: 260 ms median on the web build with the fake backend (`e2e-web/perf.spec.js`); a phone timing comes with A3 |
| R10 | Specs: AI-2 duplicates, AI-4 screenshots and blurry photos, no model (persona check, grandparent-ux words) | P2 | S | ☑ Oct 21 specced: `SPEC-PHOTO-HELPERS.md` (HELP-*). Build is a new row after A3 |
| R15 | Build the photo helpers (HELP-DUP-1..4, HELP-SHOT-1, HELP-BLUR-1/2, HELP-ALL-1) | P2 | M | ◐ Oct 21 part 1: same photo twice sent once, screenshots left out with "Send them too", "Show what we left out" with Put back; duplicate and blur arithmetic tested. Part 2: decode thumbnails, wire near-duplicates and blur, 30-day repeats, tune blur on 40 photos (needs Chase), server flags |
| R11 | Photos header: fewer stacked buttons before the first photo (RV-U3; grandparent-ux sketch first) | P2 | S | ☐ |
| R12 | Thumbnail sizing from a first guess instead of up to 7 encodes (RV-P5; measure on a phone) | P2 | S | ☑ Oct 21: the display JPEG's bytes per pixel pick the first step (padded 1.5×); a busy photo takes 1 to 2 thumbnail encodes instead of up to 7, a plain one still gets the sharpest. Phone timing still to measure |
| R13 | A4 resumable video uploads (after FLAG-7 video stripping; RV-P7) | P2 | L | ☐ |
| R14 | npm audit: recheck the Expo CLI build-tool findings after the next Expo patch (RV-X4) | P2 | S | ☐ |

## Sequence to milestone 1

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Say "merge" for the docs PRs: [#14](https://github.com/holroydchase-afk/Hearth/pull/14) (family vault logged) and the PR that adds this tracker. (#15, milestone 1 in Expo Go, is merged) | Chase | ☑ |
| 2 | **Sign-in code email.** In Resend: API Keys → Create, name `supabase-smtp`, Sending access. In Supabase → Authentication → Emails → Set up SMTP: sender `onboarding@resend.dev`, name `Hearth`, host `smtp.resend.com`, port `465`, user `resend`, password = that key. Then paste the two templates (`deploy/magic_link.html`, `deploy/confirmation.html` in the project files; subject `Your Hearth code: {{ .Token }}`) and set code length 6, expiry 3600 s. About 10 minutes | Chase | ☑ |
| 3 | **Get the app to Chase's phone and account B's browser.** Point the app at the hosted project, publish it so Expo Go opens it from a link or QR (no laptop dev server), and give account B a web link. Nothing does this today (see Missing, M1) | Claude | ☐ |
| 4 | Sign in once in Expo Go with the 6-digit code; tell Claude "signed in" | Chase | ☐ |
| 5 | Run `family-setup.sh` (Everyone, both sides, the houses, Test house, two events); send Chase account B's invite code | Claude | ☐ |
| 6 | **Photo and notice keys.** Make a Backblaze B2 account (US East; the region can't change) and a bucket key. Save the B2 values, a Resend key for notices, and `MEDIA_KEK` (Claude shows how to generate it) as Hearth environment secrets, never in chat. Print `MEDIA_KEK` twice and keep the copies in two places | Chase | ☐ |
| 7 | Write the function secrets from the environment, rerun `deploy.sh`, delete the placeholder secret `HEARTH_KEYS_PENDING`, and check one photo upload and one email notice on the hosted project | Claude | ☐ |
| 8 | Build the sent-vs-received check (QA-3) and refresh the Test Log so each demo row can be logged | Claude | ☐ |
| 9 | **The 2-day demo** in `MILESTONE-1.md`: 10+ posts, B comments and hearts, airplane mode, save to phone. Log each row (or tell Claude) | Chase | ☐ |
| 10 | Fix what the demo found (test first), then staff-pm gate review: pass or fail milestone 1 | Claude | ☐ |

## Messenger (D13, built alongside milestone 1)

Group and event chat, end to end encrypted with MLS (`SPEC-MESSENGER.md`, `docs/architecture/06-messenger.md`). Built in PR [#29](https://github.com/holroydchase-afk/Hearth/pull/29); Messages opens from a button at the top of Photos.

| # | Step | Owner | Status |
|---|---|---|---|
| MS1 | Say "merge" for PR #29 | Chase | ☑ merged Oct 19 |
| MS2 | Deploy migration 0015 to hosted (`deploy.sh`) and publish the Expo Go update | Claude | ☑ Oct 19 (smoke check 9/9; preview from main a833288) |
| MS3 | MSG-9 by hand: Chase in Expo Go and account B on the web trade 5 messages each way on a shared group | Chase | ☐ |
| MS4 | privacy-security review of `app/src/messenger/` and 0015; spec safety numbers (key verification). Crypto review done Oct 19 (randomness fix in PR #29); still open: outside audit, RFC 9180 test vectors, safety numbers, review of 0015 | Claude | ◐ |
| MS5 | grandparent-ux review of the Messages words and the button-vs-tab placement | Claude | ☐ |
| MS6 | marketing: add "messages are end-to-end encrypted (MLS)" to the claims register once deployed, with the limits in 06-messenger | Claude | ☐ |
| MS7 | Push notice for new messages (milestone 2, with NOTIFY-3) | Claude | ☐ |

## Missing for MVP

What stops milestone 1 from being testable today. Each line names its sequence step.

| Gap | Why it matters | Step |
|---|---|---|
| Sign-in emails send Supabase's default link, not the 6-digit code the app asks for | Nobody can sign in | 2 |
| No route from the hosted project to a phone or browser: no `app/.env.local` for hosted, no published Expo Go update, no web build online | Chase can't open the app without running a dev server on a laptop | 3 |
| No family in the hosted database (0 users, 0 groups) | Nothing to post to | 5 |
| Backblaze B2 keys and `MEDIA_KEK` missing | Photos can't upload or show | 6, 7 |
| Resend key for notices missing | No email notices (REPLY-3, NOTIFY-4) | 6, 7 |
| BULK-1 fallback: a photo with no EXIF date should use the photo's creation time; needs `expo-media-library`, not wired | An M1 P0 criterion is only partly met; old screenshots land undated | 10 (or earlier if the demo hits it) |
| QA-3 sent-vs-received script doesn't exist; Test Log data stops at day 2 | The gate's "0 lost" can't be shown | 8 |
| Gate says "M1 auto criteria green 3× against the hosted project", but the hosted SQL suites wipe the database and need `SUPABASE_DB_URL` | Can't be met as written once Chase's family exists (see Decisions, D1) | before 4 |
| Never run on a real phone: resize, location strip (M-09), save to phone, code email | Only the demo proves these | 9 |
| `get_timeline` speed measured only on a 2-CPU test box (2–5.5 ms vs a 5 ms target) | Re-measure on hosted; low risk at family size | 10 |

## Decisions waiting on Chase

| # | Question | Claude's pick | Blocks |
|---|---|---|---|
| D1 | How to meet "auto criteria green 3× on hosted": wipe and run the full suites on hosted before you sign in (needs `SUPABASE_DB_URL`), or count CI's 3 green runs on a real Supabase stack plus a read-only smoke check on hosted | CI runs plus hosted smoke check; no extra secret, nothing wiped | M1 gate wording (before step 4) |
| D2 | Refresh the staff-pm agent (milestones, "groups" wording, a not-doing list, files it owns), as a PR you review | Yes, after milestone 1 | Nothing today |
| D3 | Is the name final? Must be answered before buying the domain or the $99 Apple build (`ACCOUNTS.md`) | Decide at the start of milestone 2 | Milestone 2 |
| D4 | "Seen by" conflicts with A2 Guilt-free: keep, change or drop | Decide before milestone 4 | Milestone 4 |
| D5 | Is Thanksgiving (Nov 26) still the target for milestones 3–4 | Yes, soft target | Planning only |
| D6 | AI positioning session (on-device, opt-in); blocks face features only | After the beta | Face features |
| D7 | Earlier "personal server" question: did you mean a separate locked store per family, run in the US? Your yes to the family vault may already answer it | Treat the vault as the answer | Nothing today |
| D8 | Start per-family media keys now, before the first real photos (step 7), or after milestone 1 (then old photos need re-keying) | Before step 7, if staff-pm approves; it's small | Nothing today; cheaper before step 7 |
| D9 | Push and email notices name the sender ("From Chase on Hearth", BETA-NOTIFY-7) or say nothing about who | Keep names for the beta; add a "hide names" setting later | Milestone 2 |
| D10 | Open-source the repo, and under which license? Options: AGPL-3.0, MIT, personal/family-only (PolyForm Noncommercial, not OSI open source), or AGPL plus a paid commercial license. MIT can't also be limited to personal and family use. Sentry (FSL) and PostHog (MIT + paid `ee`) sell to companies; Signal, Ente and Immich use AGPL. See "Developer edition" below | **Decided: AGPL-3.0** (Chase, Oct 19; `decisions/2026-10-19-license-agpl.md`); the name stays Chase's (trademark), and a contributor agreement once outside PRs arrive keeps dual licensing open. Repo goes public only after D3 (name final) | Developer edition |
| D11 | Text message codes as the primary, default way to get a sign-in code (email as fallback). Needs an SMS provider and US carrier registration, which can take weeks | Keep email for milestones 1 and 2; staff-pm specs texts, and you start carrier registration early so it's ready for the grandparents (milestone 3+) | Grandparent milestones |
| D12 | Other sign-in options, including Sign in with Apple | Explore after milestone 1; Apple needs the $99 account and a final name | Nothing today |
| D13 | Built-in messenger (Chase, Oct 19: "maybe we use Signal"). Signal's own network has no API for other apps, so "Signal" can mean: a "Message on Signal" link out, or Signal's open protocol library (libsignal, AGPL like Hearth) on our own servers. Other option: MLS (the group-chat encryption standard). Chat or DMs are out of BETA-SPEC today | **Decided (Chase, Oct 19): build now, on MLS**, group and event chat first (`SPEC-MESSENGER.md`, `decisions/2026-10-19-messenger-mls.md`). Building in the messenger thread, alongside milestone 1 | Nothing; behind a Messages button |
| D14 | Native look (Apple HIG on iPhone, Material 3 on Android, plus Hearth's overrides; `DESIGN-SYSTEM.md`): when to switch the app over | **Decided: all now** (Chase, Oct 19); built in PR #30 | Nothing |

## Waiting on Chase, later (not milestone 1)

- Mom's email, for her poster invite (milestone 2).
- Phone survey: each relative's phone model, OS version and the email they check (was due Oct 20).
- Apple Developer ($99) at the start of milestone 2, after D3.
- Android test phone (~$100) and Google Play ($25), milestone 5.
- QA-R3 (high, Oct 18): `SUPABASE_DB_URL` as a Hearth environment secret, never in chat, so QA can query hosted and re-measure `get_timeline` speed.
- **Real data starts at milestone 2** (Oct 18): milestone 1 data and the bucket `family-photos-testing-kq7m` are test data and can be wiped. Before Mom joins, decide: wipe and keep them, or a fresh bucket (and project) for real photos. Photos from before the S17 fix must not carry over (S18).
- **QA environment before milestone 3** (Oct 18): once anyone beyond Mom is on, every release is tried in QA first (its own Supabase project and bucket, plus the `preview` channel). Ties to IN-9 in REMAINING.md.

## Waiting on Claude, later (not milestone 1)

- Milestone 2 build: push on a real iPhone build (NOTIFY-3), Resend domain and SPF/DKIM after the name is final, invite links.
- Spec the duplicate catcher (first AI add-on, no ML) when milestone 1 is behind us (`AI-FEATURES.md`).
- grandparent-ux review of the family vault ideas before any vault spec (post-beta).
- QA-R4 (high, Oct 18): browser tests in CI (`npm run e2e:web` in `.github/workflows/ci.yml`), after milestone 1 unless Chase pulls it forward.
- **Privacy path** (marketing thread, Oct 17). Chase's stance: the family vault is a later, higher tier, rolled out slowly; the steps below come first. Post-milestone 1 unless Chase pulls them forward.
  - Per-family media keys: deleting a family makes its photos unreadable. A small test-first change in media signing; easiest while the hosted database has no photos. Outside BETA-SPEC, so staff-pm approves first. See D8.
  - A "what Hearth can see" page listing every vendor and what it can read; grandparent-ux reviews the wording.
  - Audit that our code never keeps IP addresses, and write down Supabase's log retention.
  - Later: encrypt captions and replies (this blocks caption search).
- **Architecture docs (A4, white-paper source).** Write the access-control section (groups, households, events, roles, RLS from 0011) next; then retention and deletion once the purge worker exists. Keep every footer current (CLAUDE.md rule 6).
- Schedule the nightly hard purge (`purge_soft_deleted`) on the hosted project; `deploy.sh` doesn't today. Found while writing `docs/architecture/02-data-flow.md`.
- **Inventory of everything Hearth is building** (Chase, Oct 19, "at some point"): one list of screens, backend functions, scripts, docs and accounts, read from the repo. Not started; good fit for the central PM hub (ACT-1).
- 0012 households-only migration (spec'd in `SPEC-GROUPS.md`, needed before milestone 3).

- **Developer edition** (Chase, Oct 19; post-milestone 1, decided by D10). The bet: a developer parent clones Hearth, deploys their own copy with one command, and grows it with Claude. The repo (CLAUDE.md, agents, TDD, `docs/architecture/`) is already most of the kit. Goal: an impressive dev-community contribution, built by product and dev folks for product and dev folks.
  1. Scan the full git history for secrets (and anything family-identifying) before anything goes public.
  2. Add the AGPL-3.0 LICENSE file (D10), plus the license field in `app/package.json`.
  3. Self-host guide around `backend/scripts/deploy.sh`: your own Supabase project, your own B2 bucket, your own keys.
  4. "Fix this with Claude": a bug report or change request opens a Claude Code session on *their* repo. Claude reads code and error reports, never photos, captions or names (rule 2); privacy-security reviews the data flow.
  5. Make the repo public, only after D3 says the name is final (a public repo bakes the name into every fork and link).
  - **Not doing yet:** a paid hosted plan (milestone 7 decides costs), a contributor agreement until outside PRs exist, forums or a Discord, a plugin system, an outside security review (milestone 7).

## Running

- Weekly deploy dry run, every Monday 15:47 UTC (routine; its thread stays open).

## Done (latest first)

- Oct 19: messenger merged (PR #29) and migration 0015 deployed. Open PR #20's still-true items folded in here and in ACCOUNTS.md (QA-R1 and QA-R2 were already done: account B exists, keys live Oct 18).
- Oct 19: decision log started (`DECISION-LOG.md`, DEC-1 to DEC-27): each decision, why, and what it beat. Answered D-items above move there.
- Oct 19: native look built (PR #30): system fonts, Apple colors on iPhone and Material 3 on Android, the phone's own tab bar, native buttons and switches, DS-1..DS-9 tests. The old look is saved in `docs/design/versions/`. Still to confirm on a phone in UAT: the tab bar and the gray buttons.
- Oct 19: `grandparent-ux` rebuilt as Hearth's UI/UX designer with the ranked family personas.
- Oct 18: anchor A4 White-paper ready; `docs/architecture/` started (overview, data flow, encryption and keys, threat model).
- Oct 18: sign-in code email set up in Supabase (Resend SMTP, both templates, 6-digit code, 1 hour); PR #14 and #16 merged.
- Oct 17: tracker created (this file).
- Oct 17: milestone 1 runs in Expo Go; push moved to milestone 2 (PR #15).
- Oct 17: Resend connected; a test email reached Chase's Gmail.
- Oct 17: `ACCOUNTS.md` and the name guard (PR #11, #12): store builds refuse until "Name final: yes".
- Oct 17: privacy-first marketing path logged (PR #13).
- Oct 17: one-command family setup, token only (PR #10).
- Oct 17: hosted Supabase runs migrations 0001–0011, both edge functions and both cron jobs.
- Oct 17: bulk upload, timeline, family shape (PR #9); AI features tracker (PR #7); Expo link (PR #8).
- Oct 16–17: deploy through the Management API, no Docker (PR #1, #2).
