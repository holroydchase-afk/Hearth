#!/usr/bin/env bash
# Runs this starter's SQL on top of the studio Supabase template: copies the template into a
# temp folder, adds our migrations and tests, then runs the template's own tests/sql/run.sh.
#   bash docs/supabase-starter/tests/run-with-template.sh <path to studio-agents/templates/supabase>
# Needs a local Postgres 15+ and PG* variables for a superuser.
set -euo pipefail
tpl=${1:?usage: run-with-template.sh <studio-agents templates/supabase folder>}
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cp -R "$tpl"/. "$t"/
cp "$here"/supabase/migrations/*.sql "$t"/supabase/migrations/
cp "$here"/tests/sql/*_test.sql "$t"/tests/sql/
sh "$t"/tests/sql/run.sh "${2:-starter_invites_test}"
