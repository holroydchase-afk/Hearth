# PM tools log

Every product-management tool Hearth has or is building, and the action items about them. Started Oct 19, 2026 at Chase's ask. Any thread that adds, changes or retires a PM tool adds or updates its row here in the same PR.

## Action items

Chase is formalizing work as action items (Oct 19). Each one has an ID (`ACT-n`), an owner, a status, and a "done when" line that says how anyone can check it. Open items also get a row in `TRACKER.md`. Status: ☐ open, ◐ in progress, ☑ done.

| ID | Action | Owner | Status | Done when |
|---|---|---|---|---|
| ACT-1 | **Central PM hub.** Build one place Chase opens (on his phone too) to see the roadmap and tracker, the persona cards and decision results, the UAT log, the ideas inbox and the open action items, without hunting through files. First step: the staff-pm scopes it (what it shows, where it lives, read-only or editable, and whether it reads straight from the repo files so nothing is kept twice). Queued after the M1 photo fix, so it doesn't pull focus from milestone 1 | Claude (staff-pm scopes, then build) | ☐ | Chase opens one link and sees all the tools in the table below that are marked "Hub: yes", current as of the latest merge |

## Tools

Built means it exists and is in use. "Hub" marks what ACT-1 should show.

| Tool | What it's for | Where | Status | Hub |
|---|---|---|---|---|
| Tracker | The one to-do list: sequence to milestone 1, what's missing, what's pending on Chase or Claude | `docs/product/TRACKER.md` | Built | Yes |
| Milestones and anchors | Milestone order (Chase, wife, savviest relative…), anchors A1–A4 that every feature is checked against, ideas log | `docs/product/ANCHORS.md` | Built | Yes |
| Product goals | 6 goals (G1–G6) with the signal for each | `docs/product/GOALS.md` | Built | Yes |
| Story | Why Hearth exists, the 8 problems, family stories | `docs/product/STORY.md` | Built | No |
| Acceptance criteria | 35 BETA-* criteria; the scope source of truth | `docs/product/BETA-SPEC.md` | Built | Yes |
| Feature specs | Groups, media, core features, AI features | `docs/product/SPEC-*.md`, `CORE-FEATURES.md`, `AI-FEATURES.md` | Built | No |
| Persona check (TDPM) | Before a product decision, each persona card says green or red with a one-line why; CI fails if a decision file is missing a check | `docs/product/PERSONA-CHECK.md`, `docs/product/decisions/`, `scripts/check-persona-checks.sh` | Built v1 (Oct 19). Personas need build-out | Yes |
| Personas | Who Hearth is for | `docs/product/PERSONAS.md` (long form), persona cards in `PERSONA-CHECK.md` | Building | Yes |
| UAT log | Chase's running list from trying the app, newest first | `/mnt/project-files/uat/UAT-LOG.md` | Built | Yes |
| #idea inbox | Any message with "#idea" is logged word for word, with a 👍 and no discussion | `/mnt/project-files/ideas/IDEAS.md` | Built | Yes |
| Hearth Test Log | Test cases, tickets and runs, built from real test output | `tracker/hearth-test-log.html`, `tracker/build_seed.py` | Built | Yes |
| Gate reviews | Staff-pm go/no-go reviews of plans and milestones | `docs/product/PM-REVIEW.md`, `REMAINING.md` | Built | No |
| Post mortems | What went wrong and the rules it added | `docs/eng/LESSONS.md` | Built | No |
| Claims register | What marketing can truthfully say today, plus marketing ideas | `docs/product/MARKETING.md` | Built | No |
| Accounts list | Every outside account and where the name "Hearth" is baked in | `docs/product/ACCOUNTS.md` | Built | No |
| Handoff | Current state and history, read at the start of every session | `HANDOFF.md` | Built | No |
| Agent roster | The specialist agents and what to send each; CI checks it matches `.claude/agents/` | `CLAUDE.md`, `scripts/check-agents.sh` | Built | No |
| Central PM hub | One place to see all of the above | Not decided | Idea (ACT-1) | n/a |
