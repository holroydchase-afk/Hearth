#!/usr/bin/env bash
# DEPLOY-1: deploy.sh must reach Postgres only through the Supabase Management API
# (POST https://api.supabase.com/v1/projects/$REF/database/query), needing only
# SUPABASE_ACCESS_TOKEN. Plain bash; fake curl/npx-CLI/psql/openssl shims on PATH.
#   bash backend/tests/deploy/deploy_test.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
BACKEND=$(cd "$HERE/../.." && pwd)
WORK=$(mktemp -d)
[[ -n ${KEEP:-} ]] && echo "work dir: $WORK" || trap 'rm -rf "$WORK"' EXIT

TOKEN=sbp_FAKE_TOKEN_DEPLOY1_do_not_print
CRON=cronFAKEsecretDEPLOY1deadbeefcafef00d
REF=testref123
PASS=0; FAIL=0
ok()   { echo "ok   - $1"; PASS=$((PASS+1)); }
nok()  { echo "FAIL - $1"; [[ -n ${2:-} ]] && echo "       $2"; FAIL=$((FAIL+1)); }
check(){ local t=$1; shift; if "$@"; then ok "$t"; else nok "$t" "${WHY:-}"; fi; WHY=; }

# ---- shims ----
BIN=$WORK/bin; mkdir -p "$BIN"
cat > "$BIN/curl" <<'SH'
#!/usr/bin/env bash
# Fake curl: logs argv; for .../database/query decodes {"query": ...} into $LOG_DIR/q/NNN.sql.
n=$(ls "$LOG_DIR/q" 2>/dev/null | wc -l); n=$(printf '%03d' $((n+1)))
echo "curl $*" >> "$LOG_DIR/calls.log"
url=""; data=""; prev=""
for a in "$@"; do
  case $prev in -d|--data|--data-binary|--data-raw|--json) data=$a;; esac
  case $a in https://*) url=$a;; --data=*|--data-binary=*|--data-raw=*|--json=*) data=${a#*=};; esac
  prev=$a
done
if [[ $data == @- ]]; then data=$(cat); elif [[ $data == @* ]]; then data=$(cat "${data#@}"); fi
if [[ $url == */database/query ]]; then
  mkdir -p "$LOG_DIR/q"
  printf '%s' "$data" | python3 -I -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["query"])' \
    > "$LOG_DIR/q/$n.sql" 2>/dev/null || { echo "fake curl: body is not {\"query\": ...}" >&2; exit 22; }
  if grep -Eiq 'select[^;]*version[^;]*from[^;]*supabase_migrations\.schema_migrations' "$LOG_DIR/q/$n.sql" \
     && ! grep -Eiq '^[[:space:]]*insert' "$LOG_DIR/q/$n.sql"; then
    echo '[{"version":"0001"}]'
  else echo '[]'; fi
else echo '{}'; fi
SH
cat > "$BIN/fake-supabase" <<'SH'
#!/usr/bin/env bash
echo "cli $*" >> "$LOG_DIR/calls.log"
SH
cat > "$BIN/psql" <<'SH'
#!/usr/bin/env bash
echo "psql $*" >> "$LOG_DIR/calls.log"; cat >> "$LOG_DIR/psql_stdin.log"
SH
cat > "$BIN/npx" <<'SH'
#!/usr/bin/env bash
echo "npx $*" >> "$LOG_DIR/calls.log"
SH
printf '#!/usr/bin/env bash\necho "openssl $*" >> "$LOG_DIR/openssl.log"; echo %s\n' "$CRON" > "$BIN/openssl"
chmod +x "$BIN"/*

# ---- temp copy of backend (scripts + supabase) so a dummy functions .env never touches the repo ----
setup_copy() { # $1 = dir
  mkdir -p "$1/backend"
  cp -r "$BACKEND/scripts" "$BACKEND/supabase" "$1/backend/"
  printf 'RESEND_API_KEY=re_fake\nB2_KEY_ID=fake\n' > "$1/backend/supabase/functions/.env"
  mkdir -p "$1/log"
}
run_deploy() { # $1 = dir, rest = args; env must already be set by caller
  local d=$1; shift
  LOG_DIR=$d/log PATH="$BIN:$PATH" SUPABASE_CLI=fake-supabase SUPABASE_PROJECT_REF=$REF \
    HEARTH_FUNCTIONS_ENV=$d/backend/supabase/functions/.env \
    bash "$d/backend/scripts/deploy.sh" "$@" > "$d/out.txt" 2>&1
  echo $? > "$d/rc"
}
clean_env() { unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_DB_URL; }

# Run A: only the access token.
A=$WORK/a; setup_copy "$A"
( clean_env; export SUPABASE_ACCESS_TOKEN=$TOKEN; run_deploy "$A" )
# Run B: token plus the legacy DB vars (proves the new path is used even when they exist).
B=$WORK/b; setup_copy "$B"
( clean_env; export SUPABASE_ACCESS_TOKEN=$TOKEN SUPABASE_DB_PASSWORD=pwFAKE \
    SUPABASE_DB_URL="postgresql://postgres:pwFAKE@db.$REF.supabase.co:5432/postgres"; run_deploy "$B" )
# Run C: dry run, no secrets at all.
C=$WORK/c; setup_copy "$C"; rm -f "$C/backend/supabase/functions/.env"
( clean_env; run_deploy "$C" --dry-run )

# ---- case 1 ----
WHY="exit $(cat "$A/rc"): $(tail -1 "$A/out.txt")"
check "DEPLOY-1 succeeds with only SUPABASE_ACCESS_TOKEN (no DB password, no DB URL)" \
  test "$(cat "$A/rc")" = 0

# ---- case 2 ----
for R in A B; do
  D=${!R}; c2=1; WHY="exit $(cat "$D/rc")"
  [[ $(cat "$D/rc") == 0 ]] || c2=0
  if grep -Eq '^psql ' "$D/log/calls.log" 2>/dev/null; then c2=0; WHY+="; psql called"; fi
  if grep -Eq ' db push' "$D/log/calls.log" 2>/dev/null; then c2=0; WHY+="; CLI db push called"; fi
  if grep -Eq '^(cli|npx) .*\blink\b' "$D/log/calls.log" 2>/dev/null; then c2=0; WHY+="; CLI link called"; fi
  check "DEPLOY-1 run $R completes without psql, CLI db push or CLI link" test $c2 = 1
done

# ---- case 3 (run B) ----
idx_containing() { # $1 dir, $2 file whose content must be contained -> prints first index or empty
  python3 -I - "$1" "$2" <<'PY'
import sys, pathlib
qdir, needle = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).read_text().strip()
for i, q in enumerate(sorted(qdir.glob("*.sql")) if qdir.is_dir() else []):
    if needle in q.read_text():
        print(i); break
PY
}
recorded() { # $1 dir, $2 version -> 0 if an insert into schema_migrations mentions it
  grep -Eilq "insert into supabase_migrations\.schema_migrations" "$1"/q/*.sql 2>/dev/null || return 1
  grep -El "insert into supabase_migrations\.schema_migrations" -i "$1"/q/*.sql | xargs grep -lq "'$2'"
}
c3=1; WHY=""; last=-1
for f in "$BACKEND"/supabase/migrations/*.sql; do
  base=$(basename "$f"); ver=${base%%_*}
  i=$(idx_containing "$B/log/q" "$f")
  if [[ $ver == 0001 ]]; then
    [[ -z $i ]] || { c3=0; WHY+="0001 re-sent; "; }
    continue
  fi
  if [[ -z $i ]]; then c3=0; WHY+="$base not sent; "; continue; fi
  (( i > last )) || { c3=0; WHY+="$base out of order; "; }
  last=$i
  recorded "$B/log" "$ver" || { c3=0; WHY+="$ver not recorded; "; }
done
check "DEPLOY-1 unapplied migrations go to database/query in order, recorded in schema_migrations, 0001 skipped" test $c3 = 1

# ---- case 4 ----
WHY="no database/query body contains cron.schedule('hearth-notify'"
check "DEPLOY-1 cron + vault SQL goes to database/query" \
  bash -c "grep -lq \"cron.schedule('hearth-notify'\" '$B'/log/q/*.sql 2>/dev/null"
WHY="no curl call with Authorization: Bearer <token> to /v1/projects/$REF/database/query"
check "DEPLOY-1 database/query calls use POST and the bearer token" \
  bash -c "grep -E 'projects/$REF/database/query' '$B/log/calls.log' 2>/dev/null | grep -F 'Bearer $TOKEN' | grep -Eq -- '-X POST|--request POST|--data|-d |--json'"

# ---- case 5 ----
for R in A B C; do
  D=${!R}
  WHY="secret found in output"
  check "DEPLOY-1 run $R prints no token or cron secret" \
    bash -c "! grep -Fq -e '$TOKEN' -e '$CRON' '$D/out.txt'"
done

# ---- case 6 ----
WHY="exit $(cat "$C/rc"): $(tail -1 "$C/out.txt")"
check "DEPLOY-1 --dry-run with no secrets exits 0" test "$(cat "$C/rc")" = 0
WHY="calls: $(cat "$C/log/calls.log" 2>/dev/null | tr "\n" "|")"
check "DEPLOY-1 --dry-run makes no curl, psql or CLI calls" bash -c "! test -s '$C/log/calls.log'"
WHY="no migrations line mentioning database/query"
check "DEPLOY-1 --dry-run prints migrations via database/query" \
  bash -c "grep -i 'database/query' '$C/out.txt' | grep -iq 'migration'"

echo "DEPLOY-1 deploy tests: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
