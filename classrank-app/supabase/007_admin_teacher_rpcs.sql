-- Phase 4b: Teacher & Admin RPCs
-- Run after 006_roles_foundation.sql.
--
-- Every mutation a teacher or admin can perform goes through one of these
-- functions rather than direct table access. That keeps all the "is this
-- person actually allowed to do this" logic in one auditable place per
-- action, instead of spread across RLS policies that are easy to
-- under-scope (see the column-privilege note in 006 for why RLS alone
-- wasn't enough here).

-- ─────────────────────────────────────────────
-- 1. Teacher sign-up: redeem an invite code and create a teacher profile.
-- ─────────────────────────────────────────────
create or replace function complete_teacher_signup(
  p_name text,
  p_university text,
  p_department_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_code_row record;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_code_row
  from teacher_invite_codes
  where code = upper(trim(p_code)) and department_id = p_department_id
  for update;

  if not found then
    raise exception 'Invalid invite code for this department';
  end if;

  if v_code_row.used_by is not null then
    raise exception 'This invite code has already been used';
  end if;

  insert into profiles (id, name, university, department_id, year, role)
  values (v_caller_id, trim(p_name), trim(p_university), p_department_id, null, 'teacher')
  on conflict (id) do update set
    name = excluded.name,
    university = excluded.university,
    department_id = excluded.department_id,
    role = 'teacher';

  update teacher_invite_codes
  set used_by = v_caller_id, used_at = now()
  where id = v_code_row.id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function complete_teacher_signup(text, text, uuid, text) from public;
grant execute on function complete_teacher_signup(text, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────
-- 2. Teacher content management: create/edit/delete quiz questions.
--
-- Teachers may only touch their own department's questions; admins may
-- touch any department's. Editing or deleting a question that students have
-- already answered is blocked — changing the answer key after grading has
-- happened would retroactively make prior grading wrong, and deleting it
-- would orphan the points already awarded without a clear reversal story.
-- ─────────────────────────────────────────────

create or replace function teacher_upsert_question(
  p_id uuid,             -- null to create a new question
  p_department_id uuid,
  p_quiz_date date,
  p_question text,
  p_options text[],
  p_correct_index int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_department uuid;
  v_result_id uuid;
  v_has_attempts boolean;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select role, department_id into v_caller_role, v_caller_department
  from profiles where id = v_caller_id;

  if v_caller_role not in ('teacher', 'admin') then
    raise exception 'Not authorized';
  end if;

  if v_caller_role = 'teacher' and v_caller_department is distinct from p_department_id then
    raise exception 'Teachers can only manage questions for their own department';
  end if;

  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'At least two options are required';
  end if;
  if p_correct_index < 0 or p_correct_index >= array_length(p_options, 1) then
    raise exception 'correct_index out of range for the given options';
  end if;
  if trim(p_question) = '' then
    raise exception 'Question text cannot be empty';
  end if;

  if p_id is not null then
    select exists(select 1 from quiz_attempts where question_id = p_id) into v_has_attempts;
    if v_has_attempts then
      raise exception 'This question already has student answers and can no longer be edited';
    end if;

    update quiz_questions
    set department_id = p_department_id,
        quiz_date = p_quiz_date,
        question = trim(p_question),
        options = p_options,
        correct_index = p_correct_index
    where id = p_id
    returning id into v_result_id;

    if v_result_id is null then
      raise exception 'Question not found';
    end if;
  else
    insert into quiz_questions (department_id, quiz_date, question, options, correct_index)
    values (p_department_id, p_quiz_date, trim(p_question), p_options, p_correct_index)
    returning id into v_result_id;
  end if;

  return jsonb_build_object('id', v_result_id);
end;
$$;

revoke all on function teacher_upsert_question(uuid, uuid, date, text, text[], int) from public;
grant execute on function teacher_upsert_question(uuid, uuid, date, text, text[], int) to authenticated;

create or replace function teacher_delete_question(p_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_department uuid;
  v_question_department uuid;
  v_has_attempts boolean;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select role, department_id into v_caller_role, v_caller_department
  from profiles where id = v_caller_id;

  if v_caller_role not in ('teacher', 'admin') then
    raise exception 'Not authorized';
  end if;

  select department_id into v_question_department from quiz_questions where id = p_id;
  if v_question_department is null then
    raise exception 'Question not found';
  end if;

  if v_caller_role = 'teacher' and v_caller_department is distinct from v_question_department then
    raise exception 'Teachers can only delete questions for their own department';
  end if;

  select exists(select 1 from quiz_attempts where question_id = p_id) into v_has_attempts;
  if v_has_attempts then
    raise exception 'This question already has student answers and cannot be deleted';
  end if;

  delete from quiz_questions where id = p_id;
end;
$$;

revoke all on function teacher_delete_question(uuid) from public;
grant execute on function teacher_delete_question(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 3. Teacher dashboard stats (own department only, or any if admin).
-- ─────────────────────────────────────────────
create or replace function teacher_department_stats(p_department_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_department uuid;
  v_student_count int;
  v_avg_points numeric;
  v_today_question_count int;
  v_today_completions int;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select role, department_id into v_caller_role, v_caller_department
  from profiles where id = v_caller_id;

  if v_caller_role not in ('teacher', 'admin') then
    raise exception 'Not authorized';
  end if;
  if v_caller_role = 'teacher' and v_caller_department is distinct from p_department_id then
    raise exception 'Not authorized for this department';
  end if;

  select count(*), coalesce(round(avg(total_points), 1), 0)
    into v_student_count, v_avg_points
  from profiles
  where department_id = p_department_id and role = 'student';

  select count(*) into v_today_question_count
  from quiz_questions
  where department_id = p_department_id and quiz_date = current_date;

  select count(distinct qa.profile_id) into v_today_completions
  from quiz_attempts qa
  join quiz_questions qq on qq.id = qa.question_id
  where qq.department_id = p_department_id and qq.quiz_date = current_date;

  return jsonb_build_object(
    'student_count', v_student_count,
    'avg_points', v_avg_points,
    'today_question_count', v_today_question_count,
    'today_completions', v_today_completions
  );
end;
$$;

revoke all on function teacher_department_stats(uuid) from public;
grant execute on function teacher_department_stats(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 4. Admin: platform-wide stats.
-- ─────────────────────────────────────────────
create or replace function admin_platform_stats()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'total_students', (select count(*) from profiles where role = 'student'),
    'total_teachers', (select count(*) from profiles where role = 'teacher'),
    'total_departments', (select count(*) from departments),
    'total_points_awarded', (select coalesce(sum(total_points), 0) from profiles),
    'by_department', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'department', d.name,
        'faculty', d.faculty,
        'student_count', coalesce(sub.student_count, 0),
        'avg_points', coalesce(sub.avg_points, 0)
      ) order by d.name), '[]'::jsonb)
      from departments d
      left join (
        select department_id, count(*) as student_count, round(avg(total_points), 1) as avg_points
        from profiles
        where role = 'student'
        group by department_id
      ) sub on sub.department_id = d.id
    )
  );
end;
$$;

revoke all on function admin_platform_stats() from public;
grant execute on function admin_platform_stats() to authenticated;

-- ─────────────────────────────────────────────
-- 5. Admin: department management.
-- ─────────────────────────────────────────────
create or replace function admin_create_department(p_name text, p_faculty text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_caller_role text;
  v_id uuid;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;
  if trim(p_name) = '' or trim(p_faculty) = '' then
    raise exception 'Department name and faculty are required';
  end if;

  insert into departments (name, faculty) values (trim(p_name), trim(p_faculty))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function admin_create_department(text, text) from public;
grant execute on function admin_create_department(text, text) to authenticated;

-- ─────────────────────────────────────────────
-- 6. Admin: teacher invite code management.
-- ─────────────────────────────────────────────
create or replace function admin_create_invite_code(p_department_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_caller_role text;
  v_code text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into teacher_invite_codes (department_id, code) values (p_department_id, v_code);
  return v_code;
end;
$$;

revoke all on function admin_create_invite_code(uuid) from public;
grant execute on function admin_create_invite_code(uuid) to authenticated;

create or replace function admin_list_invite_codes(p_department_id uuid default null)
returns table (
  id uuid,
  department_id uuid,
  department_name text,
  code text,
  created_at timestamptz,
  used_by uuid,
  used_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  return query
  select c.id, c.department_id, d.name, c.code, c.created_at, c.used_by, c.used_at
  from teacher_invite_codes c
  join departments d on d.id = c.department_id
  where p_department_id is null or c.department_id = p_department_id
  order by c.created_at desc;
end;
$$;

revoke all on function admin_list_invite_codes(uuid) from public;
grant execute on function admin_list_invite_codes(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 7. Admin: user search and role management.
-- Reads auth.users for email, which is why this must be security definer —
-- authenticated clients have no direct access to the auth schema.
-- ─────────────────────────────────────────────
create or replace function admin_search_users(p_query text)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  department text,
  university text
)
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id, p.name, u.email::text, p.role, d.name, p.university
  from profiles p
  join auth.users u on u.id = p.id
  left join departments d on d.id = p.department_id
  where p.name ilike '%' || p_query || '%' or u.email ilike '%' || p_query || '%'
  order by p.name
  limit 50;
end;
$$;

revoke all on function admin_search_users(text) from public;
grant execute on function admin_search_users(text) to authenticated;

create or replace function admin_set_role(p_target_id uuid, p_new_role text)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  if p_new_role not in ('student', 'teacher', 'admin') then
    raise exception 'Invalid role';
  end if;

  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  if p_target_id = auth.uid() and p_new_role <> 'admin' then
    raise exception 'You cannot demote your own account';
  end if;

  update profiles set role = p_new_role where id = p_target_id;
end;
$$;

revoke all on function admin_set_role(uuid, text) from public;
grant execute on function admin_set_role(uuid, text) to authenticated;
