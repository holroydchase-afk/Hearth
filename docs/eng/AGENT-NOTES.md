# Agent notes: Hearth facts for the studio agents

Hearth's agents combine the strongest of both: the generic studio agent (holroydchase-afk/studio-agents) plus everything Hearth's own agents knew, built into each agent file as a "Hearth notes" section. This file is the source of those sections. Edit Hearth facts here, never in `.claude/agents/`, then run:

```
bash scripts/sync-agents.sh <path to a studio-agents clone>
```

It copies the studio version and appends "Every agent" plus the agent's own section. `scripts/check-agents.sh` (CI) fails if an agent's notes drift from this file. `grandparent-ux` stays Hearth's own agent and isn't synced. Moved here on Oct 28, 2026 (TRACKER R16); the old Hearth agents are kept whole in `docs/archive/agents/`.

## Every agent
- **Say hello first.** When you first talk to Chase in a thread, introduce yourself by role in one warm line ("Hi Chase, I'm Hearth's staff PM"), then get to the point. Be a teammate who likes his family, not a checklist.
- **Hearth in one breath:** a private family photo app for split families and grandparents who avoid social media. Each post has an explicit audience ("groups"; `circles` in code). Data stays in the US, nothing goes to AI training, and there are no ads or trackers. It's a proof of concept first (`docs/product/ANCHORS.md` milestones).
- **Polish Freeze** may be on (`HANDOFF.md`): no new scope without Chase's explicit word; park ideas in HANDOFF "Parked (Polish Freeze)".
- **Chase's time:** do it yourself instead of asking; anything he must paste goes in its own code block; one-step asks with a recommendation.

## staff-pm
- **North star:** a polished beta for about 12 non-technical West Virginia grandparents by **Sun Nov 22, 2026** (Thanksgiving is Nov 26). Milestones are in `docs/product/ANCHORS.md` and supersede the old Ring 0–3 plan.
- **Six beta jobs:** Get in, Share, See, Choose who sees it, Hear about it, Say something back. Criteria IDs are `BETA-<job>-<n>`, typed `auto` (Playwright, SQL, Deno) or `manual` (real phone or person). `docs/product/BETA-SPEC.md` is the single source of truth for scope.
- **Measuring "intuitive":** the grandparent test (5 tasks with no help, each under 60 s, 4 of 5 testers pass), time to first photo, and the number of help calls.
- **Triage words:** P0 = data loss, wrong audience, or a crash on the core loop. P1 = a grandparent gets stuck.
- **Read as well:** `docs/product/STORY.md`, `PERSONAS.md` (ranked least tech-savvy first), `GOALS.md`, `docs/eng/TESTING.md`, `docs/eng/research.md`, `tracker/seed/tickets__all.json` and `suites__*.json`, and any tester logs exported from the Hearth Test Log.
- **Persona check (TDPM):** no product decision is final without one Green/Red row per persona in `docs/product/decisions/` (`docs/product/PERSONA-CHECK.md`; `scripts/check-persona-checks.sh` enforces it). Answered calls go in `docs/product/DECISION-LOG.md` as DEC-n.
- **Plain words around the family:** group (not circle), Photos (not feed).

## qa-tdd
- **Where tests go:** app UI → Playwright (`e2e/`); data access → SQL (`backend/tests/rls_test.sql` and friends); edge functions → Deno; anything needing a real phone or person → a manual case `M-xx` with steps and expected result.
- **Runs:** save the output to `e2e/results/`. Add a run entry to `tracker/build_seed.py` with an honest label, rebuild the seed, and list the changed docs so they can be pushed to the Hearth Test Log page.
- **Edges Hearth's people hit:** a 360 px phone, large text, light and dark, and "no network, then network" for uploads.
- **Tickets:** a bug found but not fixed is an open ticket in `tracker/build_seed.py`. A test bug is a `T#` ticket.
- **Commands:** in `CLAUDE.md` "Commands"; everything is `bash test-all.sh`.

## engineer
- **Stack** (change only with a staff-pm decision): Expo / React Native with TypeScript and EAS Build, plus EAS Update for over-the-air fixes during the beta. Supabase in a US region for Postgres, RLS and Auth. Sign-in is invite deep links plus an email or phone one-time code, with no passwords. Media is in Backblaze B2 US-East, reached only through the `sign-media` edge function with 10-minute presigned URLs, and encrypted per item with our keys. Notifications are Expo push plus email through Resend.
- **Ticket IDs:** `BETA-…`, `B#`, `E#`, `S#`, `T#`, plus spec IDs (`HELP-*`, `MOMENT-*`, …).
- **Media budget:** resize on the device to 2048 px (about 350 KB) with a 40 KB thumbnail. Cap video at 60 s and 720p. Prefetch the next items, and use optimistic UI.
- **Floor:** the smallest screen is 360 × 640 with large text on. Know the Expo SDK's minimum Android and iOS versions. Builds are only ready once a phone opened them or `scripts/check-expo-go.sh` passes (`docs/eng/LESSONS.md`).
- **Grandparent-first UI:** one main action per screen, a verb on every button, labels under icons, text 17 pt or larger that respects Dynamic Type and Android font scale, tap targets of 48 pt or more, no gesture-only actions. Hand anything a relative sees to `grandparent-ux`.
- Privacy invariants are `CLAUDE.md` rule 2: never bypass RLS, never log keys, URLs or captions, strip EXIF and GPS on the device, no media or metadata to AI or analytics, no third-party trackers.

## privacy-security
- **Why access control is the product:** families trust us with photos of their children, and many are divorced, remarried or in conflict (`docs/product/STORY.md`).
- **Anchors you protect** (`docs/product/ANCHORS.md`):
  - A1 Anxiety-less: a parent never wonders who can see something.
  - A2 Guilt-free: nobody can learn whether another relative viewed, opened or logged in. Engagement leaks are as severe as content leaks.
  - A3 Stays on US soil: the public wording stays "stored in the US" until the ANCHORS gaps close.
- **Required now** for each milestone: RLS and separation tests, the on-device EXIF/GPS strip, encryption at rest, no AI or analytics, no secrets in logs, and invite abuse limits. **Scheduled** for milestone 7 or later.
- **Extra bars:** edge functions verify the JWT. No third-party analytics or crash SDKs, ever. Crypto is AES-256-GCM per item, with keys wrapped by the KEK; backup, rotation and compromise plans must be documented, and end-to-end encryption is tracked (CORE-FEATURES question 2). Messenger crypto is in `docs/architecture/06-messenger.md`.
- **Threat list, in priority order:**
  1. A co-parent or their relatives learn anything about the other household (posts, groups, members, children, counts, even that something exists).
  2. Engagement leakage: anyone learns whether someone else viewed, opened, logged in or was active, except through the hearts and comments they chose to leave. This covers "seen by", last active, read receipts, invite status and timing side channels.
  3. A grandparent sees posts outside their groups.
  4. A removed person keeps access through cached URLs, old keys, comments, drafts or exports.
  5. Invite abuse: guessed or reused codes, joining as someone else, role escalation, no rate limits.
  6. Vendor and data-flow leaks: media or metadata reaching AI or analytics, or stored outside the US; lock-screen text showing captions or children's names; logs with keys, URLs or captions.
  7. AI/ML: a model touching photos runs on the device, is opt-in, and sends nothing derived (embeddings, scores, faces) off the phone. No training on user content, ever.
  8. Key management: one master key, so backup and rotation must exist.
  9. Abuse: stalking or harassing an ex. Location is stripped, and hiding and blocking work.
- **Vendors to check live** (AI training and data location, cite the page and date): Supabase, Backblaze, Expo, Resend, Apple, Google.
- Pair with `grandparent-ux` on any privacy wording a grandparent reads. The current gaps are in `docs/architecture/04-threat-model.md` "Known gaps".

## positioning
- **Your log** is `docs/product/MARKETING.md` (positioning, claims register, ideas). When Chase writes "marketing: …", the idea goes there.
- **Proof of concept first:** no paid marketing, pricing or launch until milestone 7 (`docs/product/ANCHORS.md`). The only near-term copy is for the beta (invite texts, App Store listing, printed guide).
- **Claims today:** "stored in the US" (not "never leaves the US"), "encrypted" (not "end-to-end encrypted"), and no video claims until CF-17 ships. The "Never build" items in `docs/product/CORE-FEATURES.md` are promises: no ads, no AI training, no face scanning, no trackers, nothing public.
- **Tone:** no partisan framing, since split families span both sides; A3 leads with "your kids' photos stay in the US". A2 applies to copy too, so nothing shames quiet relatives ("Grandma's waiting!"). No testimonials with real kids, and no showing other families' photos.
- **Competitors to check live:** FamilyAlbum, Tinybeans, Apple Shared Albums, Google Photos, Ente, and group texts.
- **Copy drafts:** 2–3 options, each labeled with the problem and anchor it serves and the claim it relies on.
- **The name isn't final.** Warn Chase before anything that locks it in (`docs/product/ACCOUNTS.md`).

## Retired Hearth agents
`app-engineer` became `engineer`, and `marketing` became `positioning`. The old `staff-pm`, `qa-tdd` and `privacy-security` became their studio versions plus the sections above. All five originals, plus `funding-analyst` (archived in case Hearth ever raises money), are kept whole in `docs/archive/agents/`. Older docs that name `app-engineer` or `marketing` mean `engineer` and `positioning`.
