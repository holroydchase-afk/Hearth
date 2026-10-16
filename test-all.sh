#!/usr/bin/env bash
# Run every Hearth automated suite, save results, rebuild Test Log seed data.
set -u
cd "$(dirname "$0")"
mkdir -p e2e/results
bash scripts/check-agents.sh
(cd e2e && npx playwright test) ; P=$?
(cd backend && bash tests/run.sh) > e2e/results/backend-sql.txt 2>&1 ; tail -1 e2e/results/backend-sql.txt
(cd backend && deno test --allow-env --allow-read supabase/functions/sign-media/ supabase/functions/notify/ tests/templates/) > e2e/results/backend-deno.txt 2>&1 ; tail -1 e2e/results/backend-deno.txt
echo "Rebuild the Test Log data with: python3 tracker/build_seed.py (add a new run entry first)"
exit $P
