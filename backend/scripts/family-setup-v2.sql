-- family-setup v2 (docs/product/SPEC-GROUPS.md section 2 and section 8 step 3; privacy review item 14).
-- Re-seeds Chase's family into the fixed shape, AS CHASE, through the same RPCs and RLS the app uses:
--   Everyone; set groups Chase's side and Danielle's side; households under them; the Charleston trip and
--   Birthday at Gigi's events. People are placed by the name the family uses (their display name).
--   Posts Chase sent to a v1 group move to the matching household; then the v1 groups are retired.
-- This CHANGES WHO SEES WHAT, so by default it is a DRY RUN: it does everything inside a transaction, prints
-- each person's posts gained and lost, and rolls back. Apply only after Chase reads the report, says yes, and
-- a backup is taken:
--
--   psql "$SUPABASE_DB_URL" -v chase_email=you@example.com -v space_name='Our kids' \
--        [-v sister_name='Danielle''s sister'] [-v apply=yes] -f backend/scripts/family-setup-v2.sql
--
-- sister_name (optional): the name Danielle's sister uses; she is placed in Memaw's house AND Pawpaw and
-- Granny's house (the sibling workaround), and gets her own house in the Charleston trip.
-- Safe to re-run: it reuses everything it made before. Never run against hosted without the dry run first.
\set ON_ERROR_STOP 1

select set_config('request.jwt.claim.sub', id::text, false) as chase_id
from auth.users where lower(email) = lower(:'chase_email') \gset
\if :{?chase_id}
\else
  \echo 'Chase has no account yet: sign in once in the app, then run this again.'
  \quit
\endif
\if :{?apply}
\else
  \set apply no
\endif
\if :{?sister_name}
\else
  \set sister_name ''
\endif
select (:'apply' = 'yes') as v2_apply \gset

begin;
select set_config('hearth.space_name', :'space_name', true) as _ignore,
       set_config('hearth.sister_name', :'sister_name', true) as _ignore2 \gset
create temp table v2_seen (phase text, user_id uuid, post_id uuid) on commit drop;
create temp table v2_report (n serial, line text) on commit drop;
grant all on v2_seen, v2_report to authenticated;
grant usage on sequence v2_report_n_seq to authenticated;
set local role authenticated;

do $$
declare
  v_chase  uuid := auth.uid();
  v_space  uuid;
  v_sister text := nullif(btrim(current_setting('hearth.sister_name')), '');
  v_posts  uuid[];
  v_id     uuid;
  v_aud    uuid[];
  v_new    uuid[];
  r        record;
  m        record;
begin
  select s.id into v_space
  from public.spaces s join public.space_members sm on sm.space_id = s.id
  where sm.user_id = v_chase and sm.role = 'owner' and s.name = current_setting('hearth.space_name') and s.deleted_at is null
  limit 1;
  if v_space is null then
    raise exception 'no family named "%" owned by this account (run family-setup.sql first)', current_setting('hearth.space_name');
  end if;

  -- who sees what, before
  select coalesce(array_agg(p.id), '{}') into v_posts from public.posts p
  where p.space_id = v_space and p.status = 'published' and p.deleted_at is null;
  for m in select sm.user_id from public.space_members sm where sm.space_id = v_space loop
    perform set_config('request.jwt.claim.sub', m.user_id::text, true);
    insert into v2_seen select 'before', m.user_id, x from unnest(v_posts) x where public.can_view_post(x);
  end loop;
  perform set_config('request.jwt.claim.sub', v_chase::text, true);

  -- containers (reused by kind and name if they exist)
  for r in select * from (values
      (1, 'group', 'Chase''s side'), (2, 'group', 'Danielle''s side'),
      (3, 'household', 'Gammy''s house'), (4, 'household', 'Grandaddy and Grandmomma''s house'),
      (5, 'household', 'Gigi and Bebar''s house'), (6, 'household', 'Memaw''s house'),
      (7, 'household', 'Pawpaw and Granny''s house'), (8, 'household', 'Grandma Phyllis''s house'),
      (9, 'event', 'Charleston trip'), (10, 'event', 'Birthday at Gigi''s')) x(o, kind, name)
    union all
    select 11, 'household', v_sister || '''s house' where v_sister is not null
    order by 1 loop
    if not exists (select 1 from public.circles c where c.space_id = v_space and c.name = r.name and c.kind = r.kind and c.deleted_at is null) then
      perform public.create_level(v_space, r.kind, r.name);
    end if;
  end loop;

  -- links: households under the set groups; the events
  for r in select * from (values
      ('Chase''s side', 'Gammy''s house'), ('Chase''s side', 'Grandaddy and Grandmomma''s house'),
      ('Chase''s side', 'Gigi and Bebar''s house'),
      ('Danielle''s side', 'Memaw''s house'), ('Danielle''s side', 'Pawpaw and Granny''s house'),
      ('Danielle''s side', 'Grandma Phyllis''s house'),
      ('Charleston trip', 'Pawpaw and Granny''s house'),
      ('Birthday at Gigi''s', 'Grandaddy and Grandmomma''s house'), ('Birthday at Gigi''s', 'Gigi and Bebar''s house'),
      ('Birthday at Gigi''s', 'Pawpaw and Granny''s house')) x(parent, child)
    union all
    select 'Charleston trip', v_sister || '''s house' where v_sister is not null loop
    perform public.link_level(
      (select id from public.circles where space_id = v_space and name = r.parent and deleted_at is null),
      (select id from public.circles where space_id = v_space and name = r.child and deleted_at is null), 'all');
  end loop;

  -- people, by the name the family uses ("Share all past photos": they keep what they see today)
  for r in select x.house, sm.user_id
           from (values ('Gammy''s house', 'Gammy'), ('Grandaddy and Grandmomma''s house', 'Grandaddy'),
                        ('Grandaddy and Grandmomma''s house', 'Grandmomma'), ('Gigi and Bebar''s house', 'Gigi'),
                        ('Gigi and Bebar''s house', 'Bebar'), ('Memaw''s house', 'Memaw'),
                        ('Pawpaw and Granny''s house', 'Pawpaw'), ('Pawpaw and Granny''s house', 'Granny'),
                        ('Grandma Phyllis''s house', 'Grandma Phyllis')) x(house, who)
           join public.profiles pr on lower(btrim(pr.display_name)) = lower(x.who)
           join public.space_members sm on sm.space_id = v_space and sm.user_id = pr.id and sm.role = 'viewer'
           union all
           select h.house, sm.user_id
           from (values ('Memaw''s house'), ('Pawpaw and Granny''s house'), (v_sister || '''s house')) h(house)
           join public.profiles pr on v_sister is not null and lower(btrim(pr.display_name)) = lower(v_sister)
           join public.space_members sm on sm.space_id = v_space and sm.user_id = pr.id and sm.role = 'viewer' loop
    perform public.place_person((select id from public.circles where space_id = v_space and name = r.house
                                 and kind = 'household' and deleted_at is null), r.user_id, 'all');
  end loop;

  -- Chase's posts to a v1 group move to the matching household (other authors' posts keep their audience)
  for r in select p.id from public.posts p where p.space_id = v_space and p.author_id = v_chase and p.deleted_at is null loop
    select array_agg(pa.circle_id) into v_aud from public.post_audiences pa where pa.post_id = r.id;
    select array_agg(distinct coalesce(t.id, a)) into v_new
    from unnest(v_aud) a
    join public.circles c on c.id = a
    left join (values ('Chase''s mom''s side', 'Gammy''s house'), ('Chase''s dad''s side', 'Grandaddy and Grandmomma''s house'),
                      ('Danielle''s mom''s side', 'Memaw''s house'), ('Danielle''s dad''s side', 'Pawpaw and Granny''s house')) mp(old, new)
      on mp.old = c.name and c.kind = 'group'
    left join public.circles t on t.space_id = v_space and t.name = mp.new and t.kind = 'household' and t.deleted_at is null;
    if v_new is not null and v_new is distinct from v_aud
       and (select array_agg(x order by x) from unnest(v_new) x) is distinct from (select array_agg(x order by x) from unnest(v_aud) x) then
      perform public.set_post_audience(r.id, v_new);
    end if;
  end loop;

  -- retire the v1 groups (anything of kind group other than the two set groups)
  for r in select c.id from public.circles c
           where c.space_id = v_space and c.kind = 'group' and c.deleted_at is null
             and c.name not in ('Chase''s side', 'Danielle''s side') loop
    perform public.retire_level(r.id);
  end loop;

  -- who sees what, after; the report
  for m in select sm.user_id from public.space_members sm where sm.space_id = v_space loop
    perform set_config('request.jwt.claim.sub', m.user_id::text, true);
    insert into v2_seen select 'after', m.user_id, x from unnest(v_posts) x where public.can_view_post(x);
  end loop;
  perform set_config('request.jwt.claim.sub', v_chase::text, true);

  for m in select sm.user_id, pr.display_name, sm.role,
                  (select count(*) from v2_seen a where a.phase = 'after' and a.user_id = sm.user_id
                     and not exists (select 1 from v2_seen b where b.phase = 'before' and b.user_id = a.user_id and b.post_id = a.post_id)) as gained,
                  (select count(*) from v2_seen b where b.phase = 'before' and b.user_id = sm.user_id
                     and not exists (select 1 from v2_seen a where a.phase = 'after' and a.user_id = b.user_id and a.post_id = b.post_id)) as lost
           from public.space_members sm join public.profiles pr on pr.id = sm.user_id
           where sm.space_id = v_space and sm.role <> 'owner'
           order by pr.display_name loop
    insert into v2_report (line) values (format('%s: gains %s post%s, loses %s post%s', m.display_name,
      m.gained, case when m.gained = 1 then '' else 's' end, m.lost, case when m.lost = 1 then '' else 's' end));
  end loop;
  for m in select pr.display_name from public.space_members sm join public.profiles pr on pr.id = sm.user_id
           where sm.space_id = v_space and sm.role = 'viewer'
             and not exists (select 1 from public.circle_people cp join public.circles h on h.id = cp.circle_id and h.space_id = v_space
                             where cp.user_id = sm.user_id)
           order by pr.display_name loop
    insert into v2_report (line) values (format('Not placed (no house for this name): %s', m.display_name));
  end loop;
end $$;

\pset tuples_only on
\pset format unaligned
select line from v2_report order by n;
\pset tuples_only off
\pset format aligned
\if :v2_apply
  commit;
  \echo 'APPLIED: the family now has the new shape. Keep the backup until Chase has checked the app.'
\else
  rollback;
  \echo 'DRY RUN: nothing was changed. Read the lines above with Chase; to apply, take a backup and add -v apply=yes.'
\endif
