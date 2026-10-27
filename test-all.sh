#!/usr/bin/env bash
# Run every Hearth automated suite, save results, rebuild Test Log seed data.
# QA-ALL-1: fails if any suite that ran failed; names suites it had to skip (no Postgres, no Deno).
set -u
cd "$(dirname "$0")"
source scripts/lib/suite.sh
suite_reset
mkdir -p e2e/results
quiet() { local out=$1; shift; "$@" > "$out" 2>&1; local rc=$?; tail -1 "$out"; return $rc; }
suite "agent roster" bash scripts/check-agents.sh
suite "persona checks" quiet e2e/results/persona-checks.txt bash scripts/tests/check_persona_checks_test.sh
suite "Expo Go SDK" bash scripts/check-expo-go.sh
suite "Expo Go check test" quiet e2e/results/expo-go.txt bash scripts/tests/check_expo_go_test.sh
suite "log check" quiet e2e/results/priv2-logs.txt bash scripts/tests/check_logs_test.sh
suite "test-all helper" quiet e2e/results/test-all.txt bash scripts/tests/test_all_test.sh
suite "EAS script" quiet e2e/results/app-eas.txt bash app/scripts/tests/eas_test.sh
suite "prototype e2e" bash -c 'cd e2e && npx playwright test'
suite "deploy script" quiet e2e/results/backend-deploy.txt bash -c 'cd backend && bash tests/deploy/deploy_test.sh'
if pg_isready -q 2>/dev/null; then
  suite "backend SQL" quiet e2e/results/backend-sql.txt bash -c 'cd backend && bash tests/run.sh'
else
  suite_skip "backend SQL" "no local Postgres running"
fi
if pg_isready -q 2>/dev/null; then
  suite "Supabase starter scripts" quiet e2e/results/starter-scripts.txt bash docs/supabase-starter/tests/scripts_test.sh
else
  suite_skip "Supabase starter scripts" "no local Postgres running"
fi
if [ -n "${STUDIO_SUPABASE_TEMPLATE:-}" ] && pg_isready -q 2>/dev/null; then
  suite "Supabase starter invites" quiet e2e/results/starter-invites.txt bash docs/supabase-starter/tests/run-with-template.sh "$STUDIO_SUPABASE_TEMPLATE"
else
  suite_skip "Supabase starter invites" "set STUDIO_SUPABASE_TEMPLATE to studio-agents/templates/supabase; CI runs it"
fi
if command -v deno >/dev/null 2>&1; then
  suite "Deno functions" quiet e2e/results/backend-deno.txt bash -c 'cd backend && deno test --allow-env --allow-read supabase/functions/sign-media/ supabase/functions/notify/ tests/templates/'
else
  suite_skip "Deno functions" "Deno isn't installed; CI runs them"
fi
echo "Rebuild the Test Log data with: python3 tracker/build_seed.py (add a new run entry first)"
suite_report
