# Hearth: work remaining to Ring 0 (Thu Oct 29) and beta (Sun Nov 22)

Owner: staff-pm. Written Thu Oct 15, 2026, 1 pm. Scope and acceptance criteria still live in `BETA-SPEC.md`. This file covers who does what, in what order. Product scope beyond the beta is in `CORE-FEATURES.md`.

**Bottom line:** Nov 22 still holds. Oct 29 holds only if four things happen by Mon Oct 19: the code is in a GitHub repo, Apple enrollment is confirmed, the accounts and domain exist, and the push/email sender is started. The backend is done and fast. The real gap is the work nobody has started yet: **nothing sends notifications**, **nothing has run on a real phone**, and **the code lives in a container that can disappear.**

Sizes: **S** = under half an agent-day · **M** = about 1 agent-day · **L** = 2–3 agent-days. On a $20 plan, assume about 1 agent-day per calendar day, and assume half of those get cut off by the usage limit. That gives roughly 7–8 real agent-days between Oct 16 and Oct 28. The Ring 0 list below is sized to fit in 7.

---

## Where things stand (verified Oct 15, 1 pm)

| Area | State | Evidence |
|---|---|---|
| Backend API (API.md) | Done | 110 RLS + 130 API SQL tests green; Deno smoke 4/4 over real PostgREST; `get_feed` p95 1.94 ms at 1M posts (`backend/tests/perf/RESULTS.md`) |
| S9, S10 | Fixed | `0002_beta_api.sql` + `api_test.sql`. **The tracker still shows them open** (qa-tdd: QA-5) |
| S16 (real Supabase stack) | Open | `ci.yml` is written but has never run. Docker can't pull images here |
| App | Finishing | `tsc --noEmit` is clean as of 1 pm. The app README claims 179 Jest tests green and 19/19 contract tests against real PostgREST; the Jest hang is being fixed now |
| **Notification sending** | **Not built** | `push_tokens` and `notification_prefs` tables exist. There is no sender (push or email), no RPC to save a token or a preference, and the app keeps preferences on the phone only (app README, "API.md gaps" #5) |
| Real phones | Never run | Only the web build has been exercised. Image resize, file bytes, save-to-phone, OTP email, deep links and push are all unverified on a device |
| Video | Off in the app | iOS videos carry location that can't be stripped without a transcoder. `VIDEO_POSTING_ENABLED=false` |
| Infrastructure | None | No repo, no hosted project, no domain, no backups, no staging. Code exists in this container plus zips |

---

## Critical path (in order; a slip in any line moves Oct 29)

| # | Date | Item | Owner | Blocks |
|---|---|---|---|---|
| 1 | **Fri Oct 16** | Private GitHub repo created; all code pushed (IN-1) | Chase → infra | everything below; also ends the "lose it all" risk |
| 2 | **Fri Oct 16** | Apple enrollment confirmed or submitted (CH-1) | Chase | TestFlight, any iPhone build |
| 3 | Fri Oct 16–Sat 17 | Accounts: Supabase ×2, Backblaze (US East), Expo, Resend, Play; name check + domain bought (CH-2, CH-3) | Chase | IN-3, IN-5, IN-6 |
| 4 | Sat Oct 17 | CI green on GitHub Actions → S16 closed (IN-2) | infra | Ring 0 gate (BETA-SEE-1) |
| 5 | Sat Oct 17–Tue 20 | Notification sender + 0003 migration (AE-2), red tests first (QA-1) | app-engineer, qa-tdd | NOTIFY-1/2/3, REPLY-3 (all P0) |
| 6 | Mon Oct 19 | Staging stack deployed (IN-3), email codes sending from our domain (IN-6) | infra | real sign-in, device builds |
| 7 | Wed Oct 21 | Website on the domain: invite links, privacy policy (IN-5) | infra | invite links opening the app; Beta App Review |
| 8 | Wed Oct 21–Fri 23 | First builds on Chase's iPhone + an Android phone; fix whatever breaks (AE-3) | app-engineer | Ring 0 |
| 9 | Mon Oct 26 | Production project on Pro; key backup + restore drill (IN-4, IN-7); TestFlight external build submitted (AE-6) | infra, Chase | Ring 0 gate |
| 10 | Tue Oct 27–Wed 28 | Ring 0: Chase posts ≥10 times over 2 days, 0 lost (CH-6) | Chase, qa-tdd | Ring 0 gate Thu Oct 29 |

Sat–Sun Oct 24–25 is buffer for usage-limit days. Don't plan work into it.

---

## Top 3 risks to the dates

1. **Apple.** Enrollment status is unknown. Individual enrollments take 2 days to 3+ weeks, and Beta App Review has never been tried for this app. An invite-only app needs a working demo login. An app that creates accounts is expected to offer in-app account deletion (guideline 5.1.1(v)), so I'm pulling a minimal "Delete my account" button into the beta (AE-5) instead of risking a rejection. **If Apple isn't approved by Thu Oct 22:** Ring 0 runs on Android (internal build) plus Expo Go on Chase's iPhone, the Ring 0 gate drops "external build submitted", and Ring 1 can't start until Apple approves. The Thanksgiving in-person fallback stays.
2. **Capacity and an ephemeral codebase.** The $20 plan ran out today, mid-lane. There are about 7 real agent-days left before Oct 29, and the list needs about 7. Until IN-1 is done, one container reset loses work that only exists here. **Mitigations:** push to GitHub tomorrow; run one lane at a time; commit at the end of every session. Consider a higher plan for the two build weeks only (CH-9).
3. **The first real phone, plus notifications that don't exist yet.** Every native path (resize, save to phone, OTP email, universal links, push and tap-to-open) has only run on the web build. Push and email sending isn't written. Both land in the same 5 days (Oct 19–23). If the device pass (AE-3) turns up more than about 2 days of fixes, Ring 0 slips to Mon Nov 2 and Ring 3 moves to in-person setup at Thanksgiving.

---

## Cut or deferred (decided today)

| Item | Decision | Why |
|---|---|---|
| Video posting (BETA-SHARE-6, video half of SEE-4) | **Out of beta**, unless app-engineer shows on a device by Nov 5 that a transcode removes location (metadata scan, as in SHARE-2) | We can't truthfully send `exif_stripped: true` for iOS video. Photos-only for 12 grandparents is fine. Video goes in v1.0 |
| "Audience sees who hearted it" (BETA-REPLY-1) | Show the count plus "You loved this"; names wait | There's no RPC for names. Not a grandparent blocker |
| Purge worker, export zips | Manual by Chase until v1.0 | Unchanged from BETA-SPEC |
| S11, S13, S14, S15 | v1.0 | No split household in Rings 0–3; S15 fails closed |
| Web viewer (M-06) | Still out | The guide must stop promising "nothing to download" (GU-3) |
| Staging app builds for testers | One production channel plus a "preview" channel for Chase only | Two backends are enough. A third build flavor isn't |

Spec changes are recorded in BETA-SPEC.md under "Amendments, Oct 15 pm".

---

## Work by owner

### Chase (only you can do these)

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| CH-1 | **Apple Developer enrollment** ($99). Confirm the status today. | S | — | Enrollment email received; App Store Connect opens |
| CH-2 | **Accounts:** GitHub (private repo `hearth`), Supabase (2 projects in East US: `hearth-staging`, `hearth-prod`), Backblaze B2 (**US East at signup; the region can't be changed**), Expo, Resend, Google Play Console ($25) | S | — | Each login works; invite the agent's GitHub access (IN-1) |
| CH-3 | **Name check + domain.** USPTO search and App Store search for "Hearth", then buy the domain (the app already expects `hearth.family`) | S | — | Domain registered; DNS reachable |
| CH-4 | **Phone survey** for all ~12 testers: phone model, OS version, email, Google account email for Android users | S | — | Table in `tracker/` is complete. It decides the SDK pin (SDK 54 covers iOS 15.1+, which includes Earl's iPad) and the Play tester list |
| CH-5 | **Key custody.** Write `MEDIA_KEK` (prod) on paper in 2 places plus a password manager; witness the restore drill | S | IN-4 | You've watched a photo decrypt using only the restored key (IN-4 done) |
| CH-6 | **Ring 0 use.** ≥10 posts over ≥2 days (Oct 27–28) from your phone, plus the Android test phone | M | AE-3, IN-7 | qa-tdd's sent count = received count; 0 crashes on TestFlight/Play pages |
| CH-7 | **Testing phone.** Buy a used Galaxy A-series (~$100) if you don't own an Android phone | S | — | It runs the Play internal build. It doubles as June's reference phone |
| CH-8 | **Ring 2 recruiting:** 5 people aged 65+ for the grandparent test (neighbors and church count), plus your wife for Ring 1 | S | — | 5 names with dates between Nov 6 and Nov 12 |
| CH-9 | **Plan capacity:** decide whether to raise the Claude plan for Oct 16–Nov 12 only | S | — | Decision logged |
| CH-10 | **Backblaze no-training letter:** email B2 support asking for the DPA and written confirmation of no ML use | S | CH-2 | The reply is saved in `docs/vendors/` |
| CH-11 | **Help number:** the number behind "Call Chase" (`EXPO_PUBLIC_HELP_PHONE`) | S | — | Set in EAS secrets |

### app-engineer (owns `app/` and backend changes; test-first)

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| AE-1 | **Finish the app lane:** fix the Jest hang; run the contract tests against the real API harness | S | in progress | `npm test` green 3× and exits on its own; `test:contract:real` 19/19 green 3× |
| AE-2 | **Notification sender** (critical path). Amend API.md first: `register_push_token`, `set_notification_prefs`, `my_profile`. Migration 0003: an outbox table filled by a trigger on publish/comment/heart, plus a `notify` edge function on a 1-minute cron that batches (one notice per recipient per post, and per 10 min), sends through Expo Push, and sends email codes and digests through Resend. Payload: sender's first name only, with no photo, caption or child's name | L | AE-1, QA-1, IN-3 | BETA-NOTIFY-2, NOTIFY-4, REPLY-3 auto green 3× on staging; app saves its token and preference to the server (contract test) |
| AE-3 | **First real-device pass:** EAS builds for Chase's iPhone and the Android test phone. Check resize, the EXIF scan, file bytes, encrypted PUT, Save to my phone, OTP sign-in, `hearth.family/join` links, and push tap-to-open from cold and warm starts | L | IN-3, IN-5, IN-6, CH-1 (iOS) | M-07, M-09, M-10 pass on both phones; BETA-JOIN-1, SEE-3, SEE-5, NOTIFY-3 logged as passing on the Test Log |
| AE-4 | **expo-updates + channels:** `runtimeVersion` policy `fingerprint`; channels `preview` (Chase only) and `production` | S | AE-1 | `eas update --channel preview` reaches Chase's phone; a native change forces a new build instead of an update (see IN-9) |
| AE-5 | **Delete my account** (pulled in for Beta App Review): a Me screen button with a confirm step; calls `request_account_deletion()`; Chase does the final purge by hand | S | — | New test `BETA-JOIN-7` (auto): after confirming, the user is signed out and `my_spaces` returns `[]` |
| AE-6 | **TestFlight external submission:** demo account on prod with seeded photos, beta description, privacy policy URL, feedback email | S | CH-1, IN-5, IN-7 | Shows "Waiting for Review" in App Store Connect by Oct 28 |
| AE-7 | **Crash and error reports without trackers:** `ErrorBoundary` and unhandled-promise hooks call a new RPC, `report_client_error` (part of 0003). It stores app version, OS, screen and error, with no user content, rate limited, and kept 30 days | S | AE-2 (same migration) | QA test: a thrown error writes 1 row with no caption, email or URL in it; 0 third-party SDKs in `package.json` (`npx expo-doctor` plus a grep) |
| AE-8 | **S12** (removed members can still edit captions), in 0003 | S | QA-1 | BETA-REPLY-4 auto green (needed by the Ring 2 gate) |
| AE-9 | **Pinch and double-tap zoom** (SEE-4, photo half) | M | AE-3 | BETA-SEE-4 manual pass on both phones (needed by the Ring 2 gate) |
| AE-10 | **NOTIFY-1 latency log:** the app records the time it received a push vs. the post's `created_at`, saved locally and exportable from Help | S | AE-2 | p90 is computed over ≥10 posts in Ring 1 |
| AE-11 | **Ring 1–2 fixes** from triage | M–L | rings | 0 open P0 at each gate; 0 open P0/P1 at Ring 2 |

### qa-tdd

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| QA-1 | Red tests before 0003: NOTIFY-2, NOTIFY-4, REPLY-3, BETA-JOIN-7, S12 (REPLY-4), `report_client_error` scrub | S | — | Each fails first; the red run is saved in `backend/tests/results/` |
| QA-2 | Run all P0 auto criteria 3× on **hosted staging** (SQL suites through `run_supabase.sh` against the hosted DB, plus the Deno smoke test) | S | IN-3, AE-2 | 3 green runs logged; this is the core of the Ring 0 gate |
| QA-3 | Ring 0 accounting: a script compares posts Chase sent against posts received on the test account and the Android phone | S | CH-6 | A report saying sent = received, 0 lost |
| QA-4 | Rewrite the manual cases for the real app: drop M-06 (web viewer); add JOIN-5 (still signed in after 7 days) and NOTIFY-1 | S | — | `suites__manual.json` matches BETA-SPEC |
| QA-5 | **Tracker hygiene:** close S9 and S10 with test IDs; add AE-2 through AE-8 as tickets; mark video and REPLY-1 as deferred | S | — | The Test Log shows today's truth |
| QA-6 | Gate packets for Oct 29, Nov 5 and Nov 12: each criterion with its evidence | S each | rings | The PM can mark each criterion met or not met from the packet alone |

### grandparent-ux

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| GU-1 | Device pass on the Android test phone at maximum font and on an iPhone at the largest Dynamic Type | M | AE-3 | UXG-02/03/04 hold on the device (screenshots); new findings filed as tickets |
| GU-2 | Wording for the push text, the email code mail, the digest, the invite text, and the 22023 sentence (resolve API.md vs JOIN-3 vs the banned word "expired") | S | — | One copy table in UX-REVIEW.md; app-engineer uses it verbatim |
| GU-3 | **Rewrite the printed guide.** It currently promises "nothing to download". The beta needs TestFlight (iPhone) or the Play link (Android). Use real screenshots | M | AE-3 | Guide matches the app screen for screen; printed and **mailed by Nov 10** |
| GU-4 | Run the grandparent test (5 testers aged 65+) | M | CH-8, Ring 1 gate | 4 of 5 pass; logged with phone and times (Ring 2 gate) |

### privacy-security

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| PS-1 | Review 0003: push and email payloads, token storage, error-report scrubbing, outbox access | S | AE-2 | Signed off in the ticket; no child's name, photo URL or caption leaves the database |
| PS-2 | Hosted-stack checks: `cf-connecting-ip` per-IP limit works, the function keeps JWT verification on, the bucket is private, CORS is narrow, the service key isn't in the app bundle | S | IN-3 | Checklist passed on staging and again on prod |
| PS-3 | **Privacy policy + terms**, in plain words: stored in the US, encrypted with keys we hold, no AI training, no ads, the vendor list, deletion. Plus the App Store privacy label and the Play data-safety form | M | CH-3 | Published at `/privacy` and `/terms` (IN-5); both store forms filled in |
| PS-4 | Key backup design: what to back up (`MEDIA_KEK`, invite pepper, B2 keys), where, and the restore procedure | S | — | `docs/runbooks/keys.md`; used in IN-4 |

### infrastructure ("hyper stable, hyper scalable": the must-haves)

Scale is already proven where it matters: the feed is fast at 1M posts. What we lack is the stable part, so spend on that and nothing else.

| ID | Item | Size | Depends on | Done when |
|---|---|---|---|---|
| IN-1 | **Repo.** Make one monorepo at the root (`app/` currently has its own `.git` with 1 commit; fold it in after AE-1 finishes, so the app lane isn't disturbed). Push to a private GitHub repo. Protect `main` with CI required. Add a `.gitignore` that excludes `.env`, keys and `dist-*` | S | CH-2 | `git clone` on a clean machine plus `bash test-all.sh` works; no secret is in the history (`gitleaks` clean) |
| IN-2 | **CI actually running:** `ci.yml` backend job on the real `supabase start` stack (S16) plus the app job (Jest + typecheck). Add a perf smoke at 100k posts weekly, not per push | M | IN-1, AE-1 | 3 consecutive green runs on `main`; **S16 closed**; BETA-SEE-1 met |
| IN-3 | **Staging:** `hearth-staging` (free tier), its own B2 bucket and its own KEK. Migrations reach staging from CI on merge to `main` | M | CH-2, IN-2 | `supabase db push` runs in CI; the smoke test passes against staging |
| IN-4 | **Key backup + restore drill:** prod `MEDIA_KEK` on paper ×2 plus a password manager. Drill: make a fresh project, restore the KEK, decrypt a known staging photo | S | PS-4, IN-3 | Drill note with date and result (Ring 0 gate) |
| IN-5 | **Website on the domain** (static, US host or Cloudflare Pages, no analytics): `/.well-known/apple-app-site-association`, `assetlinks.json`, `/join/*` fallback ("Install Hearth first" with TestFlight/Play links), `/privacy`, `/terms` | M | CH-3, PS-3 | Tapping an invite link on both phones opens the app at Join; Apple's and Google's validators pass |
| IN-6 | **Email:** Resend as custom SMTP for Supabase Auth (the default SMTP only sends to project team members), with SPF, DKIM and DMARC on the domain | S | CH-3 | A sign-in code reaches Gmail, Yahoo/AOL and Frontier inboxes, not spam (NOTIFY-5 setup) |
| IN-7 | **Production:** `hearth-prod` on **Pro from the first real photo** ($25/mo; daily backups, no pausing). Its own B2 bucket, its own KEK, a spend cap on | S | IN-3 | Prod smoke test green; the billing page shows Pro |
| IN-8 | **Backups:** Pro daily backups, plus a weekly `pg_dump` encrypted with `age` to a separate B2 bucket (US East, object lock 30 days). B2 keeps old versions 30 days. A restore drill into a scratch project before Ring 2 | M | IN-7 | Drill note: restored DB row counts match, and one photo decrypts end to end |
| IN-9 | **Over-the-air update discipline** (`docs/runbooks/releases.md`): updates carry JS-only fixes; anything native or touching permissions, crypto, sign-in or audience needs a store build. Every update goes to `preview` (Chase) for 24 h before `production`. No updates during a gate's 48 h. Rollback is `eas update:republish` to the previous group. Each update is logged in the tracker with its ticket ID | S | AE-4 | The runbook exists, and the first production update follows it |
| IN-10 | **Health check without trackers:** a GitHub Actions cron every 30 min calls a `health()` RPC and the function on prod and emails Chase on failure. A weekly digest of `client_errors` counts by version | S | IN-2, AE-7 | A forced failure produces an email within 30 min |
| IN-11 | **Secrets:** all keys in EAS secrets, GitHub Actions secrets and Supabase secrets; none in the repo; the anon key is the only one in the app | S | IN-1 | gitleaks is clean in CI; PS-2 checklist passed |

**Not now (infra):** self-hosted Postgres, a CDN for media, a staging app build for testers, load tests past 1M posts, multi-region. None of them helps 12 grandparents, and scale already tests clean.

---

## After Ring 0: what the later gates need (from BETA-SPEC)

| Ring | Gate | Remaining work it needs |
|---|---|---|
| 1 (Oct 30–Nov 5) | Wife passes JOIN-2 and SHARE-1 unaided; push p90 ≤ 60 s; 0 open P0; Beta App Review approved; Pro on | AE-10, AE-11, AE-6 approved, IN-7 |
| 2 (Nov 6–12) | Grandparent test 4/5; Android install < 10 min; all P0/P1 manual criteria on both platforms; digest reaches the inbox; guide final | AE-8, AE-9, the digest part of AE-2, GU-1, GU-3, GU-4, IN-8, QA-4, CH-8 |
| 3 (Nov 13–22) | 10 of 12 signed in and opened ≥1 post; 0 wrong-audience incidents | Guide mailed Nov 10; setup calls Nov 14–15; Play tester list (CH-4); daily triage |

Fallback (unchanged): if the Ring 1 gate slips past Mon Nov 9, Ring 3 becomes in-person setup at Thanksgiving (Nov 26).

---

## PM operating cadence

### What has to be true for a daily PM run to work

Today the code exists only in this container, so a scheduled run would start in a fresh session with nothing to read. A daily PM agent needs:

1. **A GitHub repo (IN-1).** The scheduled session clones it. The repo holds the code, `BETA-SPEC.md`, `REMAINING.md`, the tracker JSON and the gate packets. Without it, a daily run is blind.
2. **The repo attached to the cloud environment**, with read access, plus push access to one folder, `pm/` (for the daily note).
3. **CI running on GitHub (IN-2).** The PM reads the last 24 h of runs with `gh run list` instead of re-running suites, which is cheap on usage.
4. **Tester logs in the repo.** Export the Hearth Test Log page to `tracker/logs/YYYY-MM-DD.json` (Chase or qa-tdd, 1 minute a day during rings). Help calls go in the same file.
5. **A small daily run.** It is read-only apart from one note, with no builds and no test runs. On a $20 plan, every run costs usage that would otherwise go to the app lane.

### The daily loop (weekdays 7:50 am ET; daily during Ring 3, Nov 13–22)

1. Read `BETA-SPEC.md`, `REMAINING.md`, the tracker, yesterday's `pm/` note, the last 24 h of CI, and new tester logs.
2. **Triage:** give every new item a P0, P1 or P2, a lane, and a "done when". A P0 or a red `main` goes to the top.
3. **Critical path check:** for each critical-path line, mark it on time or slipping, with a new date. If a slip moves a gate, say so on line 1.
4. **Write `pm/YYYY-MM-DD.md`:** at most 15 lines, made of today's 3 handoffs (agent → task → done when), Chase's decisions waiting (with my recommendation), and any risk that changed.
5. **Gate days (Oct 29, Nov 5, Nov 12, Nov 22):** a go/no-go packet instead of the note, with each criterion met or not met with evidence. Never rounded up.
6. Push the note. Chase reads it on his phone in 2 minutes.

**Until the repo exists:** no scheduled run. Chase starts each work session with "PM: daily", and I run the same loop by hand. I also mirror `REMAINING.md` and `CORE-FEATURES.md` into the claude.ai Project so they outlive this container.

**Weekly (Mondays):** re-cut scope against the agent-days left, and update `REMAINING.md`. Anything new defaults to "not now" unless it unblocks a grandparent or closes a privacy risk.
