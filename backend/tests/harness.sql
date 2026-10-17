-- Shared test harness (copied from timeline_test.sql) for suites written after Oct 17: \ir harness.sql
-- Gives tests.ok / ok_sql / throws_code / lives / setv / try / v / rest and the results table.
set client_min_messages = warning;
\o /dev/null


-- ---------- harness ----------
create schema tests;
create table tests.results (n serial, ok boolean not null, description text not null);
create table tests.vars (k text primary key, v text);
create function tests.ok(p_ok boolean, p_desc text) returns void language sql as $$
  insert into tests.results (ok, description) values (coalesce(p_ok, false), p_desc) $$;
-- boolean query; an error is a failure, never an abort
create function tests.ok_sql(p_sql text, p_desc text) returns void language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  perform tests.ok(v, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
end $$;
-- must fail with exactly this SQLSTATE
create function tests.throws_code(p_sql text, p_desc text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform tests.ok(sqlstate = p_code, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
    return;
  end;
  perform tests.ok(false, p_desc || '  [expected ' || p_code || ', none raised]');
end $$;
create function tests.lives(p_sql text, p_desc text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform tests.ok(true, p_desc);
exception when others then
  perform tests.ok(false, p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
end $$;
-- run a scalar query and remember the result (null on error)
create function tests.setv(p_k text, p_sql text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := null; end;
  insert into tests.vars values (p_k, v) on conflict (k) do update set v = excluded.v;
end $$;
-- setup step that must not abort the run (assertions downstream catch problems)
create function tests.try(p_sql text) returns void language plpgsql as $$
begin execute p_sql; exception when others then raise warning 'setup failed: % (%)', sqlerrm, p_sql; end $$;
create function tests.v(p_k text) returns text language sql stable as $$ select v from tests.vars where k = p_k $$;
-- Simulate a PostgREST request: PostgREST sets request.method/request.headers and
-- reads response.status. Returns {status, body}. Never raises.
create function tests.rest(p_sql text, p_headers jsonb default '{}') returns jsonb language plpgsql as $$
declare v json;
begin
  perform set_config('request.method', 'POST', true);
  perform set_config('request.headers', p_headers::text, true);
  perform set_config('response.status', '', true);
  begin
    execute p_sql into v;
  exception when others then
    return jsonb_build_object('status', 'raised', 'body', jsonb_build_object('code', sqlstate, 'message', sqlerrm));
  end;
  return jsonb_build_object('status', coalesce(nullif(current_setting('response.status', true), ''), '200'),
                            'body', v::jsonb);
end $$;
grant usage on schema tests to authenticated, anon;
grant select, insert, update on tests.results, tests.vars to authenticated, anon;
grant usage on sequence tests.results_n_seq to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;
-- must fail with one of these SQLSTATEs
create function tests.throws_any(p_sql text, p_desc text, p_codes text[]) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform tests.ok(sqlstate = any (p_codes), p_desc || '  [' || sqlstate || ' ' || sqlerrm || ']');
    return;
  end;
  perform tests.ok(false, p_desc || '  [expected one of ' || array_to_string(p_codes, '/') || ', none raised]');
end $$;
grant execute on function tests.throws_any(text, text, text[]) to authenticated, anon;

\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
