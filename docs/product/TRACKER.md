# Hearth tracker: what's next, what's missing, what's pending

The one list of everything open between Chase and Claude. Updated Oct 17, 2026.

**How it works**
- Work the **Sequence** top to bottom. One step at a time; nothing new gets built until milestone 1 passes (Chase, Oct 17).
- Every thread that finishes, adds or blocks something updates this file in the same PR. A thread is resolved once its open items are here.
- `HANDOFF.md` is the history log; this file is the to-do list. Scope still comes from `BETA-SPEC.md`, steps from `MILESTONE-1.md`.
- Owner: **Chase** or **Claude**. Status: ☐ open, ◐ in progress, ☑ done (move to "Done" at the bottom).

## Goal: milestone 1 ready for testing

Chase uses Hearth end to end in Expo Go on his iPhone, with a test account B on the web build: sign in with a code, post photos, B sees them, B comments and hearts, Chase gets an email notice, 10+ posts over 2 days, nothing lost. Gate: `BETA-SPEC.md` "Milestone gates", row 1.

## Sequence to milestone 1

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Say "merge" for the docs PRs: [#14](https://github.com/holroydchase-afk/Hearth/pull/14) (family vault logged) and the PR that adds this tracker. (#15, milestone 1 in Expo Go, is merged) | Chase | ◐ |
| 2 | **Sign-in code email.** In Resend: API Keys → Create, name `supabase-smtp`, Sending access. In Supabase → Authentication → Emails → Set up SMTP: sender `onboarding@resend.dev`, name `Hearth`, host `smtp.resend.com`, port `465`, user `resend`, password = that key. Then paste the two templates (`deploy/magic_link.html`, `deploy/confirmation.html` in the project files; subject `Your Hearth code: {{ .Token }}`) and set code length 6, expiry 3600 s. About 10 minutes | Chase | ☐ |
| 3 | **Get the app to Chase's phone and account B's browser.** Point the app at the hosted project, publish it so Expo Go opens it from a link or QR (no laptop dev server), and give account B a web link. Nothing does this today (see Missing, M1) | Claude | ☐ |
| 4 | Sign in once in Expo Go with the 6-digit code; tell Claude "signed in" | Chase | ☐ |
| 5 | Run `family-setup.sh` (Everyone, both sides, the houses, Test house, two events); send Chase account B's invite code | Claude | ☐ |
| 6 | **Photo and notice keys.** Make a Backblaze B2 account (US East; the region can't change) and a bucket key. Save the B2 values, a Resend key for notices, and `MEDIA_KEK` (Claude shows how to generate it) as Hearth environment secrets, never in chat. Print `MEDIA_KEK` twice and keep the copies in two places | Chase | ☐ |
| 7 | Write the function secrets from the environment, rerun `deploy.sh`, delete the placeholder secret `HEARTH_KEYS_PENDING`, and check one photo upload and one email notice on the hosted project | Claude | ☐ |
| 8 | Build the sent-vs-received check (QA-3) and refresh the Test Log so each demo row can be logged | Claude | ☐ |
| 9 | **The 2-day demo** in `MILESTONE-1.md`: 10+ posts, B comments and hearts, airplane mode, save to phone. Log each row (or tell Claude) | Chase | ☐ |
| 10 | Fix what the demo found (test first), then staff-pm gate review: pass or fail milestone 1 | Claude | ☐ |

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
| D10 | Open-source the repo? Prep would be a secrets scan and a license; a paid outside review waits for milestone 7 | Decide after milestone 1 | Nothing today |

## Waiting on Chase, later (not milestone 1)

- Mom's email, for her poster invite (milestone 2).
- Phone survey: each relative's phone model, OS version and the email they check (was due Oct 20).
- Apple Developer ($99) at the start of milestone 2, after D3.
- Android test phone (~$100) and Google Play ($25), milestone 5.

## Waiting on Claude, later (not milestone 1)

- Milestone 2 build: push on a real iPhone build (NOTIFY-3), Resend domain and SPF/DKIM after the name is final, invite links.
- Spec the duplicate catcher (first AI add-on, no ML) when milestone 1 is behind us (`AI-FEATURES.md`).
- grandparent-ux review of the family vault ideas before any vault spec (post-beta).
- **Privacy path** (marketing thread, Oct 17). Chase's stance: the family vault is a later, higher tier, rolled out slowly; the steps below come first. Post-milestone 1 unless Chase pulls them forward.
  - Per-family media keys: deleting a family makes its photos unreadable. A small test-first change in media signing; easiest while the hosted database has no photos. Outside BETA-SPEC, so staff-pm approves first. See D8.
  - A "what Hearth can see" page listing every vendor and what it can read; grandparent-ux reviews the wording.
  - Audit that our code never keeps IP addresses, and write down Supabase's log retention.
  - Later: encrypt captions and replies (this blocks caption search).
- 0012 households-only migration (spec'd in `SPEC-GROUPS.md`, needed before milestone 3).

## Running

- Weekly deploy dry run, every Monday 15:47 UTC (routine; its thread stays open).

## Done (latest first)

- Oct 17: tracker created (this file).
- Oct 17: milestone 1 runs in Expo Go; push moved to milestone 2 (PR #15).
- Oct 17: Resend connected; a test email reached Chase's Gmail.
- Oct 17: `ACCOUNTS.md` and the name guard (PR #11, #12): store builds refuse until "Name final: yes".
- Oct 17: privacy-first marketing path logged (PR #13).
- Oct 17: one-command family setup, token only (PR #10).
- Oct 17: hosted Supabase runs migrations 0001–0011, both edge functions and both cron jobs.
- Oct 17: bulk upload, timeline, family shape (PR #9); AI features tracker (PR #7); Expo link (PR #8).
- Oct 16–17: deploy through the Management API, no Docker (PR #1, #2).
