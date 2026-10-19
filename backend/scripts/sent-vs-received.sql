-- QA-3 (milestone 1 gate, "0 lost"): what one person shared vs what another can actually see.
-- Run by scripts/sent-vs-received.sh through the Supabase Management API. Read only.
-- "Sent" is the server's record of the sender's published posts (optionally only those shared to the named
-- groups). "Received" is checked AS THE RECEIVER, through the app's RLS: the post is visible and every photo
-- on it is ready to show. Prints post ids, counts and times only; never captions, emails, URLs or keys.
create or replace function pg_temp.hearth_sent_vs_received(
  p_sender_email text, p_receiver_email text, p_since timestamptz, p_audience text[])
returns setof text language plpgsql as $$
declare
  v_sender   uuid;
  v_receiver uuid;
  v_sent     uuid[];
  v_photos   int[];
  v_drafts   int;
  v_seen     int;
  v_ready    int;
  v_lost     int := 0;
  i          int;
  v_at       timestamptz[];
begin
  select id into v_sender from auth.users where lower(email) = lower(btrim(p_sender_email));
  if v_sender is null then raise exception 'The sender has no account (check --sender-email).'; end if;
  select id into v_receiver from auth.users where lower(email) = lower(btrim(p_receiver_email));
  if v_receiver is null then raise exception 'The receiver has no account (check --receiver-email).'; end if;

  -- The server's side: what the sender shared.
  select coalesce(array_agg(p.id order by p.published_at, p.id), '{}'),
         coalesce(array_agg((select count(*)::int from public.media_items m where m.post_id = p.id) order by p.published_at, p.id), '{}'),
         coalesce(array_agg(p.published_at order by p.published_at, p.id), '{}')
    into v_sent, v_photos, v_at
  from public.posts p
  where p.author_id = v_sender and p.status = 'published' and p.deleted_at is null
    and p.published_at >= p_since
    and (p_audience is null or exists (select 1 from public.post_audiences pa join public.circles c on c.id = pa.circle_id
                                       where pa.post_id = p.id and c.name = any (p_audience)));
  select count(*) into v_drafts from public.posts p
  where p.author_id = v_sender and p.status <> 'published' and p.deleted_at is null and p.created_at >= p_since;

  return next format('Sent since %s: %s published posts%s',
                     case when p_since = '-infinity' then 'the start' else to_char(p_since at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') end,
                     cardinality(v_sent),
                     case when p_audience is null then '' else format(' shared to %s', array_to_string(p_audience, ' or ')) end);
  if v_drafts > 0 then
    return next format('Not finished sending: %s post(s) still drafts (tapped Share but never published; check the sender''s upload queue)', v_drafts);
  end if;

  -- The receiver's side, through RLS as the receiver.
  perform set_config('request.jwt.claim.sub', v_receiver::text, true);
  perform set_config('role', 'authenticated', true);
  for i in 1 .. cardinality(v_sent) loop
    select count(*) into v_seen from public.posts p where p.id = v_sent[i];
    select count(*) into v_ready from public.media_items m where m.post_id = v_sent[i] and m.upload_status = 'ready';
    if v_seen = 0 or v_ready < v_photos[i] then
      v_lost := v_lost + 1;
      return next format('Missing: %s (shared %s, %s photo%s): %s', v_sent[i],
                         to_char(v_at[i] at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), v_photos[i],
                         case when v_photos[i] = 1 then '' else 's' end,
                         case when v_seen = 0 then 'the receiver can''t see this post'
                              else format('%s of %s photo%s not ready', v_photos[i] - v_ready, v_photos[i], case when v_photos[i] = 1 then '' else 's' end) end);
    end if;
  end loop;
  return next format('RESULT: sent %s, received %s, lost %s', cardinality(v_sent), cardinality(v_sent) - v_lost, v_lost);
end $$;
