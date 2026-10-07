-- Cloud backup of each student's personal study data (notes, questions, quiz history, flashcards, plans, prefs),
-- so a new or reinstalled phone restores everything. Run after 019. NOT yet executed — test on staging first.
--
-- One private row per student. Row-level security is on with NO policies and no grants on the table itself:
-- the only way in or out is the two functions below, each scoped to auth.uid(). Teachers and other students can't read it.
-- Concurrent devices are handled with a revision number (optimistic concurrency): a push only succeeds if the
-- caller saw the latest revision; otherwise the app pulls, merges the two copies on the device, and pushes again.

create table if not exists study_sync (
  profile_id uuid primary key references profiles (id) on delete cascade,  -- removed automatically when the account is deleted
  data jsonb not null,
  revision int not null default 1,
  updated_at timestamptz not null default now()
);
alter table study_sync enable row level security;

create or replace function pull_study_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return (
    select jsonb_build_object('revision', s.revision, 'data', s.data, 'updated_at', s.updated_at)
    from study_sync s where s.profile_id = auth.uid()
  );  -- null when this student has never backed up
end;
$$;

-- Returns {"ok": true, "revision": n} on success, or {"ok": false, "revision": n} if the server has moved on
-- (the caller should pull, merge, and retry).
create or replace function push_study_data(p_data jsonb, p_base_revision int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cur int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid study data'; end if;
  if octet_length(p_data::text) > 5000000 then raise exception 'Your study data is too large to back up'; end if;

  select revision into v_cur from study_sync where profile_id = v_uid for update;
  if not found then
    insert into study_sync (profile_id, data, revision) values (v_uid, p_data, 1) on conflict (profile_id) do nothing;
    if found then return jsonb_build_object('ok', true, 'revision', 1); end if;
    -- another device created the row between our check and insert: report its revision so the caller merges
    select revision into v_cur from study_sync where profile_id = v_uid;
    return jsonb_build_object('ok', false, 'revision', v_cur);
  end if;

  if v_cur <> p_base_revision then
    return jsonb_build_object('ok', false, 'revision', v_cur);
  end if;
  update study_sync set data = p_data, revision = v_cur + 1, updated_at = now() where profile_id = v_uid;
  return jsonb_build_object('ok', true, 'revision', v_cur + 1);
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array['pull_study_data', 'push_study_data'])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
