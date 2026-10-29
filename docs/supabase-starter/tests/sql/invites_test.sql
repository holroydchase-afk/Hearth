-- STARTER-INV: invite codes (supabase/migrations/00000000000001_invites.sql), on top of the
-- studio template's base migration. Every rule tried by someone allowed and someone who isn't.
-- Its own made-up people, so it runs in any order with rls_test.sql. Org C: olive (owner),
-- adam (admin), mia (member). Org D: dora (owner). gina, frank and hank: signed in, in no org.
\set ON_ERROR_STOP 1
insert into auth.users (id) values
  ('01000000-0000-0000-0000-000000000001'), ('02000000-0000-0000-0000-000000000002'),
  ('03000000-0000-0000-0000-000000000003'), ('04000000-0000-0000-0000-000000000004'),
  ('05000000-0000-0000-0000-000000000005'), ('06000000-0000-0000-0000-000000000006'),
  ('07000000-0000-0000-0000-000000000007');
insert into public.orgs (id, name) values
  ('0c000000-0000-0000-0000-0000000000cc', 'Org C'), ('0d000000-0000-0000-0000-0000000000dd', 'Org D');
insert into public.members (org_id, user_id, role) values
  ('0c000000-0000-0000-0000-0000000000cc', '01000000-0000-0000-0000-000000000001', 'owner'),
  ('0c000000-0000-0000-0000-0000000000cc', '02000000-0000-0000-0000-000000000002', 'admin'),
  ('0c000000-0000-0000-0000-0000000000cc', '03000000-0000-0000-0000-000000000003', 'member'),
  ('0d000000-0000-0000-0000-0000000000dd', '04000000-0000-0000-0000-000000000004', 'owner');

-- ---------- anon ----------
set role anon;
select tests.throws($$select public.create_invite('0c000000-0000-0000-0000-0000000000cc')$$,
  'STARTER-INV-1 anon cannot create an invite', 'permission denied');
select tests.throws($$select public.redeem_invite('AAAA-AAAA-AAAA-AAAA')$$,
  'STARTER-INV-1 anon cannot redeem an invite', 'permission denied');
reset role;

-- ---------- who may invite ----------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"03000000-0000-0000-0000-000000000003"}', false);
select tests.throws($$select public.create_invite('0c000000-0000-0000-0000-0000000000cc')$$,
  'STARTER-INV-2 a member cannot invite', 'only admins');
select tests.ok((select count(*) from public.invites) = 0, 'STARTER-INV-2 a member sees no invites');

select set_config('request.jwt.claims', '{"sub":"04000000-0000-0000-0000-000000000004"}', false);
select tests.throws($$select public.create_invite('0c000000-0000-0000-0000-0000000000cc')$$,
  'STARTER-INV-2 another org''s owner cannot invite into org C', 'only admins');

select set_config('request.jwt.claims', '{"sub":"02000000-0000-0000-0000-000000000002"}', false);
select public.create_invite('0c000000-0000-0000-0000-0000000000cc') as member_code \gset
select tests.ok(:'member_code' ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$',
  'STARTER-INV-3 an admin gets a 16-character code in four groups');
select tests.throws($$select public.create_invite('0c000000-0000-0000-0000-0000000000cc', 'admin')$$,
  'STARTER-INV-3 only an owner can invite an admin', 'only the owner');
select tests.throws($$select public.create_invite('0c000000-0000-0000-0000-0000000000cc', 'owner')$$,
  'STARTER-INV-3 nobody can invite an owner', 'member or admin');
select tests.ok((select count(*) from public.invites) = 1, 'STARTER-INV-4 an admin sees the org''s invites');
select tests.throws('select code_hash from public.invites', 'STARTER-INV-4 nobody can read code hashes', 'permission denied');
select tests.throws($$insert into public.invites (org_id, role, code_hash) values ('0c000000-0000-0000-0000-0000000000cc', 'admin', '\x00')$$,
  'STARTER-INV-4 clients cannot write invites directly', 'permission denied');

select set_config('request.jwt.claims', '{"sub":"01000000-0000-0000-0000-000000000001"}', false);
select public.create_invite('0c000000-0000-0000-0000-0000000000cc', 'admin') as admin_code \gset
select public.create_invite('0c000000-0000-0000-0000-0000000000cc') as revoke_code \gset
select public.create_invite('0c000000-0000-0000-0000-0000000000cc') as expire_code \gset
select tests.ok(:'admin_code' <> :'member_code', 'STARTER-INV-3 every code is different');

select set_config('request.jwt.claims', '{"sub":"04000000-0000-0000-0000-000000000004"}', false);
select tests.ok((select count(*) from public.invites) = 0, 'STARTER-INV-4 another org''s owner sees none of org C''s invites');
reset role;

-- ---------- redeeming ----------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"05000000-0000-0000-0000-000000000005"}', false);
select tests.throws($$select public.redeem_invite('0000-0000-0000-0000')$$,
  'STARTER-INV-5 a wrong code is "not found"', 'invite not found');
select tests.ok(public.redeem_invite(lower(replace(:'member_code', '-', ' '))) = '0c000000-0000-0000-0000-0000000000cc',
  'STARTER-INV-5 gina joins org C (lower case and spaces are fine)');
select tests.ok((select role from public.members where user_id = '05000000-0000-0000-0000-000000000005') = 'member',
  'STARTER-INV-5 gina is a member, the role the invite named');
select tests.ok(public.redeem_invite(:'member_code') = '0c000000-0000-0000-0000-0000000000cc',
  'STARTER-INV-6 redeeming again as a member just returns the org');

select set_config('request.jwt.claims', '{"sub":"06000000-0000-0000-0000-000000000006"}', false);
select tests.throws(format('select public.redeem_invite(%L)', :'member_code'),
  'STARTER-INV-6 a used code is "not found" for anyone else', 'invite not found');
select tests.ok(public.redeem_invite(:'admin_code') = '0c000000-0000-0000-0000-0000000000cc', 'STARTER-INV-5 frank joins with the admin code');
select tests.ok((select role from public.members where user_id = '06000000-0000-0000-0000-000000000006') = 'admin',
  'STARTER-INV-5 frank is an admin');
reset role;

-- ---------- revoked and expired ----------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"03000000-0000-0000-0000-000000000003"}', false);
select tests.throws(format('select public.revoke_invite(%L)', (select id from public.invites limit 1)),
  'STARTER-INV-7 a member cannot revoke (it is "not found")', 'invite not found');
reset role;
select id as revoke_id from public.invites where code_hash = sha256(convert_to(replace(:'revoke_code', '-', ''), 'UTF8')) \gset
update public.invites set expires_at = now() - interval '1 minute'
  where code_hash = sha256(convert_to(replace(:'expire_code', '-', ''), 'UTF8'));
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"02000000-0000-0000-0000-000000000002"}', false);
select tests.lives(format('select public.revoke_invite(%L)', :'revoke_id'), 'STARTER-INV-7 an admin revokes an invite');
select set_config('request.jwt.claims', '{"sub":"07000000-0000-0000-0000-000000000007"}', false);
select tests.throws(format('select public.redeem_invite(%L)', :'revoke_code'),
  'STARTER-INV-7 a revoked code is "not found"', 'invite not found');
select tests.throws(format('select public.redeem_invite(%L)', :'expire_code'),
  'STARTER-INV-7 an expired code is "not found"', 'invite not found');
select tests.ok((select count(*) from public.members where user_id = '07000000-0000-0000-0000-000000000007') = 0,
  'STARTER-INV-7 no membership from a dead code');
reset role;
