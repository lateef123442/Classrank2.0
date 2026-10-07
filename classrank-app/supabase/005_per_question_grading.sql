-- Phase: Production hardening (2/2) — per-question grading
--
-- The MVP graded a whole quiz in one batch RPC, which only worked because the
-- client already had every correct_index in memory to show instant
-- correct/wrong feedback per question — the same leak fixed in 004. This
-- redesign grades one answer at a time: the client sends a single
-- (question_id, selected_index), the server checks it against
-- quiz_questions (never exposed to the client directly) and returns whether
-- it was correct — revealing the answer only for the question just
-- submitted, after the student has already committed to their choice.
--
-- This also fixes the point-farming bug from the original design: the
-- unique (profile_id, question_id) constraint means a resubmitted answer is
-- a no-op — it returns the original result instead of paying out again.

drop function if exists submit_quiz_results(jsonb);

create or replace function submit_single_answer(
  p_question_id uuid,
  p_selected_index int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile_id uuid := auth.uid();
  v_correct_index int;
  v_is_correct boolean;
  v_points_earned int := 0;
  v_existing_attempt record;
  v_last_quiz_date date;
  v_current_streak int;
  v_new_streak int;
  v_new_total_points int;
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select correct_index into v_correct_index
  from quiz_questions
  where id = p_question_id;

  if v_correct_index is null then
    raise exception 'Question not found';
  end if;

  -- Idempotency: if this question was already answered, return the original
  -- result instead of grading (and paying out) again.
  select * into v_existing_attempt
  from quiz_attempts
  where profile_id = v_profile_id and question_id = p_question_id;

  if found then
    select total_points into v_new_total_points from profiles where id = v_profile_id;
    return jsonb_build_object(
      'is_correct', v_existing_attempt.is_correct,
      'correct_index', v_correct_index,
      'points_earned', 0,
      'already_answered', true,
      'total_points', v_new_total_points,
      'new_streak', (select current_streak from profiles where id = v_profile_id)
    );
  end if;

  v_is_correct := (p_selected_index = v_correct_index);
  v_points_earned := case when v_is_correct then 20 else 0 end + 5; -- +5 participation bonus

  insert into quiz_attempts (profile_id, question_id, selected_index, is_correct)
  values (v_profile_id, p_question_id, p_selected_index, v_is_correct);

  -- Streak: bump once per calendar day, not once per question. Safe to call
  -- on every question of the day since the branch logic is idempotent for
  -- same-day repeats (see 001_schema.sql design notes for rationale).
  select last_quiz_date, current_streak into v_last_quiz_date, v_current_streak
  from profiles where id = v_profile_id;

  if v_last_quiz_date is null or v_last_quiz_date < current_date - 1 then
    v_new_streak := 1;
  elsif v_last_quiz_date = current_date - 1 then
    v_new_streak := v_current_streak + 1;
  else
    v_new_streak := v_current_streak; -- already answered a question today
  end if;

  update profiles
  set total_points = total_points + v_points_earned,
      current_streak = v_new_streak,
      last_quiz_date = current_date
  where id = v_profile_id
  returning total_points into v_new_total_points;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'correct_index', v_correct_index,
    'points_earned', v_points_earned,
    'already_answered', false,
    'total_points', v_new_total_points,
    'new_streak', v_new_streak
  );
end;
$$;

revoke all on function submit_single_answer(uuid, int) from public;
grant execute on function submit_single_answer(uuid, int) to authenticated;
