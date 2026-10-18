#!/usr/bin/env bash
# Run every Hearth automated suite, save results, rebuild Test Log seed data.
set -u
cd "$(dirname "$0")"
mkdir -p e2e/results
bash scripts/check-agents.sh
bash scripts/check-expo-go.sh
bash scripts/tests/check_expo_go_test.sh > e2e/results/expo-go.txt 2>&1 ; tail -1 e2e/results/expo-go.txt
bash scripts/tests/check_logs_test.sh > e2e/results/priv2-logs.txt 2>&1 ; tail -1 e2e/results/priv2-logs.txt
bash app/scripts/tests/eas_test.sh > e2e/results/app-eas.txt 2>&1 ; tail -1 e2e/results/app-eas.txt
(cd e2e && npx playwright test) ; P=$?
(cd backend && bash tests/deploy/deploy_test.sh) > e2e/results/backend-deploy.txt 2>&1 ; tail -1 e2e/results/backend-deploy.txt
(cd backend && bash tests/run.sh) > e2e/results/backend-sql.txt 2>&1 ; tail -1 e2e/results/backend-sql.txt
(cd backend && deno test --allow-env --allow-read supabase/functions/sign-media/ supabase/functions/notify/ tests/templates/) > e2e/results/backend-deno.txt 2>&1 ; tail -1 e2e/results/backend-deno.txt
echo "Rebuild the Test Log data with: python3 tracker/build_seed.py (add a new run entry first)"
exit $P
