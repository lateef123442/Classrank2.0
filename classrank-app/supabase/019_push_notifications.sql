-- Push notifications for course announcements / exam dates and group replies.
-- Run after 018. NOT yet executed. Pairs with the `notify` Edge Function (supabase/functions/notify).

-- "Already pushed" markers so a notification can be sent at most once per event/reply, even if a client retries.
alter table course_events add column if not exists notified_at timestamptz;
alter table group_replies add column if not exists notified_at timestamptz;

-- Register this device for the signed-in user. A token identifies a DEVICE, so if the same token is currently
-- attached to someone else (shared phone, previous owner never signed out) it is detached from them first —
-- otherwise their notifications would show up on this person's screen.
create or replace function register_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_token is null or char_length(p_token) not between 10 and 200 then raise exception 'Invalid push token'; end if;
  update profiles set expo_push_token = null where expo_push_token = p_token and id <> auth.uid();
  update profiles set expo_push_token = p_token where id = auth.uid();
end;
$$;

-- Opt out / sign out: stop sending pushes to this account.
create or replace function clear_push_token()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update profiles set expo_push_token = null where id = auth.uid();
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array['register_push_token', 'clear_push_token'])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
