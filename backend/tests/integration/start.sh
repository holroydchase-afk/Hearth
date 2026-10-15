#!/usr/bin/env bash
# Real-API harness: fresh local DB (stub + migrations + seed) + PostgREST on :3001.
# HTTP calls with these JWTs go through PostgREST exactly like supabase-js does
# (apikey + Authorization: Bearer), so RLS, grants and RPC error codes are real.
#
# stdout: one JSON object (everything else goes to stderr), also saved to .state/harness.json:
#   {"url": "http://127.0.0.1:3001",            PostgREST root (= <supabase url>/rest/v1)
#    "anonKey": "<jwt role=anon>",
#    "serviceRoleKey": "<jwt role=service_role>", for test setup only (e.g. marking uploads ready)
#    "users": {"alex": {"id": "<uuid>", "jwt": "<jwt role=authenticated>"}, ...}}
# With supabase-js: createClient(url.replace(/\/rest\/v1$/, ''), anonKey) needs a gateway that
# serves /rest/v1; against this harness use @supabase/postgrest-js: new PostgrestClient(url, {headers}).
#
# Needs: a local Postgres 15+ you can reach as a superuser (PGUSER/PGHOST as for tests/run.sh), python3, curl.
# Env: HARNESS_DB (hearth_it), HARNESS_PORT (3001), JWT_SECRET, PGPORT (5432).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
BACKEND=$(cd "$HERE/../.." && pwd)
STATE="$HERE/.state"
DB=${HARNESS_DB:-hearth_it}
PORT=${HARNESS_PORT:-3001}
PG_PORT=${PGPORT:-5432}
JWT_SECRET=${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
AUTH_PW=${AUTHENTICATOR_PASSWORD:-hearth-local-only}
PGRST_VERSION=v12.2.3
PGRST_SHA256=9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c
log() { echo "[harness] $*" >&2; }

mkdir -p "$STATE"
"$HERE/stop.sh" --keep-db >/dev/null 2>&1 || true

# 1. PostgREST binary (static build from the GitHub release, checksum-pinned)
BIN="$HERE/.bin/postgrest"
if [[ ! -x "$BIN" ]]; then
  log "downloading PostgREST $PGRST_VERSION"
  dl=$(mktemp -d)
  curl -sSfL -o "$dl/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x64.tar.xz"
  echo "$PGRST_SHA256  $dl/pgrst.tar.xz" | sha256sum -c --quiet - >&2
  mkdir -p "$HERE/.bin"
  tar -xJf "$dl/pgrst.tar.xz" -C "$HERE/.bin" postgrest
  rm -rf "$dl"
fi

# 2. Database: fresh, with every migration and the demo seed
log "building database $DB"
dropdb --if-exists "$DB" >&2
createdb "$DB" >&2
files=(-f "$BACKEND/tests/supabase_stub.sql")
for m in "$BACKEND"/supabase/migrations/*.sql; do files+=(-f "$m"); done
files+=(-f "$BACKEND/supabase/seed.sql")
psql -d "$DB" -X -v ON_ERROR_STOP=1 -q "${files[@]}" >&2
# PostgREST logs in as `authenticator` and switches to anon/authenticated/service_role per request (as on Supabase).
psql -d "$DB" -X -v ON_ERROR_STOP=1 -q >&2 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end \$\$;
alter role authenticator with login password '$AUTH_PW';
grant anon, authenticated, service_role to authenticator;
SQL

# 3. PostgREST
cat > "$STATE/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:$AUTH_PW@127.0.0.1:$PG_PORT/$DB"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
db-pool = 10
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $PORT
log-level = "warn"
CONF
log "starting PostgREST on :$PORT"
nohup "$BIN" "$STATE/postgrest.conf" > "$STATE/postgrest.log" 2>&1 &
echo $! > "$STATE/postgrest.pid"
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  sleep 0.2
done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { log "PostgREST did not start:"; cat "$STATE/postgrest.log" >&2; exit 1; }

# 4. Keys for the seed users, signed with the JWT secret (HS256, like Supabase)
URL="http://127.0.0.1:$PORT"
users=$(psql -d "$DB" -X -At -F ' ' -c "select id, split_part(email, '@', 1) from auth.users order by email")
URL="$URL" JWT_SECRET="$JWT_SECRET" USERS="$users" python3 -I "$HERE/mint_keys.py" > "$STATE/harness.json"
log "ready: $URL (state in $STATE)"
cat "$STATE/harness.json"
