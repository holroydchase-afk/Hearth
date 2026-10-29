# Supabase starter: what Hearth adds to the studio template

Hearth's half of pm-tools `docs/intakes/hearth-supabase-starter.md`. The studio template (studio-agents `templates/supabase/`, PR #11) already covers the base: orgs and members, RLS on by default, column grants, `app.` helpers, shared edge-function code, a SQL test harness and CI. This folder holds the pieces Hearth proved that the template lacks. Its paths match the template's, so Product Studio can copy them straight in. Nothing here is Hearth-specific: no family words, no Hearth tables.

| Path | What it is | Came from |
|---|---|---|
| `supabase/migrations/00000000000001_invites.sql` | Invite codes on the template's orgs: `create_invite`, `redeem_invite`, `revoke_invite`, and an `invites` table admins can read but no client can write | Hearth `0001_init.sql` (create/redeem invite), `0014_onb3_invite_links.sql` |
| `tests/sql/invites_test.sql` | 25 checks (STARTER-INV-1..7), each rule tried by someone allowed and someone who isn't | Hearth `backend/tests/rls_test.sql` invite blocks |
| `scripts/deploy.sh` | One-command deploy with only an access token: migrations through the Management API, function secrets, every function | Hearth `backend/scripts/deploy.sh` |
| `scripts/smoke-check.sh` | Read-only check of the hosted project: migrations applied, RLS on, functions active, secrets set (names only), cron jobs on | Hearth `backend/scripts/smoke-check.sh` |
| `tests/scripts_test.sh` | 17 checks (STARTER-DEPLOY-1..5, STARTER-SMOKE-1..2) with curl and the CLI stubbed | Hearth `backend/tests/deploy/deploy_test.sh`, `smoke_check_test.sh` |
| `tests/run-with-template.sh` | Runs the invite SQL on top of a copy of the template | New |

## The invite pattern
- Only an admin invites. Only the owner invites an admin. Nobody invites an owner.
- The code (`AB12-CD34-EF56-7890`, 64 random bits) is shown once. The table keeps only its SHA-256, and clients can't read that column.
- A code works once, until it expires (7 days by default, 1 to 30 allowed) or an admin revokes it. Redeeming again as a member just returns the org.
- Every failed redeem says "Invite not found" (`P0002`), whether the code was wrong, used, expired or revoked, so nobody can probe codes. PostgREST returns P0002 as HTTP 500, so the app branches on `error.code`, never on the status.
- It uses only Postgres built-ins (`gen_random_uuid`, `sha256`), so it needs no extension.

Not included: rate limiting on redeem (Hearth leans on Supabase Auth's limits), and invite links (Hearth stores the link base in `private.secrets`; see `0014`).

## The deploy and smoke scripts
- Both need `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN`. There's no default project, so they can't hit Hearth's by mistake.
- `deploy.sh --dry-run` prints every step and calls nothing. `DEPLOY_NO_VERIFY_JWT="hook"` deploys webhook or cron targets without the JWT check.
- `smoke-check.sh` takes `SMOKE_OPTIONAL_SECRETS="A B"` and `SMOKE_CRON_JOBS="a b"`. It warns when Supabase Auth's audit log holds IP addresses.
- The CLI version is pinned (`supabase@2.121.0`, the one Hearth's CI runs). Look up the current one on the vendor's page before bumping it (Hearth `docs/eng/LESSONS.md`).
- Product extras go after step 3 of `deploy.sh`. Hearth's version shows two: a pg_cron job that calls a function with a Vault secret, and auth email templates sent through the Management API.

## Run the tests
```
bash docs/supabase-starter/tests/scripts_test.sh
bash docs/supabase-starter/tests/run-with-template.sh <studio-agents>/templates/supabase
```
Both need a local Postgres 15+ with a superuser in the `PG*` variables. CI runs both in the `supabase-starter` job, against studio-agents pinned at commit `5a90300`. Move the pin once PR #11 merges.

## For Product Studio
Copy the four files into `templates/supabase/`, add the two scripts to `scripts/add-supabase.sh`, and add a row for each to the template README. Hearth keeps its own copies in `backend/` and doesn't import these.
