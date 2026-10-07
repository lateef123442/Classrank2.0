-- Finds files in the 'course-files' bucket that no material points at (never registered, or left behind when a
-- course was deleted another way). Run after 022. NOT yet executed — test on staging first.
-- Deleting rows from storage.objects with SQL would NOT remove the stored bytes, so this only LISTS orphans;
-- the sweep-files Edge Function removes them through the Storage API.
-- A grace period protects uploads that are still waiting to be registered.

create or replace function orphan_course_files(p_older_than interval default interval '1 hour', p_limit int default 500)
returns table (name text) language sql security definer set search_path = public as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'course-files'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from course_materials m where m.kind = 'file' and m.body = o.name)
  order by o.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

-- Service role only: no client may list orphans.
revoke all on function orphan_course_files(interval, int) from public, anon, authenticated;
grant execute on function orphan_course_files(interval, int) to service_role;
