INTAKE for Product Studio (from Hearth, Oct 28, 2026): three reusable lessons from release M1.1

Repos: studio-agents (templates and agent notes) and pm-tools (STACK.md, LESSONS). Owner: Product Studio. Hearth doesn't edit those repos; this is the hand-off.

Per STACK.md, nothing below is extracted as code until a second product needs it. These are small rules and snippets worth carrying now, because Crew Clock is on the same stack (Expo + Supabase).

1. Jest on Expo SDK 58 hides Node's fetch (any Expo product with a real-API test).
   - jest-expo 58 replaces the global fetch with Expo's native-only one, so tests that call a local API get no answers.
   - Snippet (Hearth `app/jest.environment.js`, 8 lines): a custom test environment that extends `jest-expo/src/preset/nativeEnvironment.js` and saves `globalThis.fetch` as `__hearthNodeFetch` before Expo swaps it. The harness then uses that fetch.
   - Proposed home: studio-agents `templates/expo/` as a snippet, plus one line in the engineer agent's notes.

2. Supabase RPCs that build feeds: JIT off (any Supabase product with a feed or list RPC).
   - Once a table has a few dozen rows, Postgres can JIT-compile a big row-building query, which turns 20-50 ms into 1.5-2 s.
   - Fix: `alter function <fn> set jit = off;` plus a SQL test that checks `'jit=off' = any(proconfig)`. Hearth migration 0018, `backend/tests/timeline_test.sql` HARD-17.
   - Proposed home: studio-agents `templates/supabase/` README ("performance") and the architect agent's checklist.

3. Every proof runs in CI (pm-tools LESSONS / QA practice).
   - A suite that runs only by hand went red for two days without anyone seeing it.
   - Rule: a suite that matters is a CI job, and a flaky test is a finding: time each call before calling it a flake.
   - Proposed home: the qa-tdd agent's method and pm-tools LESSONS.

Source: Hearth `docs/eng/LESSONS.md` (Oct 28 entry), PRs #63 and #65 (unmerged until Chase's word).

After shipping: note it in STUDIO-STATUS.md. Nothing needs to come back to Hearth.
