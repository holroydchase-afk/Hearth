#!/usr/bin/env bash
# Set up Chase's family on the hosted project in one command, through the Supabase Management API
# (POST /v1/projects/{ref}/database/query), like deploy.sh: no psql, no database password or URL.
#   bash scripts/family-setup.sh --chase-email you@example.com --space-name 'Our kids' \
#        [--danielle-email her@example.com] [--sister-name NAME] [--print-sql]
# Needs SUPABASE_ACCESS_TOKEN (an environment secret, never in chat or git) and Chase signed in once in the app.
# Makes, AS CHASE through the app's RPCs and RLS (scripts/family-setup-api.sql): the family, Everyone, Chase's
# side and Danielle's side, the houses under them, a Test house for account B, the two events, and prints the
# test viewer's invite code (plus Danielle's poster invite with --danielle-email). Safe to re-run (fresh codes)
# until anyone else joins; then it refuses (use family-setup-v2.sql's dry run).
# --print-sql prints the request instead of sending it (no token needed).
set -euo pipefail
cd "$(dirname "$0")/.."

REF=${SUPABASE_PROJECT_REF:-jqvgjfbhzbvfdhtnvgzr}
API=https://api.supabase.com/v1/projects/$REF/database/query
die() { echo "family-setup: $*" >&2; exit 1; }

CHASE=""; SPACE=""; DANIELLE=""; SISTER=""; PRINT=0
while (( $# )); do
  case $1 in
    --chase-email) CHASE=${2:-}; shift ;;
    --space-name) SPACE=${2:-}; shift ;;
    --danielle-email) DANIELLE=${2:-}; shift ;;
    --sister-name) SISTER=${2:-}; shift ;;
    --print-sql) PRINT=1 ;;
    *) die "unknown option $1 (see the top of $0)" ;;
  esac; shift
done
[[ -n $CHASE ]] || die "missing --chase-email (the email Chase signs in with)"
[[ -n $SPACE ]] || die "missing --space-name (the family's name, e.g. 'Our kids')"
(( PRINT )) || [[ -n ${SUPABASE_ACCESS_TOKEN:-} ]] || die "missing SUPABASE_ACCESS_TOKEN (add it as an environment secret)"

# The SQL file plus one call. Values go in as SQL string literals (quotes doubled), never spliced raw.
SQL=$(python3 -I -c '
import sys
lit = lambda s: "null" if s == "" else "'"'"'" + s.replace("'"'"'", "'"'"''"'"'") + "'"'"'"
body = open(sys.argv[1]).read()
args = ", ".join(lit(a) for a in sys.argv[2:])
sys.stdout.write(body + "\nselect line from pg_temp.hearth_family_setup(" + args + ") line;\n")
' scripts/family-setup-api.sql "$CHASE" "$SPACE" "$DANIELLE" "$SISTER")

if (( PRINT )); then echo "POST $API"; echo "$SQL"; exit 0; fi

if out=$(python3 -I -c 'import json, sys; sys.stdout.write(json.dumps({"query": sys.stdin.read()}))' <<< "$SQL" |
  curl -sS --fail-with-body -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data-binary @-); then
  python3 -I -c 'import json, sys; [print(r["line"]) for r in json.load(sys.stdin)]' <<< "$out"
else
  msg=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin).get("message", ""))' <<< "$out" 2>/dev/null || echo "$out")
  die "nothing was changed. The API said: $msg"
fi
