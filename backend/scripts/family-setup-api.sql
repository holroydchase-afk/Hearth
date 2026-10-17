-- Fresh family setup in the 0011 shape (SPEC-GROUPS section 2), run by scripts/family-setup.sh through the
-- Supabase Management API: no psql, no database URL. Defines pg_temp.hearth_family_setup(); the runner calls
-- it in the same request and prints the lines it returns.
-- Runs AS CHASE through the same RPCs and RLS the app uses: it looks up Chase's account, then switches to the
-- authenticated role with his user id for the rest of the call. Safe to re-run until anyone else joins; after
-- that it refuses, because new links could change who sees what (use family-setup-v2.sql's dry run).
create or replace function pg_temp.hearth_family_setup(
  p_chase_email text, p_space_name text, p_danielle_email text, p_sister_name text)
returns setof text language plpgsql as $$
declare
  v_chase  uuid;
  v_space  uuid;
  v_sister text := nullif(btrim(coalesce(p_sister_name, '')), '');
  v_inv    public.invite_created;
  r        record;
begin
  select id into v_chase from auth.users where lower(email) = lower(btrim(p_chase_email));
  if v_chase is null then
    raise exception 'Chase has no account yet: sign in once in the app, then run this again.';
  end if;
  perform set_config('request.jwt.claim.sub', v_chase::text, true);
  perform set_config('role', 'authenticated', true);   -- from here on, everything goes through RLS as Chase

  select s.id into v_space
  from public.spaces s join public.space_members sm on sm.space_id = s.id
  where sm.user_id = v_chase and sm.role = 'owner' and s.name = p_space_name and s.deleted_at is null
  limit 1;
  if v_space is null then
    v_space := public.create_space(public.create_household(p_space_name), p_space_name);
  elsif exists (select 1 from public.space_members where space_id = v_space and user_id <> v_chase) then
    raise exception 'Someone else has joined "%" already, so this stops: new links could change who sees what. '
      'Use family-setup-v2.sql''s dry run instead, or make invites in the app.', p_space_name;
  end if;

  -- containers (reused by kind and name if they exist)
  for r in select * from (values
      (1, 'group', 'Chase''s side'), (2, 'group', 'Danielle''s side'),
      (3, 'household', 'Gammy''s house'), (4, 'household', 'Grandaddy and Grandmomma''s house'),
      (5, 'household', 'Gigi and Bebar''s house'), (6, 'household', 'Memaw''s house'),
      (7, 'household', 'Pawpaw and Granny''s house'), (8, 'household', 'Grandma Phyllis''s house'),
      (9, 'household', 'Test house'),
      (10, 'event', 'Charleston trip'), (11, 'event', 'Birthday at Gigi''s')) x(o, kind, name)
    union all
    select 12, 'household', v_sister || '''s house' where v_sister is not null
    order by 1 loop
    if not exists (select 1 from public.circles c where c.space_id = v_space and c.name = r.name and c.kind = r.kind and c.deleted_at is null) then
      perform public.create_level(v_space, r.kind, r.name);
    end if;
  end loop;

  -- links: households under the set groups; the events. The Test house is under nothing, so account B sees
  -- only Everyone and Test house posts.
  for r in select * from (values
      ('Chase''s side', 'Gammy''s house'), ('Chase''s side', 'Grandaddy and Grandmomma''s house'),
      ('Chase''s side', 'Gigi and Bebar''s house'),
      ('Danielle''s side', 'Memaw''s house'), ('Danielle''s side', 'Pawpaw and Granny''s house'),
      ('Danielle''s side', 'Grandma Phyllis''s house'),
      ('Charleston trip', 'Pawpaw and Granny''s house'),
      ('Birthday at Gigi''s', 'Grandaddy and Grandmomma''s house'), ('Birthday at Gigi''s', 'Gigi and Bebar''s house'),
      ('Birthday at Gigi''s', 'Pawpaw and Granny''s house')) x(parent, child)
    union all
    select 'Danielle''s side', v_sister || '''s house' where v_sister is not null
    union all
    select 'Charleston trip', v_sister || '''s house' where v_sister is not null loop
    perform public.link_level(
      (select id from public.circles where space_id = v_space and name = r.parent and deleted_at is null),
      (select id from public.circles where space_id = v_space and name = r.child and deleted_at is null), 'all');
  end loop;

  return next format('Family "%s" is ready: Everyone, Chase''s side, Danielle''s side, %s houses, 2 events.', p_space_name,
                     (select count(*) from public.circles where space_id = v_space and kind = 'household' and deleted_at is null));

  v_inv := public.create_invite(v_space, 'viewer',
             array[(select id from public.circles where space_id = v_space and name = 'Test house' and kind = 'household' and deleted_at is null)],
             p_history => 'all');
  return next format('Test viewer invite (account B): code %s, works once until %s%s', v_inv.code,
                     to_char(v_inv.expires_at at time zone 'America/New_York', 'Mon DD'),
                     coalesce(', link ' || v_inv.link, ''));

  if nullif(btrim(coalesce(p_danielle_email, '')), '') is not null then
    v_inv := public.create_invite(v_space, 'adult',
               array[(select id from public.circles where space_id = v_space and kind = 'everyone' and deleted_at is null)],
               'email', btrim(p_danielle_email));
    return next format('Danielle''s poster invite: code %s, works once until %s, only for %s%s', v_inv.code,
                       to_char(v_inv.expires_at at time zone 'America/New_York', 'Mon DD'), lower(btrim(p_danielle_email)),
                       coalesce(', link ' || v_inv.link, ''));
  end if;
end $$;
