# Hearth testing (TDD)

**Rule:** no fix or feature without a test that fails first.

1. Log it as a ticket: B# bug, E# enhancement, S# security, T# test fix.
2. Write the test, with the ticket ID in its title, e.g. `POST-04 Remove a picked photo (E6)`.
3. Run it and confirm it **fails**. Save the run.
4. Fix the code.
5. Run the **whole** suite. Confirm it's green 3 times (no flaky tests).
6. Push the runs to the Hearth Test Log.

## Suites

| Suite | What it covers | Command |
|---|---|---|
| Prototype | 32 cases (33 tests): visibility, roles, sharing, circles, invites, notifications, accessibility, injection | `cd e2e && npx playwright test` |
| Backend | 110 privacy rules: grandparent and co-parent separation, revocation, caps, invites, deletion | `cd backend && bash tests/run.sh` |
| Media signing | 5 tests: signed URLs, denial, metadata check | `cd backend && deno test --allow-env supabase/functions/sign-media/` |
| Privacy audit | PRIV-1: no raw IP addresses kept (`backend/tests/privacy_audit_test.sql`, in `run.sh`); PRIV-2: no log line carries a key, URL, caption, email or raw error | `bash scripts/tests/check_logs_test.sh` |
| Hosted checks (read only) | QA-3 sent vs received; D1 smoke check (migrations, RLS, cron, functions, secret names). Tested locally with a stubbed API in `run.sh` | `bash backend/scripts/sent-vs-received.sh ...`, `bash backend/scripts/smoke-check.sh` |
| Manual | 12 real-phone cases (M-01…M-12), run by family testers | Logged on the Test Log page |

Run everything: `bash test-all.sh`. It saves results to `e2e/results/` and rebuilds the Test Log data in `tracker/seed/`.

## Test Log page
- **Test cases:** current status of every case, plus its red→green trail over runs.
- **Bugs & features:** every ticket, the tests that prove it, and whether those tests failed first.
- **Runs:** history of runs, with notes.
- **Log a test:** testers record Pass, Fail or Blocked, the phone they used, and notes. A Fail requires a note.

Only Chase (and editors) can change cases, tickets and runs. Testers need Contributor/editor access to save results. View-only people can read everything.

## Day 2 results (Oct 15)
- **Prototype:** red run 12/32 cases passing. 18 failures were real bugs or missing features; 2 were test bugs (T1, T2). The fix run found one more bug (B10). Green run: 32/32, stable across 3 runs.
- **Backend:** 90/90 → the security review added 20 tests, each failing before its fix → 110/110.
- **Media signing:** 5/5. Type-checking now runs; before, the tests only passed with it turned off.
