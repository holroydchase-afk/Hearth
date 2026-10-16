#!/usr/bin/env bash
# One-command deploy of the Hearth backend to a hosted Supabase project.
#   bash scripts/deploy.sh --dry-run   # print every step, change nothing
#   bash scripts/deploy.sh             # do it
# Needs (environment secrets, never in chat or git):
#   SUPABASE_ACCESS_TOKEN   personal access token (CLI login)
#   SUPABASE_DB_PASSWORD    database password (the CLI reads it from the environment)
#   SUPABASE_DB_URL         full postgres connection string (cron + vault step)
# and supabase/functions/.env filled from .env.example (function secrets).
# Does NOT load seed.sql and does NOT run the test suites (they reset the database).
set -euo pipefail
cd "$(dirname "$0")/.."

REF=${SUPABASE_PROJECT_REF:-jqvgjfbhzbvfdhtnvgzr}
CLI=${SUPABASE_CLI:-npx --yes supabase@2.121.0}
ENV_FILE=supabase/functions/.env
DRY=0; [[ ${1:-} == --dry-run ]] && DRY=1

run() { if (( DRY )); then echo "+ $*"; else "$@"; fi; }
die() { echo "deploy: $*" >&2; exit 1; }

# ---- preflight (never prints secret values) ----
for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_DB_URL; do
  [[ -n ${!v:-} ]] || (( DRY )) || die "missing $v (add it as an environment secret)"
done
[[ -f $ENV_FILE ]] || (( DRY )) || die "missing $ENV_FILE (copy .env.example and fill it in)"
if [[ -f $ENV_FILE ]] && grep -Eq '^SUPABASE_' "$ENV_FILE"; then
  die "$ENV_FILE must not contain SUPABASE_* keys (Supabase injects them; never store service_role here)"
fi

echo "== 1/6 link project $REF"
run $CLI link --project-ref "$REF"

echo "== 2/6 migrations (0001-0008, no seed data)"
run $CLI db push

echo "== 3/6 function secrets"
# A cron secret so pg_cron never needs the service role key. Kept only in Supabase.
CRON_SECRET=$(openssl rand -hex 32)
if [[ -f $ENV_FILE ]]; then run $CLI secrets set --project-ref "$REF" --env-file "$ENV_FILE"; fi
run $CLI secrets set --project-ref "$REF" "NOTIFY_CRON_SECRET=${CRON_SECRET}" >/dev/null

echo "== 4/6 edge functions"
run $CLI functions deploy sign-media --project-ref "$REF"
run $CLI functions deploy notify --project-ref "$REF" --no-verify-jwt

echo "== 5/6 run notify every minute (pg_cron + pg_net, secret in Vault)"
SQL=$(cat <<SQL
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('${CRON_SECRET}', 'notify_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'notify_cron_secret');
select vault.update_secret(id, '${CRON_SECRET}') from vault.secrets where name = 'notify_cron_secret';
select cron.unschedule('hearth-notify') where exists (select 1 from cron.job where jobname = 'hearth-notify');
select cron.schedule('hearth-notify', '* * * * *', \$cron\$
  select net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb)
\$cron\$);
select cron.schedule('hearth-purge-client-errors', '17 4 * * *', 'select public.purge_client_errors()');
SQL
)
if (( DRY )); then echo "+ psql \$SUPABASE_DB_URL <<< (cron + vault SQL, secret redacted)"
else psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<< "$SQL" >/dev/null; fi

echo "== 6/6 sign-in email: the 6-number code, no link (JOIN-2)"
# Supabase's default email sends a link; push our templates (supabase/templates/*.html)
# through the Management API. Field names per api.supabase.com/v1 projects/{ref}/config/auth.
AUTH_JSON=$(python3 -I - <<'PY'
import json, pathlib
t = pathlib.Path("supabase/templates")
subject = "Your Hearth code: {{ .Token }}"
print(json.dumps({
  "mailer_subjects_magic_link": subject,
  "mailer_templates_magic_link_content": (t / "magic_link.html").read_text(),
  "mailer_subjects_confirmation": subject,
  "mailer_templates_confirmation_content": (t / "confirmation.html").read_text(),
  "mailer_otp_length": 6,
  "mailer_otp_exp": 3600,
}))
PY
)
if (( DRY )); then echo "+ curl -X PATCH https://api.supabase.com/v1/projects/$REF/config/auth (2 templates, ${#AUTH_JSON} bytes)"
else curl -fsS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
       -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
       --data-binary "$AUTH_JSON" >/dev/null; fi

echo "deploy: done. Next: set app/.env.local (see app/.env.example) and run the Expo Go check in docs/product/MILESTONE-1.md."
