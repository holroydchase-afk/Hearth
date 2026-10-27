#!/usr/bin/env bash
# READ-ONLY health check of a hosted Supabase project, with only a personal access token.
# From Hearth's backend/scripts/smoke-check.sh. One SELECT and two GETs; it changes nothing.
#   SUPABASE_PROJECT_REF=<ref> bash scripts/smoke-check.sh
# Checks: every local migration is applied, RLS is on for every public table, every function folder
# is deployed and active, every name in supabase/functions/.env.example is set as a function secret
# (SMOKE_OPTIONAL_SECRETS="A B" skips some), and each job in SMOKE_CRON_JOBS="a b" exists and is on.
# Warns (doesn't fail) when Supabase Auth's audit log holds IP addresses.
# It reads secret NAMES only and never prints a value. Exit 0 when every check passes, 1 when any fails.
set -euo pipefail
cd "${PROJECT_DIR:-$(dirname "$0")/..}"

die() { echo "smoke-check: $*" >&2; exit 2; }
REF=${SUPABASE_PROJECT_REF:-}; [[ -n $REF ]] || die "set SUPABASE_PROJECT_REF (Project Settings > General > Project ID)"
[[ -n ${SUPABASE_ACCESS_TOKEN:-} ]] || die "missing SUPABASE_ACCESS_TOKEN (add it as an environment secret)"
BASE=https://api.supabase.com/v1/projects/$REF

OPTIONAL=" ${SMOKE_OPTIONAL_SECRETS:-} "; REQUIRED=()
if [[ -f supabase/functions/.env.example ]]; then
  while IFS= read -r n; do [[ $OPTIONAL == *" $n "* ]] || REQUIRED+=("$n"); done \
    < <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' supabase/functions/.env.example)
fi
FUNCTIONS=(); for d in supabase/functions/*/; do [[ -d $d ]] || continue; fn=$(basename "$d"); [[ $fn == _* ]] || FUNCTIONS+=("$fn"); done
VERSIONS=$(for f in supabase/migrations/*.sql; do b=$(basename "$f"); printf "'%s'," "${b%%_*}"; done); VERSIONS=${VERSIONS%,}
COUNT=$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')
CRON=$(for j in ${SMOKE_CRON_JOBS:-}; do printf "('%s')," "$j"; done); CRON=${CRON%,}
CRON_SQL=""
[[ -n $CRON ]] && CRON_SQL="union all
select 'cron', exists (select 1 from cron.job j where j.jobname = w.name and j.active),
       case when exists (select 1 from cron.job j where j.jobname = w.name and j.active) then 'cron job ' || w.name
            else 'cron job ' || w.name || ' is missing or paused' end, false from (values $CRON) w(name)"

SQL="-- smoke-check (read-only)
with want(v) as (select unnest(array[$VERSIONS]::text[])),
miss as (select count(*) n, string_agg(v, ', ' order by v) s from want
         where v not in (select version from supabase_migrations.schema_migrations)),
norls as (select count(*) n, string_agg(c.relname, ', ' order by c.relname) s from pg_class c
          join pg_namespace ns on ns.oid = c.relnamespace
          where ns.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity)
select 'migrations' as \"check\", n = 0 as ok,
       case when n = 0 then 'all $COUNT migrations applied' else 'migrations not applied on hosted: ' || s end as detail, false as warn from miss
union all
select 'rls', n = 0, case when n = 0 then 'RLS is on for every public table' else 'RLS is off on: ' || s end, false from norls
$CRON_SQL
union all
select 'auth_ips', n = 0,
       case when n = 0 then 'no IP addresses in Supabase Auth''s audit log'
            else 'Supabase Auth''s audit log (auth.audit_log_entries) holds ' || n || ' row(s) with an IP address' end, true
from (select case when to_regclass('auth.audit_log_entries') is null then 0
             else (xpath('/row/n/text()', query_to_xml(
               'select count(*) as n from auth.audit_log_entries where coalesce(ip_address, '''') <> ''''',
               false, true, '')))[1]::text::int end as n) x"

call() {  # method path [sql]; prints the body, the token stays in a header
  local out
  if [[ $1 == POST ]]; then
    out=$(python3 -I -c 'import json, sys; sys.stdout.write(json.dumps({"query": sys.stdin.read()}))' <<< "$3" |
      curl -sS --fail-with-body -X POST "$BASE$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        -H "Content-Type: application/json" --data-binary @-) || { echo "smoke-check: $2 failed: $out" >&2; return 1; }
  else
    out=$(curl -sS --fail-with-body "$BASE$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN") ||
      { echo "smoke-check: $2 failed (the API refused; values not shown)" >&2; return 1; }
  fi
  printf '%s' "$out"
}

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
call POST /database/query "$SQL" > "$T/db.json" || die "the database check didn't run"
call GET /functions > "$T/functions.json" || die "couldn't list edge functions"
# Keep secret NAMES only, straight away; the rest of the reply is never stored or passed on.
call GET /secrets | python3 -I -c 'import json, sys; print("\n".join(s.get("name", "") for s in json.load(sys.stdin)))' > "$T/secret-names" ||
  die "couldn't list function secret names"

python3 -I - "$T" "${#FUNCTIONS[@]}" "${FUNCTIONS[@]}" "${REQUIRED[@]}" <<'PY'
import json, sys, pathlib
t = pathlib.Path(sys.argv[1]); nf = int(sys.argv[2])
functions, required = sys.argv[3:3 + nf], sys.argv[3 + nf:]
db = json.loads((t / "db.json").read_text())
status = {f.get("slug"): f.get("status") for f in json.loads((t / "functions.json").read_text())}
names = set((t / "secret-names").read_text().split())
lines, failed = [], 0
def report(ok, text, warn=False):
    global failed
    if not ok and not warn: failed += 1
    lines.append(("ok  " if ok else ("warn" if warn else "FAIL")) + "  " + text)
for r in db:
    report(bool(r["ok"]), r["detail"], warn=bool(r.get("warn")))
for slug in functions:
    s = status.get(slug)
    report(s == "ACTIVE", f"edge function {slug} " + ("is active" if s == "ACTIVE" else f"is {s.lower() if s else 'not deployed'}"))
missing = [n for n in required if n not in names]
report(not missing, "all %d function secrets are set" % len(required) if not missing else "function secrets not set: " + ", ".join(missing))
print("\n".join(lines))
print(f"SMOKE RESULT: {sum(1 for l in lines if l.startswith('ok'))} ok, {failed} failed")
sys.exit(1 if failed else 0)
PY
