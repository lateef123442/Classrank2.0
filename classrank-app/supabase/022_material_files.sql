-- File attachments for course materials (PDF, images, Office docs, text). NOT yet executed — test on staging first.
-- Run after 017_courses_and_groups.sql.
--
-- Design:
--  * One PRIVATE bucket, 'course-files'. Objects live at  <course_id>/<random>-<safe name>.
--  * Storage policies decide who can touch objects: course staff upload/delete inside their own course
--    folder; enrolled students and staff can read (needed to mint a short-lived signed link). No update
--    policy, so an uploaded file can't be overwritten.
--  * The bucket itself enforces a 10 MB limit and a MIME allow-list (no HTML/SVG/scripts/executables).
--  * A file only appears to students once the teacher registers it with staff_add_file_material(), which
--    re-checks the object exists, takes its REAL size/type from storage (not from the client), and caps the
--    number of files per course.
--  * Students open files through a signed URL that expires in minutes; the bucket is never public.
-- Known gaps: the app removes a course's files before deleting the course (best effort, so a failed cleanup or a
-- course deleted another way, e.g. account deletion, leaves orphans); a file uploaded but never registered stays
-- orphaned. Sweep with 023 + the sweep-files function. No virus scanning. Files open in the phone's browser/viewer, not in the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files', 'course-files', false, 10485760,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'text/plain', 'text/markdown', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a course id, or null when it isn't one (avoids a cast error inside policies).
create or replace function course_file_course(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end;
$$;

drop policy if exists "course files: staff upload" on storage.objects;
drop policy if exists "course files: members read" on storage.objects;
drop policy if exists "course files: staff delete" on storage.objects;

create policy "course files: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-files' and course_file_course(name) is not null and is_course_staff(course_file_course(name)));

create policy "course files: members read" on storage.objects for select to authenticated
  using (bucket_id = 'course-files' and course_file_course(name) is not null
         and (is_course_member(course_file_course(name)) or is_course_staff(course_file_course(name))));

create policy "course files: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-files' and course_file_course(name) is not null and is_course_staff(course_file_course(name)));

-- ─────────────────────────────────────────────
-- Materials table: allow kind 'file' + file details
-- ─────────────────────────────────────────────
alter table course_materials drop constraint if exists course_materials_kind_check;
alter table course_materials add constraint course_materials_kind_check check (kind in ('note', 'link', 'video', 'file'));
alter table course_materials add column if not exists file_name text;
alter table course_materials add column if not exists file_size bigint;
alter table course_materials add column if not exists mime text;

-- Text/link/video only: files must be registered through staff_add_file_material (which checks storage).
create or replace function staff_upsert_material(
  p_id uuid, p_course_id uuid, p_topic text, p_title text, p_kind text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if p_kind not in ('note', 'link', 'video') then raise exception 'Use the file upload for files'; end if;
  if p_id is null then
    insert into course_materials (course_id, topic, title, kind, body, created_by)
    values (p_course_id, coalesce(trim(p_topic), ''), trim(p_title), p_kind, trim(p_body), auth.uid())
    returning id into v_id;
  else
    update course_materials set topic = coalesce(trim(p_topic), ''), title = trim(p_title), kind = p_kind, body = trim(p_body)
    where id = p_id and course_id = p_course_id and kind <> 'file' returning id into v_id;
    if v_id is null then raise exception 'Material not found'; end if;
  end if;
  return v_id;
end;
$$;

-- Registers an object the teacher already uploaded. Size and type come from storage, not from the client.
create or replace function staff_add_file_material(
  p_course_id uuid, p_topic text, p_title text, p_path text, p_file_name text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_obj storage.objects;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if p_path is null or left(p_path, char_length(p_course_id::text) + 1) <> p_course_id::text || '/' then
    raise exception 'File is not in this course''s folder';
  end if;
  select * into v_obj from storage.objects where bucket_id = 'course-files' and name = p_path;
  if not found then raise exception 'The upload did not finish. Try again'; end if;
  if (select count(*) from course_materials where course_id = p_course_id and kind = 'file') >= 40 then
    raise exception 'This course already has 40 files. Delete one first';
  end if;
  insert into course_materials (course_id, topic, title, kind, body, file_name, file_size, mime, created_by)
  values (
    p_course_id, coalesce(trim(p_topic), ''), trim(p_title), 'file', p_path,
    left(coalesce(nullif(trim(p_file_name), ''), 'file'), 200),
    nullif(v_obj.metadata->>'size', '')::bigint, v_obj.metadata->>'mimetype', auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Same as 017 plus the file columns on materials.
create or replace function get_course_content(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then
    raise exception 'Not authorized';
  end if;
  return jsonb_build_object(
    'course', (select jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title) from courses c where c.id = p_course_id),
    'materials', coalesce((select jsonb_agg(m order by m.created_at) from (
        select id, topic, title, kind, body, file_name, file_size, mime, created_at
        from course_materials where course_id = p_course_id order by created_at limit 300) m), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(q order by q.created_at) from (
        select id, topic, question, options, correct_index, explanation, created_at
        from course_questions where course_id = p_course_id order by created_at limit 500) q), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select id, kind, title, body, event_date, created_at from course_events where course_id = p_course_id order by created_at desc limit 50) e), '[]'::jsonb)
  );
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'staff_upsert_material', 'staff_add_file_material', 'get_course_content', 'course_file_course'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
