# Hearth: project memory for Claude

Hearth is a private family photo app for split families and for grandparents who avoid social media. Each post has an explicit audience ("groups"; "circles" in code). Data stays in the US. Nothing is used for AI training, and there are no ads or trackers. Founder: Chase (former PM, solo, near Charlotte). Beta target: about 12 West Virginia grandparents by **Nov 22, 2026**.

**Hearth is a proof of concept first** (Chase, Oct 16): a birthday present to himself plus job experience. The milestones in `docs/product/ANCHORS.md` (Chase → wife → most tech-savvy relative → everyone else by savviness → Android → maybe a smart frame → then decide on costs) supersede the startup-style Ring 0–3 plan. Every feature is checked against anchors A1 Anxiety-less, A2 Guilt-free, A3 Stays on US soil.

## Where docs live
- **Agents read only the repo.** Any doc an agent must act on lives here, and the repo copy wins. Draft in claude.ai docs if you like, then copy it in (or ask Claude to) and edit it here from then on.
- Root: `CLAUDE.md`, `HANDOFF.md`. Product: `docs/product/`. Engineering: `docs/eng/`. Code READMEs stay beside their code.

## Read first
- `docs/product/STORY.md`: why Hearth exists, the 8 problems and Hearth's answers, family stories, WV vs Charlotte. Read before any UX or positioning call.
- `docs/product/ANCHORS.md`: milestones, anchors (A1–A3), ideas log. Add new anchors and ideas there as Chase names them; never delete built features to satisfy one.
- `HANDOFF.md`: current state and what's next. Start here every session.
- `docs/product/MILESTONE-1.md`: Chase's setup steps and the 2-day demo for milestone 1 (incl. the $99 Apple answer).
- `docs/product/REMAINING.md`: the critical path to the Ring 0 gate (Oct 29) and the beta.
- `docs/product/BETA-SPEC.md`: 35 acceptance criteria (BETA-*), the scope source of truth.
- `docs/eng/MERGING.md`: when and how Claude merges PRs (only on Chase's word, CI green, merge commits).
- `docs/eng/API.md`: the app↔backend contract. Change the contract tests before changing it.
- `docs/product/PERSONAS.md`, `docs/product/CORE-FEATURES.md`, `docs/eng/TESTING.md`.
- `docs/product/AI-FEATURES.md`: future AI and smart-photo features (people → group suggestions, duplicates), the rules they must meet, and the blocking AI positioning decision.
- `docs/product/ACCOUNTS.md`: every outside account, its login, and where the name "Hearth" is baked in. Add a row whenever Chase sets up a new account. No secrets. **Before anything that makes the name hard to change (buying the domain, a store build, telling relatives the name), stop and warn Chase**; store builds refuse until it says "Name final: yes".
- `docs/product/MARKETING.md`: positioning, claims register (what we can truthfully say), marketing ideas log. Owned by the `marketing` agent.

## Layout
- `backend/`: Supabase.
  - `migrations/0001`–`0011`: RLS, RPCs, triggers, notification outbox (0003), AUD-7 (0004), S12 (0005), error reports (0006), real names (0007), rename_circle (0008), who reads replies (0009), timeline + bulk (0010), family shape (0011).
  - `scripts/`: `deploy.sh` (one-command deploy, `--dry-run`), `family-setup.sh` (fresh family in the 0011 shape + invites, through the Management API, token only), `family-setup.sql` (v1, psql; superseded for fresh setups), `family-setup-v2.sql` (re-seed into the family shape; dry run by default).
  - `functions/notify/`: Deno TS; Expo Push + Resend sender, run by a 1-minute cron.
  - `functions/sign-media/`: Deno TS; presigned Backblaze B2 URLs and per-item keys.
  - `tests/`: SQL, perf, integration (PostgREST harness).
- `app/`: Expo SDK 54, TypeScript strict, `HearthApi` with a Supabase and a Fake implementation, upload queue, media pipeline.
- `prototype/`, `e2e/`: the clickable HTML prototype and its Playwright tests. Throwaway.
- `tracker/`: Hearth Test Log seed builder.
- `.claude/agents/`: the specialist agents. See "Chief of staff and agent roster" below.

## Chief of staff and agent roster
The main Claude session is Chase's **chief of staff**. It doesn't do specialist work itself: it sends each request to the right agent below, one lane at a time (rule 5), and reports back briefly. At the start of every session it reads this roster and `ls .claude/agents/`.

| Agent | Send it |
|---|---|
| `staff-pm` | Specs, triage, scope calls, gate reviews, anything new before it's built |
| `qa-tdd` | Failing tests first, suite runs, Test Log updates |
| `app-engineer` | Building app/backend changes after the failing test exists |
| `grandparent-ux` | Any screen, word, notification, email or guide a relative will see |
| `privacy-security` | RLS, invites, sign-in, media URLs, keys, logging, vendors, AI, data deletion |
| `funding-analyst` | Grants, programs, investors, funding metrics |
| `marketing` | Positioning, messaging, taglines, audiences, channels; logs ideas in `docs/product/MARKETING.md` |

**Roster rule.** Adding, renaming or removing an agent in `.claude/agents/` means updating this table in the same commit, plus a line in `HANDOFF.md`. `scripts/check-agents.sh` (run by `test-all.sh` and CI) fails if they don't match.

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
4. **Deep, not wide.** Nothing outside BETA-SPEC without the staff-pm's call. New ideas go in the `docs/product/ANCHORS.md` ideas log, not straight into code.
5. **Cost.** Chase is on a $20/mo plan. Run one agent lane at a time and keep reports short.
6. **PostgREST quirks.** Branch on `error.code`, never on HTTP status (P0002 comes back as 500).
