-- Group quizzes: any member shares a quiz with their study group; members take it once and are ranked.
-- Run after 017_courses_and_groups.sql (uses study_groups, is_group_member). NOT yet executed — test on staging first.
--
-- Anti-cheating design: the questions (with correct answers) are stored here but are NEVER returned to the
-- taker. get_group_quiz() strips them, and submit_group_quiz() grades on the server. After you've submitted,
-- review_group_quiz() reveals the answers. The tables have RLS on with no policies, so they are reachable
-- only through these functions.

create table if not exists group_quizzes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups (id) on delete cascade,
  created_by uuid not null references profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  questions jsonb not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 3 and 20)
);
create index if not exists idx_group_quizzes_group on group_quizzes (group_id, created_at desc);

create table if not exists group_quiz_results (
  quiz_id uuid not null references group_quizzes (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  correct int not null check (correct >= 0),
  total int not null check (total > 0),
  seconds int not null default 0 check (seconds >= 0),
  created_at timestamptz not null default now(),
  primary key (quiz_id, profile_id)
);

alter table group_quizzes enable row level security;
alter table group_quiz_results enable row level security;
-- (no policies on purpose: all access goes through the functions below)

-- p_questions: [{"q": "...", "options": ["a","b","c","d"], "correct": 0-3, "explanation": "..."}, ...]
create or replace function create_group_quiz(p_group_id uuid, p_title text, p_questions jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_q jsonb;
  v_clean jsonb;
begin
  if not is_group_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'A quiz needs 3 to 20 questions';
  end if;
  if (select count(*) from group_quizzes where group_id = p_group_id) >= 30 then
    raise exception 'This group has too many quizzes. Delete an old one first';
  end if;

  for v_q in select jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_q->'options') is distinct from 'array'
       or jsonb_array_length(v_q->'options') <> 4
       or coalesce(char_length(trim(v_q->>'q')), 0) = 0
       or coalesce(v_q->>'correct', '') !~ '^[0-3]$' then
      raise exception 'Each question needs text, four options and a correct answer (0-3)';
    end if;
  end loop;

  -- Store only the fields we expect, in order, trimmed and length-limited.
  select jsonb_agg(jsonb_build_object(
           'q', left(trim(e->>'q'), 600),
           'options', e->'options',
           'correct', (e->>'correct')::int,
           'explanation', left(coalesce(e->>'explanation', ''), 1000)
         ) order by n)
    into v_clean
    from jsonb_array_elements(p_questions) with ordinality as t(e, n);

  insert into group_quizzes (group_id, created_by, title, questions)
  values (p_group_id, auth.uid(), trim(p_title), v_clean)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function list_group_quizzes(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select g.id, g.title, g.created_at, g.created_by, pr.name as author_name,
        jsonb_array_length(g.questions) as question_count,
        (select count(*) from group_quiz_results r where r.quiz_id = g.id) as participants,
        (select jsonb_build_object('correct', r.correct, 'total', r.total)
           from group_quiz_results r where r.quiz_id = g.id and r.profile_id = auth.uid()) as my_result
      from group_quizzes g
      join profiles pr on pr.id = g.created_by
      where g.group_id = p_group_id
      order by g.created_at desc
      limit 30
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Questions WITHOUT answers or explanations.
create or replace function get_group_quiz(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_quiz group_quizzes;
begin
  select * into v_quiz from group_quizzes where id = p_quiz_id;
  if not found or not is_group_member(v_quiz.group_id) then raise exception 'Quiz not found'; end if;
  return jsonb_build_object(
    'id', v_quiz.id,
    'title', v_quiz.title,
    'taken', exists (select 1 from group_quiz_results r where r.quiz_id = p_quiz_id and r.profile_id = auth.uid()),
    'questions', (
      select jsonb_agg(jsonb_build_object('q', e->>'q', 'options', e->'options') order by n)
      from jsonb_array_elements(v_quiz.questions) with ordinality as t(e, n)
    )
  );
end;
$$;

-- p_answers: array with one entry per question: the chosen option index 0-3, or null if skipped.
create or replace function submit_group_quiz(p_quiz_id uuid, p_answers jsonb, p_seconds int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quiz group_quizzes;
  v_total int;
  v_correct int;
begin
  select * into v_quiz from group_quizzes where id = p_quiz_id;
  if not found or not is_group_member(v_quiz.group_id) then raise exception 'Quiz not found'; end if;
  if exists (select 1 from group_quiz_results where quiz_id = p_quiz_id and profile_id = auth.uid()) then
    raise exception 'You have already taken this quiz';
  end if;
  v_total := jsonb_array_length(v_quiz.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answers do not match the quiz';
  end if;

  select count(*) into v_correct
    from jsonb_array_elements(v_quiz.questions) with ordinality as t(e, n)
   where (p_answers -> (n::int - 1))::text = (e->>'correct');

  insert into group_quiz_results (quiz_id, profile_id, correct, total, seconds)
  values (p_quiz_id, auth.uid(), v_correct, v_total, least(greatest(coalesce(p_seconds, 0), 0), 86400));

  return jsonb_build_object('correct', v_correct, 'total', v_total);
end;
$$;

-- Answers + explanations, only after you've submitted your own attempt.
create or replace function review_group_quiz(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_quiz group_quizzes;
begin
  select * into v_quiz from group_quizzes where id = p_quiz_id;
  if not found or not is_group_member(v_quiz.group_id) then raise exception 'Quiz not found'; end if;
  if not exists (select 1 from group_quiz_results where quiz_id = p_quiz_id and profile_id = auth.uid()) then
    raise exception 'Take the quiz first';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
             'q', e->>'q', 'options', e->'options', 'correct', (e->>'correct')::int, 'explanation', e->>'explanation'
           ) order by n)
    from jsonb_array_elements(v_quiz.questions) with ordinality as t(e, n)
  );
end;
$$;

create or replace function group_quiz_standings(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from group_quizzes where id = p_quiz_id;
  if v_group is null or not is_group_member(v_group) then raise exception 'Quiz not found'; end if;
  return coalesce((
    select jsonb_agg(x order by x.correct desc, x.seconds asc, x.name) from (
      select r.profile_id, pr.name, r.correct, r.total, r.seconds
      from group_quiz_results r join profiles pr on pr.id = r.profile_id
      where r.quiz_id = p_quiz_id
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Creator, the group's owner, or an admin.
create or replace function delete_group_quiz(p_quiz_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_quiz group_quizzes;
begin
  select * into v_quiz from group_quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz not found'; end if;
  if not (
    v_quiz.created_by = auth.uid()
    or exists (select 1 from study_groups where id = v_quiz.group_id and owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  ) then raise exception 'Not authorized'; end if;
  delete from group_quizzes where id = p_quiz_id;
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'create_group_quiz', 'list_group_quizzes', 'get_group_quiz', 'submit_group_quiz',
      'review_group_quiz', 'group_quiz_standings', 'delete_group_quiz'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
