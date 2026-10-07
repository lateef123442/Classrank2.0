-- Phase 4d: Teacher question listing
-- Run after 007_admin_teacher_rpcs.sql.
--
-- Teachers need to see correct_index (to edit their own questions) and
-- whether a question already has student attempts (to know if it's still
-- editable — see the edit-lock logic in teacher_upsert_question). The public
-- quiz_questions_public view deliberately omits correct_index for students,
-- so this is a separate, authorization-checked path.

create or replace function teacher_list_questions(
  p_department_id uuid,
  p_quiz_date date default null -- null = all dates, most recent first
)
returns table (
  id uuid,
  department_id uuid,
  quiz_date date,
  question text,
  options text[],
  correct_index int,
  has_attempts boolean
)
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_department uuid;
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
    raise exception 'Teachers can only view questions for their own department';
  end if;

  return query
  select
    qq.id, qq.department_id, qq.quiz_date, qq.question, qq.options, qq.correct_index,
    exists(select 1 from quiz_attempts qa where qa.question_id = qq.id) as has_attempts
  from quiz_questions qq
  where qq.department_id = p_department_id
    and (p_quiz_date is null or qq.quiz_date = p_quiz_date)
  order by qq.quiz_date desc, qq.created_at desc
  limit 100;
end;
$$;

revoke all on function teacher_list_questions(uuid, date) from public;
grant execute on function teacher_list_questions(uuid, date) to authenticated;
