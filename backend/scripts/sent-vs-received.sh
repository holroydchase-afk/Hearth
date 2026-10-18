#!/usr/bin/env bash
# QA-3: did everything one person shared reach another? For the milestone 1 gate's "0 lost" (BETA-SPEC
# "Milestone gates", row 1). Read only. Runs through the Supabase Management API, like family-setup.sh:
# no psql, no database URL, only SUPABASE_ACCESS_TOKEN (an environment secret, never in chat or git).
#   bash scripts/sent-vs-received.sh --sender-email you@example.com --receiver-email b@example.com \
#        [--since 2026-10-19] [--audience 'Test house' --audience Everyone] [--print-sql]
# "Sent": the sender's published posts since --since (default: all), only those shared to an --audience
# group if any are given (use the groups the receiver is in, or posts to other groups count as lost).
# "Received": checked as the receiver through RLS; the post shows and every photo on it is ready.
# Prints post ids, counts and times only. Exit 0 when nothing is lost, 1 when something is.
set -euo pipefail
cd "$(dirname "$0")/.."

REF=${SUPABASE_PROJECT_REF:-jqvgjfbhzbvfdhtnvgzr}
API=https://api.supabase.com/v1/projects/$REF/database/query
die() { echo "sent-vs-received: $*" >&2; exit 2; }

SENDER=""; RECEIVER=""; SINCE=""; AUD=(); PRINT=0
while (( $# )); do
  case $1 in
    --sender-email) SENDER=${2:-}; shift ;;
    --receiver-email) RECEIVER=${2:-}; shift ;;
    --since) SINCE=${2:-}; shift ;;
    --audience) AUD+=("${2:-}"); shift ;;
    --print-sql) PRINT=1 ;;
    *) die "unknown option $1 (see the top of $0)" ;;
  esac; shift
done
[[ -n $SENDER ]] || die "missing --sender-email (the account that shared the posts)"
[[ -n $RECEIVER ]] || die "missing --receiver-email (the account that should see them, e.g. account B)"
(( PRINT )) || [[ -n ${SUPABASE_ACCESS_TOKEN:-} ]] || die "missing SUPABASE_ACCESS_TOKEN (add it as an environment secret)"

# Values go in as SQL string literals (quotes doubled), never spliced raw.
SQL=$(python3 -I -c '
import sys
lit = lambda s: "'"'"'" + s.replace("'"'"'", "'"'"''"'"'") + "'"'"'"
body, sender, receiver, since, *aud = sys.argv[1:]
since_sql = lit(since) + "::timestamptz" if since else "'"'"'-infinity'"'"'::timestamptz"
aud_sql = "array[" + ", ".join(lit(a) for a in aud) + "]::text[]" if aud else "null::text[]"
sys.stdout.write(open(body).read() + "\nselect line from pg_temp.hearth_sent_vs_received(" +
                 ", ".join([lit(sender), lit(receiver), since_sql, aud_sql]) + ") line;\n")
' scripts/sent-vs-received.sql "$SENDER" "$RECEIVER" "$SINCE" ${AUD[@]+"${AUD[@]}"})

if (( PRINT )); then echo "POST $API"; echo "$SQL"; exit 0; fi

if out=$(python3 -I -c 'import json, sys; sys.stdout.write(json.dumps({"query": sys.stdin.read()}))' <<< "$SQL" |
  curl -sS --fail-with-body -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data-binary @-); then
  lines=$(python3 -I -c 'import json, sys; [print(r["line"]) for r in json.load(sys.stdin)]' <<< "$out")
  echo "$lines"
  echo "$lines" | grep -q '^RESULT: .*, lost 0$' || exit 1
else
  msg=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin).get("message", ""))' <<< "$out" 2>/dev/null || echo "$out")
  die "the check didn't run. The API said: $msg"
fi
