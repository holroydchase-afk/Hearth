#!/usr/bin/env bash
# D1 / QA-2: READ-ONLY health check of the hosted project, for the milestone 1 gate (Claude's pick for D1:
# CI's 3 green runs on a real Supabase stack, plus this check on hosted, so nothing hosted is wiped).
#   bash scripts/smoke-check.sh
# Needs only SUPABASE_ACCESS_TOKEN (an environment secret, never in chat or git). Through the Management API:
# every local migration is applied, RLS is on for every public table, both cron jobs exist, both edge
# functions are active, every function secret in supabase/functions/.env.example is set, and invite links
# open the web build's /join/ screen, not hearth.family (ONB-3; the stored value is never printed). It reads
# secret NAMES only and never prints a value. It also counts (never prints) IP addresses in Supabase Auth's
# audit log, as a warning. One SELECT, two GETs; it changes nothing.
# Exit 0 when every check passes (warnings allowed), 1 when any fails.
set -euo pipefail
cd "$(dirname "$0")/.."

REF=${SUPABASE_PROJECT_REF:-jqvgjfbhzbvfdhtnvgzr}
BASE=https://api.supabase.com/v1/projects/$REF
die() { echo "smoke-check: $*" >&2; exit 2; }
[[ -n ${SUPABASE_ACCESS_TOKEN:-} ]] || die "missing SUPABASE_ACCESS_TOKEN (add it as an environment secret)"

# Required function secrets: every name in .env.example except the optional ones.
OPTIONAL=" APP_LINK_BASE EXPO_ACCESS_TOKEN "
REQUIRED=()
while IFS= read -r n; do [[ $OPTIONAL == *" $n "* ]] || REQUIRED+=("$n"); done \
  < <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' supabase/functions/.env.example)
VERSIONS=$(for f in supabase/migrations/*.sql; do b=$(basename "$f"); printf "'%s'," "${b%%_*}"; done); VERSIONS=${VERSIONS%,}
COUNT=$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')

SQL="with want(v) as (select unnest(array[$VERSIONS]::text[])),
miss as (select count(*) n, string_agg(v, ', ' order by v) s from want
         where v not in (select version from supabase_migrations.schema_migrations)),
norls as (select count(*) n, string_agg(c.relname, ', ' order by c.relname) s from pg_class c
          join pg_namespace ns on ns.oid = c.relnamespace
          where ns.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity)
select 'migrations' as \"check\", n = 0 as ok,
       case when n = 0 then 'all $COUNT migrations applied' else 'migrations not applied on hosted: ' || s end as detail from miss
union all
select 'rls', n = 0, case when n = 0 then 'RLS is on for every public table' else 'RLS is off on: ' || s end from norls
union all
select 'cron', exists (select 1 from cron.job j where j.jobname = w.name and j.active),
       'cron job ' || w.name from (values ('hearth-notify'), ('hearth-purge-client-errors')) w(name)
union all
select 'invite_link', coalesce(b not like 'https://hearth.family%' and b like 'https://%/join/', false),
       case when b is null then 'invite_link_base is not set (apply 0014)'
            when b like 'https://hearth.family%' then 'invite links point at hearth.family, a domain Hearth doesn''t own (apply 0014)'
            when b not like 'https://%/join/' then 'invite links don''t end in /join/, the path the app opens (apply 0014)'
            else 'invite links open the web build''s /join/ screen' end
from (select (select value from private.secrets where name = 'invite_link_base') as b) l
union all
select 'auth_ips', n = 0,
       case when n = 0 then 'no IP addresses in Supabase Auth''s audit log'
            else 'Supabase Auth''s audit log (auth.audit_log_entries) holds ' || n || ' row(s) with an IP address' end
from (select case when to_regclass('auth.audit_log_entries') is null then 0
             else (xpath('/row/n/text()', query_to_xml(
               'select count(*) as n from auth.audit_log_entries where coalesce(ip_address, '''') <> ''''',
               false, true, '')))[1]::text::int end as n) x;"

call() {  # method path [json body]; prints the body, the token stays in a header
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

python3 -I - "$T" "${REQUIRED[@]}" <<'PY'
import json, sys, pathlib
t = pathlib.Path(sys.argv[1])
db = json.loads((t / "db.json").read_text())
fns = json.loads((t / "functions.json").read_text())
names = set((t / "secret-names").read_text().split())
required = sys.argv[2:]
lines, failed = [], 0
def report(ok, text, warn=False):
    global failed
    if not ok and not warn: failed += 1
    lines.append(("ok  " if ok else ("warn" if warn else "FAIL")) + "  " + text)
for r in db:   # IPs in Supabase Auth's own log are theirs to keep: a warning to act on (PRIV-1), not a failure
    report(bool(r["ok"]), r["detail"] + ("" if r["ok"] or r["check"] != "cron" else " is missing or paused"),
           warn=r["check"] == "auth_ips")
status = {f.get("slug"): f.get("status") for f in fns}
for slug in ("sign-media", "notify"):
    s = status.get(slug)
    report(s == "ACTIVE", f"edge function {slug} " + ("is active" if s == "ACTIVE" else f"is {s.lower() if s else 'not deployed'}"))
missing = [n for n in required if n not in names]
report(not missing, "all %d function secrets are set" % len(required) if not missing else "function secrets not set: " + ", ".join(missing))
if "HEARTH_KEYS_PENDING" in names:
    report(False, "placeholder secret HEARTH_KEYS_PENDING is still set (delete it: tracker step 7)", warn=True)
print("\n".join(lines))
print(f"SMOKE RESULT: {sum(1 for l in lines if l.startswith('ok'))} ok, {failed} failed")
sys.exit(1 if failed else 0)
PY
