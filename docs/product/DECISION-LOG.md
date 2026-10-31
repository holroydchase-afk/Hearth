# Hearth decision log

Every decision that shaped Hearth, with the reason and what we chose it over, in one place. Started Oct 19, 2026 at Chase's ask, rebuilt from the repo, PR history and project memory.

**What it's for.** Telling Hearth's story: paste this file (or one section) into Claude and ask "tell the story of how Hearth's stack came together" or "why did we pick Supabase?". Each entry stands alone so it can be quoted.

**How to add one.** When Chase makes a call, or a thread makes one he approves, add an entry in the same PR, newest at the bottom of its section, with the next free `DEC-n`. Keep each line short. Mark any reason nobody wrote down at the time as *(inferred)*. Don't rewrite an old entry when a decision changes: add a new one that says "Replaces DEC-n" and set the old one's status to "Replaced by DEC-n", so the story keeps its turns.

**Not here.** The full persona checks stay in `docs/product/decisions/` (an entry links to its file). Questions still waiting on Chase live in `TRACKER.md` "Decisions waiting on Chase" (D1–D12); an answered one moves here. Vendor prices and sources are in `docs/eng/research.md`.

Status: **Built** (in `main`), **Decided** (agreed, not built yet), **Replaced** (superseded by a later entry).

---

## Product direction

### DEC-1 · Proof of concept first, milestones by person
- **When / status:** Oct 16, 2026 · Decided
- **Chose:** a proof of concept, a birthday present Chase builds for himself and for job experience. Milestones go by person: Chase, then his wife, then the most tech-savvy relative, then everyone else by savviness, then Android, maybe a smart frame, then decide on costs.
- **Over:** a startup-style plan (Ring 0–3 gates, funding, pricing).
- **Because:** the problems are Chase's own family's; proving it works for them comes before any business question. Funding, pricing, self-hosted auth, pentest and legal wait for milestone 7.
- **Source:** `docs/product/ANCHORS.md` "Milestones"

### DEC-2 · Four anchors every feature is checked against
- **When / status:** A1–A3 Oct 16, A4 Oct 18 · Decided
- **Chose:** A1 Anxiety-less, A2 Guilt-free, A3 Stays on US soil, A4 White-paper ready.
- **Because:** split families need to trust who sees what (A1), and neither side should be able to tell whether the other is engaging (A2). A3 because parents worry about kids' photos leaving the US. A4 because the audience is privacy-minded tech people who will check claims against the code.
- **Source:** `docs/product/ANCHORS.md` "Anchors"

### DEC-3 · Invite-only, no public sign-up or "start a family" in the app
- **When / status:** Oct 16 · Built
- **Chose:** you join only with an invite code; families are set up by script for now.
- **Over:** an in-app "Start a family" screen (deferred to milestone 7).
- **Because:** keeps Hearth exclusive to people the family trusts (A1), and there is only one family to set up during the proof of concept.
- **Source:** `HANDOFF.md` Oct 16 morning (staff-pm call)

### DEC-4 · Milestone 1 runs fully in Expo Go; push moves to milestone 2
- **When / status:** Oct 17 · Built
- **Chose:** run milestone 1 in the free Expo Go app, with email notices.
- **Over:** paying $99 for the Apple Developer account up front to get push notifications.
- **Because:** Expo Go can't receive push from our server, but everything else works in it. That takes the $99 and Apple's approval wait off the milestone 1 path.
- **Source:** PR #15, `docs/product/MILESTONE-1.md`

### DEC-5 · One to-do list: the tracker
- **When / status:** Oct 17 · Built
- **Chose:** `docs/product/TRACKER.md` is the single list of what's next; every thread updates it in the same PR.
- **Over:** to-dos spread across HANDOFF, REMAINING and thread replies.
- **Because:** Chase follows from his phone between other things; one list means nothing gets lost between threads.
- **Source:** PR #16

### DEC-6 · Persona check before any product decision is final (TDPM)
- **When / status:** Oct 19 · Built
- **Chose:** every product decision gets one Green/Red row per persona, and every Red needs a mitigation or Chase's override. CI enforces it.
- **Because:** test-driven product management, the same idea as writing the failing test first. It catches the grandparent or Android relative a decision would leave behind before it's built.
- **Source:** PR #24, `docs/product/PERSONA-CHECK.md`, `scripts/check-persona-checks.sh`

### DEC-7 · Open source under AGPL-3.0, public after milestone 1 and a final name
- **When / status:** Oct 19 · Decided (PR #26)
- **Chose:** AGPL-3.0, keeping dual licensing possible.
- **Over:** MIT, and a personal or family-only license.
- **Because:** MIT lets someone ship a closed clone; a family-only license isn't real open source. AGPL suits a self-hostable, privacy-first product for dev and product folks, with a hosted plan to pay for it.
- **Source:** PR #26, `docs/product/decisions/2026-10-19-license-agpl.md`

### DEC-27 · Native look: Apple's guidelines on iPhone, Material 3 on Android
- **When / status:** Oct 19 · Built (PR #30; Chase picked "All now")
- **Chose:** follow Apple's Human Interface Guidelines on iPhone and Material Design 3 on Android (system fonts, components, icons, sheets), with Hearth's stricter rules winning where they differ: 17 pt text, 48 pt tap targets, words under every icon, no gesture-only actions.
- **Over:** a custom Hearth look on both phones.
- **Because:** Chase: "go 100% apple UI/UX … that should make it intuitive out of the gate without us guessing." Familiar system screens are easier to explain over the phone, Dynamic Type and screen readers work for free, and the guidelines are guardrails we don't have to invent. Same features, photos and words on both phones; only the look differs.
- **Source:** `docs/product/DESIGN-SYSTEM.md`, `docs/product/decisions/2026-10-19-native-design-system.md`, TRACKER D14

## Stack

### DEC-8 · Expo (React Native, TypeScript) for iPhone, Android and web
- **When / status:** Oct 15 · Built
- **Chose:** one Expo codebase for iPhone, Android and a web viewer, TypeScript strict.
- **Over:** native Swift and Kotlin apps. Flutter was never compared on paper.
- **Because:** one codebase covers the iPhone parents, the Android grandpas and a browser link for relatives who won't install anything. EAS's free tier covers early builds, Expo Push is free, and over-the-air updates reach Chase's phone without a store build. *(Inferred:* TypeScript in the app, the tests and the Supabase functions means one language for a solo builder, and Expo Go let milestone 1 skip the $99 Apple account, DEC-4.)
- **Trade-off:** Expo Go supports only the newest SDK, which drops older iPhones (DEC-22). HEIC and video transcoding need a dev build later.
- **Source:** `docs/eng/research.md` §0, `docs/product/PLAN.md`

### DEC-9 · Supabase (Postgres, Auth, Edge Functions) in East US
- **When / status:** Oct 15 · Built
- **Chose:** Supabase for the database, sign-in and server functions.
- **Because:** access rules live in Postgres row-level security, so "a post you can't see doesn't exist for you" is enforced by the database, not app code. It was the only vendor with an explicit contract clause against training AI on customer data. Free tier for the beta, Pro ($25/mo) before real launch.
- **Trade-off:** Supabase stores logs and telemetry outside the US and contracts through a Singapore entity, so the honest promise is "stored in the US", not "never leaves the US" (DEC-10). Closing that means self-hosted Postgres later.
- **Source:** `docs/eng/research.md` §0 and §4, `docs/architecture/01-system-overview.md`

### DEC-10 · Promise "stored in the US", not "never leaves the US"
- **When / status:** Oct 15 · Decided
- **Chose:** claim only what's true today: database and photos stored in US regions.
- **Because:** Supabase's logs, support access and push delivery through Apple and Google cross borders. The white-paper readers will check.
- **Source:** `docs/product/PLAN.md`, `docs/architecture/01-system-overview.md` "Residency", `docs/product/MARKETING.md` claims register

### DEC-11 · Backblaze B2 (US East) for photos
- **When / status:** Oct 15 · Built (keys pending, tracker step 6)
- **Chose:** Backblaze B2 in US East, behind an S3-compatible layer.
- **Over:** Cloudflare R2 (kept as the fallback, `us` jurisdiction) and Supabase Storage.
- **Because:** B2 storage costs about half of R2's, and family viewing stays inside B2's free download allowance. The region is fixed at account creation, so a US account stays in the US by construction. Supabase Storage charges $0.09/GB to download and caches through a global CDN outside the region.
- **Trade-off:** B2's terms let it use files to "improve" its service, so photos are encrypted before they reach it (DEC-14).
- **Source:** `docs/eng/research.md` §0, §1, §4

### DEC-12 · Resend for email, Expo Push for push
- **When / status:** Oct 15 · Built (Resend live for sign-in codes Oct 18)
- **Chose:** Resend's free tier for sign-in codes and notices; Expo Push for push notices (milestone 2).
- **Over:** Amazon SES (cheaper past about 3,000 emails a month; move then).
- **Because:** Resend is free at family size, simple, and keeps account data in the US. Expo Push is free and holds content only in memory. Notices carry names and counts only, never photos, captions or comments.
- **Source:** `docs/eng/research.md` §0 and §3

### DEC-13 · Deploy through Supabase's Management API, with one token
- **When / status:** Oct 16 · Built
- **Chose:** `deploy.sh` applies migrations, cron jobs and functions through the Management API, needing only `SUPABASE_ACCESS_TOKEN`.
- **Over:** `supabase db push`, `psql` and Docker, which need a database password.
- **Because:** Claude's cloud sessions have no Docker, and a single scoped token is safer to keep in the environment than a database password.
- **Source:** PR #1, PR #2, `HANDOFF.md` Oct 16 afternoon

## Privacy and security

### DEC-14 · Encrypt photos on the phone; server holds the keys (for now)
- **When / status:** Oct 15 · Built
- **Chose:** each photo is encrypted on the phone with its own AES-256-GCM key; the server wraps those keys under one master key (`MEDIA_KEK`). Deleting a post deletes its keys.
- **Over:** plain storage (the vendor could read photos), and full end-to-end encryption for v1.
- **Because:** the storage vendor only ever holds ciphertext, the strongest guarantee available without making key loss a family's problem. End-to-end is the later family vault (DEC-16).
- **Trade-off:** Hearth's server can unlock every photo. We never call this "end-to-end".
- **Source:** `docs/architecture/03-encryption-and-keys.md`

### DEC-15 · Strip location and camera data on the phone, configurable, default strip
- **When / status:** strip Oct 15; policy value Oct 19 · Built
- **Chose:** a media policy with `location: strip | keep | extract`, default `strip`; colour profile kept; 2048 px JPEG for milestone 1.
- **Because:** a kid's photo shouldn't reveal where they live (A1). Chase asked for configurable infrastructure so location features can come later without rework. Colour profile kept so photos look as they did on the iPhone. 2048 px loads on one bar of LTE; full size is one value later.
- **Source:** `docs/product/SPEC-MEDIA.md` D2, D6, D7; `docs/product/decisions/2026-10-19-media-*.md`

### DEC-16 · Family vault (end-to-end encryption) later, as a higher tier
- **When / status:** Oct 17 · Decided, after the beta
- **Chose:** an opt-in end-to-end encrypted vault as a later, paid tier, rolled out slowly.
- **Because:** real end-to-end makes key loss permanent and blocks server features like search; families should choose it knowingly. Smaller steps (per-family keys, a "what Hearth can see" page) come first.
- **Source:** PR #14, `TRACKER.md` "Privacy path"

### DEC-17 · No third-party analytics, crash or ad SDKs
- **When / status:** Oct 16 · Built
- **Chose:** our own error-report table with fixed fields only, kept 30 days.
- **Over:** Sentry, Crashlytics or any analytics SDK.
- **Because:** no media or metadata goes to any analytics service (CLAUDE.md rule 2), and the claim "no trackers" has to be checkable in the code.
- **Source:** migration 0006, `docs/architecture/01-system-overview.md`

### DEC-18 · AI off by default, every feature behind an off-switch
- **When / status:** Oct 17 and Oct 18 · Decided; "over a paid AI tier" replaced by DEC-37
- **Chose:** each AI feature is a family add-on a parent turns on, with a Hearth-wide kill switch and per-role permission. Any in-picture analysis runs on the phone only. Nothing on family media is ever used for training.
- **Over:** AI on for everyone, or a paid AI tier. *(The paid-tier part is replaced by DEC-37, Oct 23.)*
- **Because:** "no AI on our kids' photos" is a reason families pick Hearth. Small quiet helpers (bulk-upload audience suggestions, duplicates) are welcome only if they can be switched off and never act without asking.
- **Source:** `docs/product/AI-FEATURES.md`, `/mnt/project-files/plans/v1-groups-plan.md`

### DEC-31 · AI positioning: on-device only, opt-in (option B)
- **When / status:** Oct 19 · Decided; build waits on Chase's go (`AI-FEATURES.md` "Build plan")
- **Chose:** the public promise moves from "no face scanning, tagging or ML of any kind" (CF-10) to "AI is off until your family turns it on. Then it runs only on your phones, and your photos never train anyone else's AI."
- **Over:** A, no ML anywhere (loses duplicates, best shot, people suggestions); C, server-side AI under a no-training contract (breaks Never build #3 and the simple story).
- **Because:** Chase's top AI asks (people → group suggestions, duplicates) need in-picture analysis, and on-device keeps the photo on the phone (A3). The wording leaves room for a personal model that learns only on a family's own phones (AI-8), which Chase wants kept possible.
- **Trade-off:** "No AI at all" was easier for a tech reader to check, so a CI allowlist for ML libraries (AI-P0.1) comes first. Face features still need privacy-security and a legal read (Illinois BIPA) before they're built.
- **Source:** `docs/product/decisions/2026-10-19-ai-on-device-opt-in.md`, TRACKER D6

### DEC-37 · Free, open base; AI is a paid subscription
- **When / status:** Oct 23 · Decided; the gate is built in AI-P0.2. Replaces DEC-18's "over a paid AI tier"
- **Chose:** Chase: "I want the base to be free and open and the ai to be paid." Every AI feature, built or planned, checks a separate AI subscription for the family, apart from the storage plan (CF-26) and the vault. Defaults Claude picked, open to Chase: the no-model photo helpers stay free, and AI code stays open source (AGPL). The subscription is sold on Hearth's hosted service, and self-hosters run it free.
- **Over:** AI free inside the family plan; AI code in a closed module (open core).
- **Because:** the base (posting, groups, the co-parent link, grandparents) is the wedge and must spread without a paywall. AI is the clearest extra a parent will pay for. Keeping the AI code open keeps the AGPL and developer-edition story simple and lets a tech reader check the on-device promise.
- **Trade-off:** on-device AI costs Hearth almost nothing to run, so the price buys convenience, updates and model downloads, not compute. A self-hoster gets AI free. Apple and Google require their in-app purchase for this subscription.
- **Source:** `docs/product/decisions/2026-10-23-ai-paid-tier.md`, `AI-FEATURES.md` AI-R8 and AI-P0.2

## Sharing and the people model

### DEC-19 · Plain groups, no required family shape
- **When / status:** Oct 18 · Decided (building)
- **Chose:** a group is a plain list of people; anyone can be in several groups. Events copy people in from groups once.
- **Replaces:** the Oct 17 fixed shape (Everyone, sides, households, events; migration 0011).
- **Because:** real split families don't fit one hierarchy (Danielle's sister belongs in two houses). Plain groups cover every case with less to explain.
- **Source:** `/mnt/project-files/plans/v1-groups-plan.md`, PR #22

### DEC-20 · Who reads a comment: three settings per group
- **When / status:** Oct 16 → Oct 17 → Oct 18 · Decided (building)
- **Chose:** each group is **Private** (parents, the poster and the writer read it), **Shared on this group's posts**, or **Always shared**. Readers are fixed when the comment is written, and the comment box names them.
- **Replaces:** everyone on the post reads every comment (Oct 15), then parents-only by default (Oct 16, migration 0009), then by household (Oct 17).
- **Because:** the story's core worry: one grandparent's comment shouldn't land in front of the other side of the family (A2). Two "shared" values so a birthday group's chatter doesn't spill onto Everyone posts.
- **Source:** `/mnt/project-files/plans/v1-groups-plan.md`, `docs/product/SPEC-GROUPS.md` §6

### DEC-21 · Hearts, comments and per-photo reactions; drop "Seen by"
- **When / status:** Oct 19 · Decided (proposed resolution awaits Chase's OK)
- **Chose:** per-photo heart, comment and a fixed set of emoji; remove "Seen by N of M".
- **Because:** a returned heart proves the photo arrived without counting who didn't look (A2). Emoji sit behind a worded "More" button so the heart stays one tap.
- **Source:** `docs/product/decisions/2026-10-19-reactions-drop-seen-by.md`

### DEC-26 · Built-in messenger, end-to-end encrypted with MLS
- **When / status:** Oct 19 · Built (PR #29; hosted deploy and on-phone check pending)
- **Chose:** group and event chat inside Hearth, encrypted end to end with MLS (RFC 9420, the IETF group-chat standard), using the pure-TypeScript ts-mls library on Hearth's own noble crypto so it runs in Expo Go.
- **Over:** linking out to Signal (every relative would need to install Signal), and Signal's open library, libsignal, on our own servers.
- **Because:** Chase wanted a built-in messenger ("maybe we use Signal"). Signal's network has no API for other apps. MLS is built for groups, removing someone is cheap, and the same group keys can later protect the family vault (DEC-16). A chat belongs to one group or event, so nobody can message someone they can't see, and there are no read receipts, typing dots or last-seen (A2).
- **Trade-off:** it widens milestone 1 against the Oct 17 focus; Chase chose that knowingly and it sits behind a Messages button. An outside audit and safety numbers are still open.
- **Source:** `docs/product/decisions/2026-10-19-messenger-mls.md`, `docs/product/SPEC-MESSENGER.md`, `docs/architecture/06-messenger.md`, TRACKER D13

## Engineering practice

### DEC-22 · Expo SDK 57, and versions only from the vendor's live page
- **When / status:** Oct 18 · Built
- **Chose:** SDK 57, plus a CI check that our SDK matches what App Store Expo Go runs.
- **Because:** SDK 54, picked from memory, wouldn't open in Expo Go on Chase's iPhone. Rule since: look versions up live, and a build is ready only once a phone opened it.
- **Trade-off:** SDK 56+ needs iOS 16.4, so iPhone 7, 6s and SE (1st gen) can't run Hearth.
- **Source:** `docs/eng/LESSONS.md` Oct 18, PR #24

### DEC-23 · Test first, with the ticket ID in the test's name
- **When / status:** Oct 15 · Built
- **Chose:** a failing test first, then the fix; the full suite runs 3 times before anything is called done.
- **Because:** privacy bugs (a relative seeing the other household's posts) must be caught by a test, not by a grandparent. On day 2 it found 10 prototype bugs and 7 backend holes.
- **Source:** `CLAUDE.md` rule 1, `docs/product/PLAN.md` "Day 2"

### DEC-24 · The app talks to one contract with a real and a fake backend
- **When / status:** Oct 15 · Built
- **Chose:** a `HearthApi` interface with a Supabase and a Fake implementation; the backend exposes a small set of Postgres functions (RPCs) instead of raw table access.
- **Because:** screens can be tested fast without a server, and contract tests prove both sides agree. RPCs keep every access check in the database.
- **Source:** `docs/eng/API.md`, `app/src/api/`

### DEC-25 · Claude merges only on Chase's word, with merge commits
- **When / status:** Oct 17 · Built
- **Chose:** a PR merges only when Chase says so and CI is green; no rebases or force-pushes.
- **Because:** Chase is the only human reviewer, and merge commits keep every thread's branch valid.
- **Source:** `docs/eng/MERGING.md`

### DEC-28 · Freeze lifted; a review-driven sequence to milestone 2
- **When / status:** Oct 21 · Decided
- **Chose:** the Oct 19 build freeze ends now that the app is on Chase's phone. The staff PM, UI/UX, engineering and security lanes reviewed the app from the code, and one ranked list (`TRACKER.md` "Sequence to milestone 2") replaces ad-hoc picks. A recurring 2:15am run works it night after night.
- **Over:** building the next feature from the ideas log.
- **Because:** Chase's bar is "a world class, very fast, very stable product". Measuring and ranking first keeps the work on what Danielle (M2) will feel.
- **Source:** `docs/product/reviews/2026-10-21-app-review.md`

### DEC-29 · Speed architecture A1 to A4; no-model photo helpers specced now
- **When / status:** Oct 21 · Approved (A2 built Oct 21)
- **Chose:** A1 native encryption in the app's own build, JavaScript in Expo Go; A2 parallel sending and preparing the next post during upload; A3 Photos kept on the phone (encrypted files, keys in the keychain); A4 resumable video uploads. Spec AI-2 duplicates and AI-4 screenshot and blurry-photo filtering, with no model.
- **Over:** staying all-JavaScript and serial until a native build exists.
- **Because:** measured: JavaScript encryption takes about 370 ms per photo with no JIT (Hermes's situation), and serial requests waste round trips on weak signal. Expo Go can't load native modules, so A1 ships behind a switch.
- **Source:** `docs/product/decisions/2026-10-21-speed-architecture.md`, `docs/eng/PERFORMANCE.md`

### DEC-30 · Drop R6 (hide the reply box behind a button), keep it in mind
- **When / status:** Oct 21 · Decided by Chase ("yes we can drop R6, but keep it in mind")
- **Chose:** keep the reply box and its "who will read this" line on every card.
- **Over:** a "Write something back" button that opens the box and asks the server for readers only then (RV-P3, RV-U4).
- **Because:** the button adds a tap for the least tech-savvy relative (LG Red), REPLY-11 needs the readers line whenever the box shows, and list windowing already caps the extra server calls at about 10 cards. Revisit if phone timings show the calls hurt.
- **Source:** `docs/product/reviews/2026-10-21-app-review.md` (RV-P3, RV-U4), TRACKER R6

### DEC-32 · M1 "green 3× on hosted" means CI's 3 green runs plus a read-only hosted smoke check (D1)
- **When / status:** Oct 23 · Decided by Chase (power hour)
- **Chose:** count CI's three green runs on a real Supabase stack, plus `smoke-check.sh` read-only against hosted.
- **Over:** wiping hosted and running the full suites there (needs `SUPABASE_DB_URL`).
- **Because:** no extra secret, nothing wiped, and the same suites already run on a real stack in CI.
- **Source:** TRACKER D1

### DEC-33 · Refresh the staff-pm agent after milestone 1 (D2)
- **When / status:** Oct 23 · Decided by Chase (power hour); work waits on M1
- **Chose:** a reviewed PR that updates staff-pm for the milestones, "groups" wording, a not-doing list and the files it owns, once milestone 1 is behind us.
- **Over:** refreshing it now, mid-milestone.
- **Source:** TRACKER D2

### DEC-34 · Thanksgiving (Nov 26) stays a soft target for milestones 3 and 4 (D5)
- **When / status:** Oct 23 · Decided by Chase (power hour)
- **Chose:** keep it as a planning target, not a gate.
- **Because:** Hearth is a proof of concept first; dates guide the order of work, they don't force shortcuts.
- **Source:** TRACKER D5

### DEC-35 · The family vault answers the "personal server" question, for now (D7)
- **When / status:** Oct 23 · Decided by Chase ("I don't think we will go with personal server but maybe. I like family vault for now.")
- **Chose:** the family vault (end-to-end encrypted, a later, higher tier; DEC-16) is the plan for a family that wants its own locked store.
- **Over:** a separate personal server per family, run in the US. Not ruled out: Chase said "maybe", so it stays in the ideas log.
- **Source:** TRACKER D7, `docs/product/ANCHORS.md` ideas log

### DEC-36 · Notices name the sender for the beta; "hide names" later (D9)
- **When / status:** Oct 23 · Decided by Chase (power hour)
- **Chose:** keep "From Chase on Hearth" (BETA-NOTIFY-7) in push and email; add a "hide names" setting after the beta.
- **Over:** notices that say nothing about who sent them.
- **Because:** a known name is what makes a grandparent trust and open the notice (LG, GG). Notices never carry captions, photos or the audience.
- **Source:** `docs/product/decisions/2026-10-23-notice-sender-names.md`, TRACKER D9

### DEC-38 · Love, Haha, Like and Comment as icons with no words (REACT-7)
- **When / status:** Oct 25 · Decided by Chase (thread "Moments feed redesign")
- **Chose:** four icon-only buttons on each moment (❤️ 😂 👍 💬), one reaction per person, counts per kind.
- **Over:** one worded Love button and a worded Comment button (MOMENT-3), which DS-3 and rule 3 asked for.
- **Because:** Chase wants the row to look like the photo apps relatives already use. Screen readers still hear each name; the LG and FA Reds are his override.
- **Source:** `docs/product/decisions/2026-10-25-reactions.md`, PR for migration 0017

### DEC-39 · Post titles and captions: one set of words per post, editable, encrypted later (CAP-D1..D4)
- **When / status:** Oct 28 · Decided by Chase ("picks ok"); not built yet (freezes lifted Oct 28)
- **Chose:** an optional title and caption for the whole set (CAP-D1); the sender can change them after posting (CAP-D2); the words stay plaintext until the family vault (CAP-D3); the Title box shows, marked optional (CAP-D4).
- **Over:** a caption per photo; delete and repost (BETA-SPEC); encrypting the words now; a hidden "Add a title" button.
- **Because:** per-photo boxes turn a 48-photo send into 48 questions for LG; reposting loses comments; encrypting now blocks caption search; a labeled box is easier to skip than a button to find.
- **Source:** `docs/product/SPEC-CAPTIONS.md`, `docs/product/decisions/2026-10-27-post-titles-captions.md`, TRACKER R21

### DEC-40 · Bleeding-edge pick: home-screen photo frame first; plan the family vault next (FRAME-*)
- **When / status:** Oct 29 · Decided by Chase ("Start with 1"; then "I also want a plan for 2"); specced, not built
- **Chose:** (1) a home-screen photo frame widget, plus a send-progress Live Activity for posters, after milestone 2's real build; (2) a day-by-day plan for the family vault on MLS (`PLAN-FAMILY-VAULT.md`), timing still per DEC-16.
- **Over:** an on-device AI audience guard (paid tier; blocked on the face-scanning claim), and starting the vault build now.
- **Because:** the frame is the cheapest of the three, and grandparents see it with zero taps (STORY problem 3). The vault is the long-term moat and reuses the messenger's MLS.
- **Source:** `docs/product/SPEC-PHOTO-FRAME.md`, `docs/product/decisions/2026-10-29-photo-frame.md`, `docs/product/PLAN-FAMILY-VAULT.md`, TRACKER R23, R24

### DEC-41 · Photos refresh on their own; sort uses the system icon (UI-26)
- **When / status:** Oct 26 · Decided by Chase (thread "Review latest build UI")
- **Chose:** no "Check for new photos" button (auto-refresh on open and return, plus pull-down); "By date" with the system sort icon beside Messages in one row.
- **Over:** a worded refresh button and two header rows (R11).
- **Because:** Chase didn't understand the refresh button and wants common system icons where they're universal. The first photo comes a row sooner.
- **Source:** `docs/product/decisions/2026-10-26-photos-refresh-sort.md`

### DEC-42 · The messenger becomes a shared AGPL library (STU-DEC-1)
- **When / status:** Oct 26 · Decided by Chase (Product Studio STU-DEC-1, license on Oct 26; built the same day on his word)
- **Chose:** move the MLS engine and ciphersuite into `packages/messenger` (`@holroyd/messenger`), with three plug points (Relay, Roster, Store) and a Supabase relay template. It's licensed AGPL-3.0-or-later, copyright Chase, with its own LICENSE file and SPDX headers. Hearth uses it through a thin adapter. Crew Clock is the second user.
- **Over:** a standalone messenger product (it would need push, multiple devices, safety numbers and an outside audit first); Apache-2.0 (Product Studio's first draft); waiting until after the beta.
- **Because:** Chase wants one messenger across his products. A library with one home costs little now and keeps Hearth's behavior unchanged; the AGPL keeps every product that uses it open.
- **Source:** pm-tools `DECISIONS.md` STU-DEC-1, `packages/messenger/README.md`

### DEC-43 · Words pass on titles, changing words, Messages and Share (WORDS-1..4)
- **When / status:** Oct 29 · Night shift, under "Decisions to review" (Chase to confirm)
- **Chose:** grandparent-ux's four word fixes: the caption hint names "the groups you pick", a refused edit says the old words are kept, "Not even Hearth can read it" in Messages, and the group count moves onto the names line. Persona check `decisions/2026-10-29-words-pass.md`.
- **Over:** keeping "(Grandma will see this)" (untrue for one-side posts), the generic "You can't do that here.", and "Name · 3 people" titles that wrap at large text.
- **Because:** every "who sees it" line must be true (A1), and a refusal must not make the least-savvy grandparent think they broke something.
- **Source:** `docs/product/decisions/2026-10-29-words-pass.md`

---
Last updated: Oct 29, 2026 (DEC-43)
