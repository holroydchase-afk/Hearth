# Hearth: project memory for Claude

Hearth is a private family photo app for split families and for grandparents who avoid social media. Each post has an explicit audience ("groups"; "circles" in code). Data stays in the US. Nothing is used for AI training, and there are no ads or trackers. Founder: Chase (former PM, solo, near Charlotte). Beta target: about 12 West Virginia grandparents by **Nov 22, 2026**.

**Hearth is a proof of concept first** (Chase, Oct 16): a birthday present to himself plus job experience. The milestones in `ANCHORS.md` (Chase → wife → most tech-savvy relative → everyone else by savviness → Android → maybe a smart frame → then decide on costs) supersede the startup-style Ring 0–3 plan. Every feature is checked against anchors A1 Anxiety-less, A2 Guilt-free, A3 Stays on US soil.

## Read first
- `ANCHORS.md`: why Hearth exists, milestones, anchors (A1–A3), ideas log. Add new anchors and ideas there as Chase names them; never delete built features to satisfy one.
- `HANDOFF.md`: current state and what's next. Start here every session.
- `MILESTONE-1.md`: Chase's setup steps and the 2-day demo for milestone 1 (incl. the $99 Apple answer).
- `REMAINING.md`: the critical path to the Ring 0 gate (Oct 29) and the beta.
- `BETA-SPEC.md`: 35 acceptance criteria (BETA-*), the scope source of truth.
- `API.md`: the app↔backend contract. Change the contract tests before changing it.
- `PERSONAS.md`, `CORE-FEATURES.md`, `TESTING.md`.

## Layout
- `backend/`: Supabase.
  - `migrations/0001`–`0006`: RLS, RPCs, triggers, notification outbox (0003), AUD-7 (0004), S12 (0005), error reports (0006).
  - `functions/notify/`: Deno TS; Expo Push + Resend sender, run by a 1-minute cron.
  - `functions/sign-media/`: Deno TS; presigned Backblaze B2 URLs and per-item keys.
  - `tests/`: SQL, perf, integration (PostgREST harness).
- `app/`: Expo SDK 54, TypeScript strict, `HearthApi` with a Supabase and a Fake implementation, upload queue, media pipeline.
- `prototype/`, `e2e/`: the clickable HTML prototype and its Playwright tests. Throwaway.
- `tracker/`: Hearth Test Log seed builder.
- `.claude/agents/`: staff-pm, app-engineer, qa-tdd, grandparent-ux, privacy-security, funding-analyst.

## Commands
- Backend: `cd backend && bash tests/run.sh` (local Postgres 16). Integration: `bash tests/integration/start.sh` / `stop.sh`.
- App: `cd app && npm test && npm run typecheck && npm run e2e:web`.
- Everything: `bash test-all.sh`.

## Rules (non-negotiable)
1. **TDD.** Write a failing test first, with the ticket or BETA ID in its title, then fix. Run the full suite 3× before calling anything done.
2. **Privacy invariants.**
   - Never bypass RLS.
   - A post you can't see behaves as "not found".
   - Strip EXIF/GPS on the device.
   - No media or metadata goes to any AI or analytics service.
   - Never log keys, URLs or captions.
3. **Grandparent UX.**
   - Text 17pt+ and 48pt tap targets.
   - Verb labels and words under icons; no gesture-only actions.
   - Words: group (not circle), Photos (not feed), Help (not Me) for viewers.
4. **Deep, not wide.** Nothing outside BETA-SPEC without the staff-pm's call. New ideas go in the `ANCHORS.md` ideas log, not straight into code.
5. **Cost.** Chase is on a $20/mo plan. Run one agent lane at a time and keep reports short.
6. **PostgREST quirks.** Branch on `error.code`, never on HTTP status (P0002 comes back as 500).
