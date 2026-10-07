-- 029: per-course daily quiz, assessments, review, and ranking
-- Idempotent and safe to rerun.

alter table course_exams add column if not exists kind text not null default 'exam';
alter table course_exams add column if not exists topic_id uuid references course_topics (id) on delete set null;
alter table course_exams add column if not exists review_after_submit boolean not null default false;

update course_exams set kind = 'exam' where kind is null or kind = '';

create or replace function staff_create_exam(
  p_course_id uuid,
  p_title text,
  p_question_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes int,
  p_kind text default 'exam',
  p_topic_id uuid default null,
  p_review_after_submit boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_event uuid;
  v_exam uuid;
  v_found int;
begin
  if not is_course_staff(p_course_id) then
    raise exception 'Not authorized';
  end if;

  if p_question_ids is null or array_length(p_question_ids, 1) not between 3 and 60 then
    raise exception 'An exam needs 3 to 60 questions';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'The exam must end after it starts';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 5 and 240 then
    raise exception 'Duration must be 5 to 240 minutes';
  end if;

  if p_kind not in ('practical', 'test', 'exam') then
    raise exception 'Kind must be practical, test or exam';
  end if;

  if p_topic_id is not null and not exists (
    select 1 from course_topics t where t.id = p_topic_id and t.course_id = p_course_id
  ) then
    raise exception 'That topic does not belong to this course';
  end if;

  select jsonb_agg(jsonb_build_object(
            'id', q.id,
            'q', q.question,
            'topic', q.topic,
            'options', to_jsonb(q.options),
            'correct', q.correct_index,
            'explanation', q.explanation
          ) order by u.n),
         count(*)
    into v_snapshot, v_found
  from unnest(p_question_ids) with ordinality as u(id, n)
  join course_questions q on q.id = u.id and q.course_id = p_course_id;

  if v_found <> array_length(p_question_ids, 1) then
    raise exception 'Some questions do not belong to this course';
  end if;

  insert into course_events (course_id, kind, title, body, event_date, created_by)
  values (
    p_course_id,
    'exam',
    left(initcap(p_kind) || ': ' || trim(p_title), 120),
    format('Opens %s, closes %s (UTC). %s minutes once you start; one attempt.',
           to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           to_char(p_ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           p_duration_minutes),
    (p_starts_at at time zone 'UTC')::date,
    auth.uid()
  ) returning id into v_event;

  insert into course_exams (
    course_id, title, questions, starts_at, ends_at, duration_minutes, event_id,
    created_by, kind, topic_id, review_after_submit
  )
  values (
    p_course_id, trim(p_title), v_snapshot, p_starts_at, p_ends_at, p_duration_minutes,
    v_event, auth.uid(), p_kind, p_topic_id, coalesce(p_review_after_submit, false)
  ) returning id into v_exam;

  return jsonb_build_object('exam_id', v_exam, 'event_id', v_event);
end;
$$;

create or replace function list_course_exams(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff boolean;
begin
  v_staff := is_course_staff(p_course_id);
  if not (v_staff or is_course_member(p_course_id)) then
    raise exception 'Not authorized';
  end if;

  return coalesce((
    select jsonb_agg(x order by x.starts_at desc)
    from (
      select
        e.id,
        e.title,
        e.starts_at,
        e.ends_at,
        e.duration_minutes,
        e.kind,
        e.topic_id,
        e.review_after_submit,
        (not v_staff and not course_gate_open(e.course_id, e.topic_id)) as locked,
        jsonb_array_length(e.questions) as question_count,
        case when now() < e.starts_at then 'upcoming'
             when now() <= e.ends_at then 'open'
             else 'closed' end as status,
        (select jsonb_build_object(
             'started_at', a.started_at,
             'submitted', a.submitted_at is not null,
             'correct', a.correct,
             'total', a.total)
         from course_exam_attempts a
         where a.exam_id = e.id and a.profile_id = auth.uid()) as my_attempt,
        case when v_staff then (
          select count(*) from course_exam_attempts a where a.exam_id = e.id and a.submitted_at is not null
        ) end as submitted_count
      from course_exams e
      where e.course_id = p_course_id
      order by e.starts_at desc limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function start_course_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam course_exams;
  v_att course_exam_attempts;
  v_deadline timestamptz;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_member(v_exam.course_id) then
    raise exception 'Exam not found';
  end if;

  if now() < v_exam.starts_at then
    raise exception 'This exam has not opened yet';
  end if;

  select * into v_att
  from course_exam_attempts
  where exam_id = p_exam_id and profile_id = auth.uid();

  if not found then
    if now() >= v_exam.ends_at then
      raise exception 'This exam has closed';
    end if;

    if not course_gate_open(v_exam.course_id, v_exam.topic_id) then
      raise exception '%', case when v_exam.topic_id is null
        then 'Finish every topic in this course to unlock this ' || v_exam.kind
        else 'Finish the topic first to unlock this ' || v_exam.kind end;
    end if;

    insert into course_exam_attempts (exam_id, profile_id)
    values (p_exam_id, auth.uid())
    on conflict do nothing;

    select * into v_att
    from course_exam_attempts
    where exam_id = p_exam_id and profile_id = auth.uid();
  end if;

  if v_att.submitted_at is not null then
    raise exception 'You have already submitted this exam';
  end if;

  v_deadline := least(v_att.started_at + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at);
  if now() > v_deadline then
    raise exception 'Time is up for this exam';
  end if;

  return jsonb_build_object(
    'exam_id', v_exam.id,
    'title', v_exam.title,
    'server_now', now(),
    'started_at', v_att.started_at,
    'deadline', v_deadline,
    'questions', (
      select jsonb_agg(jsonb_build_object('q', e->>'q', 'options', e->'options') order by n)
      from jsonb_array_elements(v_exam.questions) with ordinality as t(e, n)
    )
  );
end;
$$;

create or replace function submit_course_exam(p_exam_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam course_exams;
  v_att course_exam_attempts;
  v_deadline timestamptz;
  v_total int;
  v_correct int;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_member(v_exam.course_id) then
    raise exception 'Exam not found';
  end if;

  select * into v_att
  from course_exam_attempts
  where exam_id = p_exam_id and profile_id = auth.uid()
  for update;

  if not found then
    raise exception 'Start the exam first';
  end if;

  if v_att.submitted_at is not null then
    raise exception 'You have already submitted this exam';
  end if;

  v_deadline := least(v_att.started_at + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at);
  if now() > v_deadline + interval '60 seconds' then
    raise exception 'Time was up, so this attempt was not recorded';
  end if;

  v_total := jsonb_array_length(v_exam.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answers do not match the exam';
  end if;

  select count(*) into v_correct
  from jsonb_array_elements(v_exam.questions) with ordinality as t(e, n)
  where (p_answers -> (n::int - 1))::text = (e->>'correct');

  update course_exam_attempts
     set submitted_at = now(), answers = p_answers, correct = v_correct, total = v_total
   where exam_id = p_exam_id and profile_id = auth.uid();

  update profiles
     set total_points = total_points + round(100.0 * v_correct / v_total)::int
   where profiles.id = auth.uid();

  return jsonb_build_object('correct', v_correct, 'total', v_total);
end;
$$;

create or replace function review_course_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam course_exams;
  v_mine jsonb;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not (is_course_member(v_exam.course_id) or is_course_staff(v_exam.course_id)) then
    raise exception 'Exam not found';
  end if;

  if now() <= v_exam.ends_at and not is_course_staff(v_exam.course_id)
     and not (v_exam.review_after_submit and exists (
       select 1 from course_exam_attempts a
       where a.exam_id = p_exam_id and a.profile_id = auth.uid() and a.submitted_at is not null
     )) then
    raise exception 'Answers are available after the exam closes';
  end if;

  select answers into v_mine
  from course_exam_attempts
  where exam_id = p_exam_id and profile_id = auth.uid();

  return (
    select jsonb_agg(jsonb_build_object(
             'q', e->>'q',
             'options', e->'options',
             'correct', (e->>'correct')::int,
             'explanation', e->>'explanation',
             'picked', v_mine -> (n::int - 1)
           ) order by n)
    from jsonb_array_elements(v_exam.questions) with ordinality as t(e, n)
  );
end;
$$;

create table if not exists course_daily_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  quiz_date date not null default current_date,
  question_ids uuid[] not null,
  answers jsonb,
  correct int check (correct >= 0),
  total int check (total > 0),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (course_id, profile_id, quiz_date)
);
create index if not exists idx_daily_sessions_course on course_daily_sessions (course_id, profile_id);

create or replace function get_course_daily_quiz(p_course_id uuid, p_count int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sess course_daily_sessions;
  v_ids uuid[];
  v_n int := least(greatest(coalesce(p_count, 5), 3), 10);
begin
  if v_uid is null or not is_course_member(p_course_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_sess
  from course_daily_sessions s
  where s.course_id = p_course_id and s.profile_id = v_uid and s.submitted_at is null and s.quiz_date >= current_date - 1
  order by s.quiz_date desc limit 1;

  if not found then
    select * into v_sess
    from course_daily_sessions s
    where s.course_id = p_course_id and s.profile_id = v_uid and s.quiz_date = current_date;

    if found then
      return jsonb_build_object('status', 'done', 'correct', v_sess.correct, 'total', v_sess.total);
    end if;

    with seen as (
      select coalesce(array_agg(u.qid), '{}'::uuid[]) as ids
      from course_daily_sessions s2, unnest(s2.question_ids) as u(qid)
      where s2.course_id = p_course_id and s2.profile_id = v_uid
    ), started as (
      select t.id
      from course_topics t
      where t.course_id = p_course_id and (
        exists (select 1 from course_topic_progress g where g.topic_id = t.id and g.profile_id = v_uid)
        or exists (
          select 1
          from course_material_views v
          join course_materials m on m.id = v.material_id
          where m.topic_id = t.id and v.profile_id = v_uid
        )
      )
    )
    select array_agg(pick.id) into v_ids
    from (
      select cq.id
      from course_questions cq, seen
      where cq.course_id = p_course_id and cq.in_daily and not cq.assessment_only
        and (cq.topic_id is null or cq.topic_id in (select st.id from started st))
      order by (cq.id = any (seen.ids)), random()
      limit v_n
    ) pick;

    if v_ids is null then
      return jsonb_build_object('status', 'locked');
    end if;

    insert into course_daily_sessions (course_id, profile_id, question_ids)
    values (p_course_id, v_uid, v_ids)
    returning * into v_sess;
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'questions', (
      select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.question, 'options', to_jsonb(q.options), 'topic', q.topic)
                       order by array_position(v_sess.question_ids, q.id))
      from course_questions q
      where q.id = any (v_sess.question_ids)
    )
  );
end;
$$;

create or replace function submit_course_daily_quiz(p_course_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sess course_daily_sessions;
  v_total int;
  v_correct int;
begin
  if v_uid is null or not is_course_member(p_course_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_sess
  from course_daily_sessions s
  where s.course_id = p_course_id and s.profile_id = v_uid and s.submitted_at is null and s.quiz_date >= current_date - 1
  order by s.quiz_date desc limit 1 for update;

  if not found then
    raise exception 'Open the daily quiz first';
  end if;

  v_total := array_length(v_sess.question_ids, 1);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answers do not match the quiz';
  end if;

  select count(*) into v_correct
  from unnest(v_sess.question_ids) with ordinality as u(qid, n)
  join course_questions q on q.id = u.qid
  where (p_answers -> (u.n::int - 1))::text = q.correct_index::text;

  update course_daily_sessions
     set submitted_at = now(), answers = p_answers, correct = v_correct, total = v_total
   where course_daily_sessions.id = v_sess.id;

  update profiles
     set total_points = total_points + v_correct * 5,
         current_streak = case
           when last_quiz_date = current_date then current_streak
           when last_quiz_date = current_date - 1 then current_streak + 1
           else 1
         end,
         last_quiz_date = current_date
   where profiles.id = v_uid;

  return jsonb_build_object(
    'correct', v_correct,
    'total', v_total,
    'review', (
      select jsonb_agg(jsonb_build_object('q', q.question, 'options', to_jsonb(q.options), 'correct', q.correct_index,
                                          'explanation', q.explanation, 'picked', p_answers -> (u.n::int - 1)) order by u.n)
      from unnest(v_sess.question_ids) with ordinality as u(qid, n)
      join course_questions q on q.id = u.qid
    )
  );
end;
$$;

create or replace function course_leaderboard(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then
    raise exception 'Not authorized';
  end if;

  return (
    with pts as (
      select a.profile_id, round(100.0 * a.correct / a.total)::int as p, 'assessment'::text as src
      from course_exam_attempts a
      join course_exams e on e.id = a.exam_id
      where e.course_id = p_course_id and a.submitted_at is not null
      union all
      select s.profile_id, s.correct * 5, 'daily'::text
      from course_daily_sessions s
      where s.course_id = p_course_id and s.submitted_at is not null
    ), agg as (
      select
        m.profile_id,
        pr.full_name as name,
        coalesce(sum(pts.p), 0)::int as points,
        (count(*) filter (where pts.src = 'assessment'))::int as assessments,
        (count(*) filter (where pts.src = 'daily'))::int as dailies
      from course_members m
      join profiles pr on pr.id = m.profile_id
      left join pts on pts.profile_id = m.profile_id
      where m.course_id = p_course_id
      group by m.profile_id, pr.full_name
    )
    select jsonb_agg(x order by x.points desc, x.name asc)
    from (
      select *
      from agg
      order by points desc, name asc
      limit 50
    ) x
  );
end;
$$;

revoke all on function staff_create_exam(uuid,text,uuid[],timestamptz,timestamptz,int,text,uuid,boolean) from public;
revoke all on function list_course_exams(uuid) from public;
revoke all on function start_course_exam(uuid) from public;
revoke all on function submit_course_exam(uuid,jsonb) from public;
revoke all on function review_course_exam(uuid) from public;
revoke all on function get_course_daily_quiz(uuid,int) from public;
revoke all on function submit_course_daily_quiz(uuid,jsonb) from public;
revoke all on function course_leaderboard(uuid) from public;

grant execute on function staff_create_exam(uuid,text,uuid[],timestamptz,timestamptz,int,text,uuid,boolean) to authenticated;
grant execute on function list_course_exams(uuid) to authenticated;
grant execute on function start_course_exam(uuid) to authenticated;
grant execute on function submit_course_exam(uuid,jsonb) to authenticated;
grant execute on function review_course_exam(uuid) to authenticated;
grant execute on function get_course_daily_quiz(uuid,int) to authenticated;
grant execute on function submit_course_daily_quiz(uuid,jsonb) to authenticated;
grant execute on function course_leaderboard(uuid) to authenticated;
