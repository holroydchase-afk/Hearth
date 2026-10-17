# Hearth: work remaining, by milestone

Owner: staff-pm. Rewritten Fri Oct 16, 2026 (overnight) around the milestones in `docs/product/ANCHORS.md`, which supersede the Ring 0–3 plan. Scope and acceptance criteria live in `docs/product/BETA-SPEC.md` (see its "Milestone map and trace" table for which BETA-* each milestone needs). Product scope beyond that is in `docs/product/CORE-FEATURES.md`.

**Bottom line:** Milestone 1 (Chase uses Hearth end to end) is mostly blocked on Chase, not code. Backend, notification sender and app are built and green locally; nothing is deployed and nothing has run on a real phone. The shortest path: deploy to the one existing Supabase project, run the app on Chase's iPhone, post for 2 days. Milestone 2 (Danielle posting too) adds the email sender domain, invite links and a build she can install.

**Dates.** The ring dates (Ring 0 gate Oct 29, Ring 1 Nov 5, Ring 2 Nov 12) are **dropped**: they were gates for rings that no longer exist. Milestones have no dates. **Nov 22 / Thanksgiving (Nov 26) is kept only as a soft target** for milestones 3–4, because Thanksgiving is the one in-person setup chance with WV family. Whether it's still a target is a decision for Chase.

Sizes: **S** = under half an agent-day · **M** = about 1 agent-day · **L** = 2–3 agent-days. $20 plan: one lane at a time.

---

## Where things stand (Oct 16, overnight)

| Area | State | Evidence |
|---|---|---|
| Backend API | Done locally | 110 RLS + 130 API + 46 NOTIFY SQL tests green; Deno 17; `get_feed` p95 < 2 ms at 1M posts |
| Notification sender (AE-2) | Built, not deployed | Migration 0003 outbox + batching; `notify` edge function (Expo Push + Resend). No cron yet |
| App | Built, web only | Jest 179 + 1 skipped; typecheck clean; web e2e 1 passed (was 3/3; check). App does not yet call `register_push_token` / `set_notification_prefs` |
| Repo + CI | Repo exists (github.com/holroydchase-afk/Hearth) | CI green status unverified; S16 open until it is |
| Hosted stack | One Supabase project exists, nothing deployed | Blocked on network allow-list + `SUPABASE_ACCESS_TOKEN` (HANDOFF item 3) |
| Real phones | Never run | Resize, EXIF scan, save to phone, OTP, links, push all unverified on a device |
| Video | Off (`VIDEO_POSTING_ENABLED=false`) | iOS location can't be stripped without a transcoder |

---

## Milestone 1: Chase uses it end to end

**Gate (all must be met; evidence in BETA-SPEC "Milestone gates"):** every M1 `auto` criterion green 3× against the hosted project; M1 `manual` criteria logged as passing on Chase's iPhone; ≥10 posts over ≥2 days from Chase's iPhone to a second test account, 0 lost; 0 crashes; `MEDIA_KEK` written down in 2 places.

"End to end" needs a receiver. Chase uses a second account (a second email) on a second device or the web build to receive, heart and comment, so NOTIFY-3 and REPLY-3 can be exercised alone.

### Critical path (in order)

| # | Item | Owner | Needs Chase? | Blocks |
|---|---|---|---|---|
| 1 | CI green on GitHub Actions → S16 closed (IN-2) | infra (Claude) | No | SEE-1 |
| 2 | App calls `register_push_token` + `set_notification_prefs` (contract test first) | qa-tdd → app-engineer | No | NOTIFY-2/3 on device |
| 3 | 0004 migration test-first: `report_client_error` (OPS-1, AE-7) + S12 (REPLY-4, AE-8) | qa-tdd → app-engineer | No | OPS-1, REPLY-4 |
| 4 | **Access for deploys:** allow `mcp.supabase.com`, `api.supabase.com`, the project host; add `SUPABASE_ACCESS_TOKEN` | **Chase** | Yes (10 min) | 5 |
| 5 | **Backblaze B2 account, US East** (region can't change) + bucket keys into Supabase secrets; `MEDIA_KEK` on paper ×2 (CH-5) | **Chase** | Yes (30 min, ~$0 at this size) | 6 |
| 6 | `bash backend/scripts/deploy.sh` (migrations + cron via the Management API); deploy `sign-media` + `notify`; 1-minute cron; smoke test green on hosted | infra (Claude) | No, after 4–5 | 7, QA-2 |
| 7 | **App on Chase's iPhone.** First try Expo Go (all current deps are Expo Go SDK 54 modules; push and links need checking). If Expo Go can't do push or tap-to-open, an EAS dev build needs the **Apple Developer account ($99, CH-1)** | app-engineer + **Chase** | Yes (install; maybe $99) | 8 |
| 8 | Device pass on the iPhone: resize, EXIF scan (M-09), encrypted PUT, Save to phone, OTP code, push tap-to-open cold/warm (AE-3, iPhone half) | app-engineer, qa-tdd | Chase holds the phone | gate |
| 9 | QA-2: all M1 auto criteria 3× on hosted; QA-3 sent-vs-received script | qa-tdd | No | gate |
| 10 | **Chase posts ≥10 times over ≥2 days**; receives on the second account (CH-6) | **Chase** | Yes | M1 gate |

Email codes at M1: Supabase's built-in mailer only sends to project team members, which Chase is. So Resend and the domain are **not** on the M1 path.

### Work for M1 that needs no accounts or money (Claude, overnight)

1. CI green, S16 closed (IN-2).
2. App wiring for `register_push_token` / `set_notification_prefs`, contract test red first.
3. Migration 0004 test-first: OPS-1 (`report_client_error`, scrubbed) and REPLY-4 (S12).
4. Expo Go feasibility check: does the app (crypto, image pipeline, push token, `hearth://` links) run in Expo Go SDK 54? Decides whether $99 is needed at M1.
5. Investigate web e2e 1 passed vs 3/3.
6. QA-3 sent-vs-received script; QA-5 tracker hygiene (close S9, S10; add AE-2..AE-8; mark video and REPLY-1 deferred).
7. Red tests for the two new proposed criteria, BETA-NOTIFY-7 (named sender) and BETA-AUD-7 (no last-active data).
8. GU-2 copy table (push, code email, invite text, the refused-invite sentence), every message naming a real person ("From Chase on Hearth").
9. A one-page "M1 setup, in order" checklist for Chase (exact clicks for steps 4, 5, 7), so his part fits in one nap time.

### M1 work that needs Chase

| ID | Item | Cost | Notes |
|---|---|---|---|
| CH-A | Network allow-list + `SUPABASE_ACCESS_TOKEN` (HANDOFF item 3) and the secrets in item 4 | $0 | Unblocks every deploy |
| CH-2 (part) | Backblaze B2, US East | ~$0 | Supabase project already exists; Expo account (free) for builds |
| CH-5 | `MEDIA_KEK` on paper ×2 + password manager | $0 | Restore drill (IN-4) moves to M3 |
| CH-1 | Apple Developer enrollment | $99 | Only if Expo Go fails item 7; certainly needed by M3 (TestFlight) |
| CH-6 | ≥10 posts over 2 days | time | The M1 gate |
| CH-11 | Help phone number | $0 | Can wait to M3 |

---

## Milestone 2: Danielle posts too; both family sides work

**Gate:** Danielle signs in from an invite and posts unaided (JOIN-2, SHARE-1, stopwatch); both of them post to both family sides' groups (Chase's WV side, Danielle's Charleston side) with 0 cross-side leaks; AUD-1 answered correctly by both; AUD-6 audience change works; NOTIFY-1 p90 ≤ 60 s over ≥10 posts; REPLY-3 notices reach the poster; 0 open P0.

| # | Item | Owner | Needs Chase? |
|---|---|---|---|
| 1 | Name check + domain (CH-3) | **Chase** (~$15/yr) | Yes |
| 2 | Resend + SPF/DKIM/DMARC so codes reach Danielle's inbox (IN-6) | infra after CH-3; **Resend account (free tier)** | Yes (account) |
| 3 | Website: `/join/*`, AASA, `/p/<id>` (IN-5, minus privacy policy) | infra | No, after 1 |
| 4 | A build Danielle can install: Expo Go (if M1 proved it) or TestFlight **internal** testing (she's added as an App Store Connect user; no Beta App Review) | app-engineer + **Chase** | Yes |
| 5 | AE-10 push latency log (NOTIFY-1); AE-4 expo-updates channels | app-engineer | No |
| 6 | Danielle's **adult** (poster) invite plus both sides' groups, seeded by Claude via SQL from Chase's list. The app can only invite viewers and can't create groups; no setup UI in scope | infra + **Chase gives the list** | Yes (list) |
| 7 | Triage fixes from Danielle's use (AE-11) | app-engineer | No |

---

## Later milestones (not planned in detail; re-cut when M2 passes)

| Milestone | New work it pulls in |
|---|---|
| 3. Most tech-savvy relative | Apple enrollment + TestFlight **external** (AE-6) → Beta App Review → Delete my account (AE-5, JOIN-7) and a plain privacy policy page (PS-3, no legal review); Supabase Pro + key restore drill (IN-7, IN-4, IN-8); JOIN-5, SEE-5, NOTIFY-4 |
| 4. Everyone else by savviness | Printed guide (GU-3), grandparent test (GU-4), JOIN-6, SEE-2, SEE-4, NOTIFY-5 digest, REPLY-5; **A2 "Seen by" decision due before this**; Thanksgiving setup if Chase keeps the soft date |
| 5. Android grandpas | Android test phone (CH-7), Play Console $25, Android device pass (AE-3 Android half, GU-1), Android install < 10 min |
| 6. Smart frame | Check whether the Aluratek model takes photos by email or shared link; skip if app-only |
| 7. Decide | Costs, problems hit, whether to go further. Funding, pricing, pentest, legal, self-hosted auth (A3 gap) live here |

---

## Reflection point (staff-pm, Oct 16)

**Trigger: pause and review the milestones at whichever comes first:**
1. The milestone 1 gate is met (Chase's 2-day demo done), or
2. **2 work sessions in a row with no deploy and no device run**, or
3. Any work item that isn't a BETA-* criterion or a step on the M1/M2 critical path.

**Checklist (10 minutes, staff-pm writes it, Chase reads it):**
- Which milestone gate lines are met, with evidence? Which are not?
- What blocked the last 2 sessions: code, Chase, money, or access?
- Is the next code task on the critical path, or is it polish? If polish, stop.
- Do any open Chase decisions now block the next milestone?
- Does the next milestone still make sense (order, scope, the Nov 22 soft date)?

**Tonight (Oct 16 late), in order:** (1) BETA-REPLY-6 comment wording, red test first; (2) device readiness without a device: `expo export` for iOS and Android, `expo-doctor`, Expo Go yes/no per native path; (3) the M1 setup-and-demo page for Chase, with the M2 SQL seed for Danielle attached. Not tonight: the printed guide (GU-3, M3/M4; screens will change after the device run).

**Status Oct 16 (late):** the code-only M1 list is done (push-token wiring, NOTIFY-7, AUD-7, REPLY-4, OPS-1, pushed with 3 green runs). Trigger 2 is now armed: no backend or test work until a deploy or a device run, except the M1 setup-and-demo doc and the deploy script.

## Risks to milestones 1–2

1. **Chase's time is the bottleneck, not code.** Every remaining M1 blocker is an account, a secret or holding the phone. Mitigation: one checklist, ordered, under 1 hour total (overnight item 9).
2. **First real phone.** Native paths have only run on web. Budget 1–2 agent-days of device fixes.
3. **Apple.** Moved off the M1 path if Expo Go works; firmly on the M3 path (external TestFlight needs Beta App Review, account deletion and a privacy policy URL). Enroll by the time M2 starts; it can take 2 days to 3+ weeks.
4. **Free-tier Supabase with real photos.** No daily backups and it pauses after a week idle. Acceptable for M1–2 (originals are on the parents' phones); Pro ($25/mo) before the first relative at M3.

---

## Cut or deferred

| Item | Decision | Why |
|---|---|---|
| Ring dates Oct 29 / Nov 5 / Nov 12 | **Dropped** | Rings superseded by milestones |
| Staging project (IN-3) | **Deferred to M3**; one hosted project for M1–2 | Two posters don't need two backends; tests run locally and in CI |
| Supabase Pro, backups, restore drill (IN-7, IN-8, IN-4) | **M3** | No relative data before then; KEK on paper from M1 |
| Beta App Review, Delete my account, privacy policy page | **M3** | Only external TestFlight needs them |
| Android phone, Play Console | **M5** | Milestone order; iPhone side first |
| Video (SHARE-6, video half of SEE-4) | Still out until a transcode proves location-free | Unchanged. Note: video is a named story problem (stepmom, in-laws), not a nice-to-have. Revisit at M4 |
| REPLY-1 names | Count + "You loved this" | Unchanged |
| Purge worker, exports, S11/S13/S14/S15, web viewer | Unchanged (v1.0 / out) | |

Spec changes are in docs/product/BETA-SPEC.md under "Milestone map and trace (Oct 16)". The Oct 15 work tables below keep their IDs; their Ring wording is historical, and the milestone each item now belongs to is in the tables above.

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
| AE-2 | **Notification sender** (critical path). Amend docs/eng/API.md first: `register_push_token`, `set_notification_prefs`, `my_profile`. Migration 0003: an outbox table filled by a trigger on publish/comment/heart, plus a `notify` edge function on a 1-minute cron that batches (one notice per recipient per post, and per 10 min), sends through Expo Push, and sends email codes and digests through Resend. Payload: sender's first name only, with no photo, caption or child's name | L | AE-1, QA-1, IN-3 | BETA-NOTIFY-2, NOTIFY-4, REPLY-3 auto green 3× on staging; app saves its token and preference to the server (contract test) |
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
| GU-2 | Wording for the push text, the email code mail, the digest, the invite text, and the 22023 sentence (resolve docs/eng/API.md vs JOIN-3 vs the banned word "expired") | S | — | One copy table in docs/product/UX-REVIEW.md; app-engineer uses it verbatim |
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

## PM operating cadence

### What has to be true for a daily PM run to work

Today the code exists only in this container, so a scheduled run would start in a fresh session with nothing to read. A daily PM agent needs:

1. **A GitHub repo (IN-1).** The scheduled session clones it. The repo holds the code, `docs/product/BETA-SPEC.md`, `docs/product/REMAINING.md`, the tracker JSON and the gate packets. Without it, a daily run is blind.
2. **The repo attached to the cloud environment**, with read access, plus push access to one folder, `pm/` (for the daily note).
3. **CI running on GitHub (IN-2).** The PM reads the last 24 h of runs with `gh run list` instead of re-running suites, which is cheap on usage.
4. **Tester logs in the repo.** Export the Hearth Test Log page to `tracker/logs/YYYY-MM-DD.json` (Chase or qa-tdd, 1 minute a day during rings). Help calls go in the same file.
5. **A small daily run.** It is read-only apart from one note, with no builds and no test runs. On a $20 plan, every run costs usage that would otherwise go to the app lane.

### The daily loop (weekdays 7:50 am ET; daily during Ring 3, Nov 13–22)

1. Read `docs/product/BETA-SPEC.md`, `docs/product/REMAINING.md`, the tracker, yesterday's `pm/` note, the last 24 h of CI, and new tester logs.
2. **Triage:** give every new item a P0, P1 or P2, a lane, and a "done when". A P0 or a red `main` goes to the top.
3. **Critical path check:** for each critical-path line, mark it on time or slipping, with a new date. If a slip moves a gate, say so on line 1.
4. **Write `pm/YYYY-MM-DD.md`:** at most 15 lines, made of today's 3 handoffs (agent → task → done when), Chase's decisions waiting (with my recommendation), and any risk that changed.
5. **Milestone gate days (when Chase says a milestone is ready):** a go/no-go packet instead of the note, with each criterion met or not met with evidence. Never rounded up.
6. Push the note. Chase reads it on his phone in 2 minutes.

**Repo now exists (Oct 15); until CI and logs are wired:** no scheduled run. Chase starts each work session with "PM: daily", and I run the same loop by hand. I also mirror `docs/product/REMAINING.md` and `docs/product/CORE-FEATURES.md` into the claude.ai Project so they outlive this container.

**Weekly (Mondays):** re-cut scope against the agent-days left, and update `docs/product/REMAINING.md`. Anything new defaults to "not now" unless it unblocks a grandparent or closes a privacy risk.
