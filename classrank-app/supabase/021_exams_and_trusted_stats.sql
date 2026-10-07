-- Teacher-scheduled timed exams + server-graded course statistics.
-- Run after 017_courses_and_groups.sql. NOT yet executed — test on staging first.
--
-- Two separate trust levels (be honest about this in the UI):
--
--  1. PRACTICE stats (report_course_answers). The student's phone holds the course questions *with*
--     answers (needed for offline practice), so a determined student can still pick the right option.
--     What changes here: the server now grades from the stored answer key using the option the student
--     PICKED, so the client can no longer simply claim "correct = true", and a student can't farm one
--     question repeatedly. Treat these numbers as "self-practice", not as proof.
--
--  2. EXAM results (below). The exam is a snapshot of questions delivered WITHOUT answers, the clock runs
--     on the server (the client only displays it), there is one attempt per student, grading is on the
--     server, and answers are revealed only after the exam window closes. These are the tamper-resistant
--     numbers. (A student can still look things up or get help — only supervision solves that.)
--
-- Tables have RLS on with no policies on purpose: all access goes through the functions below.

-- ─────────────────────────────────────────────
-- A. Practice reporting: grade on the server
-- ─────────────────────────────────────────────
alter table course_answer_events add column if not exists picked smallint check (picked between 0 and 3);

-- p_answers: [{"question_id": "...", "picked": 0-3}, ...]  (max 60 per call). Skipped questions (picked null) are
-- ignored. Any "correct" field a client sends is ignored. At most 3 recorded answers per student per question
-- per day, and each question counts once per call.
create or replace function report_course_answers(p_course_id uuid, p_answers jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_course_member(p_course_id) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 60 then
    raise exception 'Invalid answers payload';
  end if;

  insert into course_answer_events (course_id, question_id, profile_id, correct, picked)
  select p_course_id, q.id, auth.uid(), (a.picked = q.correct_index), a.picked
  from (
    select distinct on ((x->>'question_id')::uuid)
           (x->>'question_id')::uuid as question_id,
           (x->>'picked')::smallint as picked
    from jsonb_array_elements(p_answers) x
    where coalesce(x->>'picked', '') ~ '^[0-3]$'
      and coalesce(x->>'question_id', '') ~ '^[0-9a-fA-F-]{36}$'
  ) a
  join course_questions q on q.id = a.question_id and q.course_id = p_course_id
  where (
    select count(*) from course_answer_events e
    where e.profile_id = auth.uid() and e.question_id = q.id and e.created_at > now() - interval '1 day'
  ) < 3;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────
-- B. Timed exams
-- ─────────────────────────────────────────────
create table if not exists course_exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  -- snapshot: [{"id": uuid, "q": "...", "topic": "...", "options": [4], "correct": 0-3, "explanation": "..."}]
  -- editing or deleting the course question later does not change an exam that was already scheduled.
  questions jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 5 and 240),
  event_id uuid references course_events (id) on delete set null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 3 and 60)
);
create index if not exists idx_course_exams_course on course_exams (course_id, starts_at desc);

create table if not exists course_exam_attempts (
  exam_id uuid not null references course_exams (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb,
  correct int check (correct >= 0),
  total int check (total > 0),
  primary key (exam_id, profile_id)
);

alter table course_exams enable row level security;
alter table course_exam_attempts enable row level security;
-- (no policies on purpose)

-- Teacher/admin schedules an exam from existing course questions. Also posts the course's "exam" event so the
-- existing announcement push goes out; the returned event_id can be passed to notifyAnnouncement().
create or replace function staff_create_exam(
  p_course_id uuid, p_title text, p_question_ids uuid[],
  p_starts_at timestamptz, p_ends_at timestamptz, p_duration_minutes int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_snapshot jsonb;
  v_event uuid;
  v_exam uuid;
  v_found int;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if p_question_ids is null or array_length(p_question_ids, 1) not between 3 and 60 then
    raise exception 'An exam needs 3 to 60 questions';
  end if;
  if (select count(distinct x) from unnest(p_question_ids) x) <> array_length(p_question_ids, 1) then
    raise exception 'Duplicate questions in exam';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'The exam must end after it starts';
  end if;
  if p_ends_at <= now() then raise exception 'The exam window is already over'; end if;
  if p_duration_minutes is null or p_duration_minutes not between 5 and 240 then
    raise exception 'Duration must be 5 to 240 minutes';
  end if;
  if (select count(*) from course_exams where course_id = p_course_id) >= 50 then
    raise exception 'This course has too many exams. Delete an old one first';
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', q.id, 'q', q.question, 'topic', q.topic, 'options', to_jsonb(q.options),
           'correct', q.correct_index, 'explanation', q.explanation
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
    p_course_id, 'exam', left('Exam: ' || trim(p_title), 120),
    format('Opens %s, closes %s (UTC). %s minutes once you start; one attempt.',
           to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           to_char(p_ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           p_duration_minutes),
    (p_starts_at at time zone 'UTC')::date, auth.uid()
  ) returning id into v_event;

  insert into course_exams (course_id, title, questions, starts_at, ends_at, duration_minutes, event_id, created_by)
  values (p_course_id, trim(p_title), v_snapshot, p_starts_at, p_ends_at, p_duration_minutes, v_event, auth.uid())
  returning id into v_exam;

  return jsonb_build_object('exam_id', v_exam, 'event_id', v_event);
end;
$$;

create or replace function staff_delete_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_exam course_exams;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_staff(v_exam.course_id) then raise exception 'Exam not found'; end if;
  delete from course_exams where id = p_exam_id;
  if v_exam.event_id is not null then delete from course_events where id = v_exam.event_id; end if;
end;
$$;

-- Exams of a course (no questions). Members see their own attempt; staff also see participation.
create or replace function list_course_exams(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_staff boolean;
begin
  v_staff := is_course_staff(p_course_id);
  if not (v_staff or is_course_member(p_course_id)) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(x order by x.starts_at desc) from (
      select e.id, e.title, e.starts_at, e.ends_at, e.duration_minutes,
        jsonb_array_length(e.questions) as question_count,
        case when now() < e.starts_at then 'upcoming'
             when now() <= e.ends_at then 'open'
             else 'closed' end as status,
        (select jsonb_build_object(
            'started_at', a.started_at, 'submitted', a.submitted_at is not null,
            'correct', a.correct, 'total', a.total)
           from course_exam_attempts a where a.exam_id = e.id and a.profile_id = auth.uid()) as my_attempt,
        case when v_staff then (select count(*) from course_exam_attempts a
                                where a.exam_id = e.id and a.submitted_at is not null) end as submitted_count
      from course_exams e where e.course_id = p_course_id
      order by e.starts_at desc limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Starts (or resumes) the caller's single attempt. Returns the questions WITHOUT answers, plus the server's
-- clock and the hard deadline so the app can show a countdown that doesn't depend on the phone's clock.
create or replace function start_course_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_exam course_exams;
  v_att course_exam_attempts;
  v_deadline timestamptz;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_member(v_exam.course_id) then raise exception 'Exam not found'; end if;
  if now() < v_exam.starts_at then raise exception 'This exam has not opened yet'; end if;

  select * into v_att from course_exam_attempts where exam_id = p_exam_id and profile_id = auth.uid();
  if not found then
    if now() >= v_exam.ends_at then raise exception 'This exam has closed'; end if;
    insert into course_exam_attempts (exam_id, profile_id) values (p_exam_id, auth.uid())
    on conflict do nothing;
    select * into v_att from course_exam_attempts where exam_id = p_exam_id and profile_id = auth.uid();
  end if;
  if v_att.submitted_at is not null then raise exception 'You have already submitted this exam'; end if;

  v_deadline := least(v_att.started_at + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at);
  if now() > v_deadline then raise exception 'Time is up for this exam'; end if;

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

-- p_answers: one entry per question — the chosen option index 0-3, or null if skipped. Accepted until the
-- deadline plus a 60 s grace for network lag; after that the attempt stays unsubmitted and counts as 0.
create or replace function submit_course_exam(p_exam_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_exam course_exams;
  v_att course_exam_attempts;
  v_deadline timestamptz;
  v_total int;
  v_correct int;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_member(v_exam.course_id) then raise exception 'Exam not found'; end if;

  select * into v_att from course_exam_attempts
   where exam_id = p_exam_id and profile_id = auth.uid() for update;
  if not found then raise exception 'Start the exam first'; end if;
  if v_att.submitted_at is not null then raise exception 'You have already submitted this exam'; end if;

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

  return jsonb_build_object('correct', v_correct, 'total', v_total);
end;
$$;

-- Answers + explanations + your picks, only once the exam window has closed for everyone.
create or replace function review_course_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_exam course_exams;
  v_mine jsonb;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not (is_course_member(v_exam.course_id) or is_course_staff(v_exam.course_id)) then
    raise exception 'Exam not found';
  end if;
  if now() <= v_exam.ends_at and not is_course_staff(v_exam.course_id) then
    raise exception 'Answers are available after the exam closes';
  end if;
  select answers into v_mine from course_exam_attempts where exam_id = p_exam_id and profile_id = auth.uid();
  return (
    select jsonb_agg(jsonb_build_object(
             'q', e->>'q', 'options', e->'options', 'correct', (e->>'correct')::int,
             'explanation', e->>'explanation', 'picked', v_mine -> (n::int - 1)
           ) order by n)
    from jsonb_array_elements(v_exam.questions) with ordinality as t(e, n)
  );
end;
$$;

-- Staff: per-student results (everyone enrolled; no submission = 0) and per-question difficulty.
create or replace function staff_exam_results(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_exam course_exams;
begin
  select * into v_exam from course_exams where id = p_exam_id;
  if not found or not is_course_staff(v_exam.course_id) then raise exception 'Exam not found'; end if;
  return jsonb_build_object(
    'title', v_exam.title,
    'total', jsonb_array_length(v_exam.questions),
    'students', coalesce((
      select jsonb_agg(s order by s.correct desc nulls last, s.name) from (
        select pr.name,
               (a.submitted_at is not null) as submitted,
               (a.profile_id is not null) as started,
               coalesce(a.correct, 0) as correct,
               case when a.submitted_at is not null
                    then extract(epoch from (a.submitted_at - a.started_at))::int end as seconds
        from course_members m
        join profiles pr on pr.id = m.profile_id
        left join course_exam_attempts a on a.exam_id = p_exam_id and a.profile_id = m.profile_id
        where m.course_id = v_exam.course_id
      ) s), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('q', k.q, 'attempts', k.attempts, 'pct_correct',
               case when k.attempts > 0 then round(100.0 * k.right_count / k.attempts) end) order by k.n)
      from (
        select t.n, t.e->>'q' as q,
               count(a.profile_id) as attempts,
               count(*) filter (where (a.answers -> (t.n::int - 1))::text = (t.e->>'correct')) as right_count
        from jsonb_array_elements(v_exam.questions) with ordinality as t(e, n)
        left join course_exam_attempts a on a.exam_id = p_exam_id and a.submitted_at is not null
        group by t.n, t.e
      ) k), '[]'::jsonb)
  );
end;
$$;

-- Lock down: signed-in users only.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'report_course_answers', 'staff_create_exam', 'staff_delete_exam', 'list_course_exams',
      'start_course_exam', 'submit_course_exam', 'review_course_exam', 'staff_exam_results'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
