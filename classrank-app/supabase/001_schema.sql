-- ClassRank Supabase schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

-- ─────────────────────────────────────────────
-- 1. Departments (with faculty grouping, matching src/data/mockData.ts)
-- ─────────────────────────────────────────────
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  faculty text not null
);

insert into departments (name, faculty) values
  ('Computer Science', 'Faculty of Science & Technology'),
  ('Mechanical Engineering', 'Faculty of Science & Technology'),
  ('Business Administration', 'Faculty of Business & Law'),
  ('Law', 'Faculty of Business & Law'),
  ('Fine Arts', 'Faculty of Arts & Humanities'),
  ('Nursing', 'Faculty of Health Sciences')
on conflict (name) do nothing;

-- ─────────────────────────────────────────────
-- 2. Profiles (one row per authenticated user)
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  university text not null,
  department_id uuid not null references departments (id),
  year int not null check (year between 1 and 8),
  total_points int not null default 0,
  current_streak int not null default 0,
  last_quiz_date date,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Everyone (any authenticated user) can read profiles — required for leaderboards.
create policy "Profiles are readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

-- Users can only insert/update their own profile.
create policy "Users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- 3. Quiz questions (one set per department per day)
-- ─────────────────────────────────────────────
create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  quiz_date date not null default current_date,
  question text not null,
  options text[] not null,
  correct_index int not null,
  created_at timestamptz not null default now()
);

alter table quiz_questions enable row level security;

create policy "Quiz questions are readable by authenticated users"
  on quiz_questions for select
  to authenticated
  using (true);

-- Note: only trusted roles (e.g. Department Leads via an admin tool) should be
-- able to INSERT questions. For now, do that via the Supabase dashboard or
-- service-role key from a trusted backend — no public insert policy is defined.

-- ─────────────────────────────────────────────
-- 4. Quiz attempts (append-only log, one row per question answered)
-- ─────────────────────────────────────────────
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  question_id uuid not null references quiz_questions (id),
  selected_index int not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (profile_id, question_id) -- one attempt per question per student
);

alter table quiz_attempts enable row level security;

create policy "Users can read their own attempts"
  on quiz_attempts for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "Users can insert their own attempts"
  on quiz_attempts for insert
  to authenticated
  with check (auth.uid() = profile_id);

-- ─────────────────────────────────────────────
-- 5. Leaderboard view (joins profiles + departments for easy client queries)
-- ─────────────────────────────────────────────
create or replace view leaderboard as
select
  p.id,
  p.name,
  p.total_points as points,
  d.name as department,
  d.faculty as faculty
from profiles p
join departments d on d.id = p.department_id;

-- ─────────────────────────────────────────────
-- 6. RPC: submit_quiz_results
-- Atomically records attempts, awards points, and updates the daily streak.
-- Points logic: 20 per correct answer + 5 per question attempted (participation bonus).
-- Streak logic: increments only once per calendar day, resets if a day was missed.
-- ─────────────────────────────────────────────
create or replace function submit_quiz_results(
  p_answers jsonb -- array of {question_id: uuid, selected_index: int}
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile_id uuid := auth.uid();
  v_answer jsonb;
  v_question_id uuid;
  v_selected_index int;
  v_correct_index int;
  v_is_correct boolean;
  v_correct_count int := 0;
  v_total_count int := 0;
  v_points_earned int := 0;
  v_last_quiz_date date;
  v_new_streak int;
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_question_id := (v_answer->>'question_id')::uuid;
    v_selected_index := (v_answer->>'selected_index')::int;

    select correct_index into v_correct_index
    from quiz_questions where id = v_question_id;

    v_is_correct := (v_selected_index = v_correct_index);
    v_total_count := v_total_count + 1;
    if v_is_correct then
      v_correct_count := v_correct_count + 1;
    end if;

    insert into quiz_attempts (profile_id, question_id, selected_index, is_correct)
    values (v_profile_id, v_question_id, v_selected_index, v_is_correct)
    on conflict (profile_id, question_id) do nothing;
  end loop;

  v_points_earned := (v_correct_count * 20) + (v_total_count * 5);

  select last_quiz_date into v_last_quiz_date from profiles where id = v_profile_id;

  if v_last_quiz_date is null or v_last_quiz_date < current_date - 1 then
    v_new_streak := 1; -- missed a day (or first ever quiz) -> streak restarts
  elsif v_last_quiz_date = current_date - 1 then
    v_new_streak := (select current_streak from profiles where id = v_profile_id) + 1;
  else
    v_new_streak := (select current_streak from profiles where id = v_profile_id); -- already did today
  end if;

  update profiles
  set total_points = total_points + v_points_earned,
      current_streak = v_new_streak,
      last_quiz_date = current_date
  where id = v_profile_id;

  return jsonb_build_object(
    'correct_count', v_correct_count,
    'total_count', v_total_count,
    'points_earned', v_points_earned,
    'new_streak', v_new_streak
  );
end;
$$;
