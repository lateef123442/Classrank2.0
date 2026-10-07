# ClassRank: course platform upgrade, version 2 (brief for Gemini CLI)

> Paste this whole file into Gemini CLI (or save it as `CLASSRANK_BRIEF.md` in the repo root and say: *"Read CLASSRANK_BRIEF.md completely, then implement it step by step exactly as written."*)

> **Version 2 supersedes any earlier version of this brief.** If part of an earlier version was already applied, simply overwrite with the `REPLACE WHOLE FILE` blocks here and re-run migrations 028 and 029 (all migrations are idempotent). Prerequisites that must already be applied: migrations 017, 021 and 022.

## 0. Ground rules (read first, obey all)

1. The repo is an **Expo / React Native + TypeScript** app with a **Supabase (Postgres + Edge Functions)** backend. Source is in `src/`, migrations in `supabase/`.
2. Work **in the order of the steps below**. After each step run `npx tsc --noEmit` (and `npm test` if a test script exists) and fix errors before moving on. Never leave the app non-compiling.
3. A block labelled **NEW** is a new file with exactly that content. **REPLACE WHOLE FILE** means overwrite the file with exactly that content. **EDIT(S)** means apply only the described change; leave everything else in the file untouched.
4. **Never edit migrations 001–026.** Create the three new migration files `027`, `028`, `029` with exactly the content given. They are idempotent (re-running is safe). The human will run them in the Supabase SQL editor, in order.
5. **PL/pgSQL rule for this project (a real bug we already hit twice):** in any function with `RETURNS TABLE` or OUT parameters, give every table an alias and qualify every column (`pr.role`, `pr.id`). Unqualified names collide with the output columns and Postgres fails with `column reference "x" is ambiguous`. All SQL below already follows this; keep it that way if you touch SQL.
6. **Security model (do not break it):** tables have RLS on; students and teachers never write tables directly. Every write goes through a `SECURITY DEFINER` function that re-checks who the caller is. Do not add INSERT/UPDATE/DELETE policies. Do not call `supabase.from(...).insert/update` for course data; call the RPC wrappers in `src/lib/courseApi.ts`.
7. **Do not delete** `QuizScreen`, `TeacherQuestionsScreen`, the `quiz_questions` / `quiz_attempts` tables, or the legacy leaderboard code. They just stop being reachable from the main flows (Step 8).
8. Reuse existing UI primitives from `src/components/study/ui.tsx` (`Back, Btn, Card, Chip, Label, Muted, Tag, Bar, ListSkeleton, s`) and tokens from `src/theme/tokens`. Do not introduce new UI libraries. Do not use `localStorage`.
9. Do not rename existing exports that other files import (e.g. `TeacherExamsPanel` stays a default export, `courseApi` function names stay).
10. When finished, print a report: files created, files changed, anything you had to deviate from and why, and the exact commands the human must run (SQL files in order, `supabase functions deploy study-companion`, rebuild the app).

## 1. What the product owner wants (plain language) and how it is implemented

| Wish | Implementation |
|---|---|
| A course shows its **department** and **level** (year). Students of that department and level see it automatically. | `courses.level` + `suggested_courses()` / `join_suggested_course()`; the student's **My courses** screen lists matching courses at the top with a one-tap Join. |
| Teachers can only create courses and upload content for **their department and the year(s) they are assigned**. | New `profiles.teaching_levels`. An admin sets it (Admin → Users → teacher → Teaching levels). `create_course()` rejects any other department or level. Content RPCs already require the teacher to own the course. |
| Teacher portal clearly has **upload resources**. | Teacher tab renamed **Courses & content**; dashboard gets "Create a course" and "Upload resources" cards; course → **Topics** tab → open a topic → add notes, links, videos, files. |
| Teacher can add **as many** resources as they want per course, **named**, **topic by topic**. | `course_topics` table; per-topic screen with notes / links / videos / files, each with a name. |
| **Daily quizzes per course**, not per department. | `get_course_daily_quiz` / `submit_course_daily_quiz`; the old department daily quiz is no longer reachable. |
| Daily quiz questions come randomly, **depending on how far the student has read**. | The pool is limited to topics the student has opened or finished; unseen questions are preferred, then random. |
| Teacher can upload **practical tests, tests and exams**. | `course_exams.kind` = `practical` / `test` / `exam` (timed, one attempt, graded on the server). |
| Tests and exams only after the student **finished the entire course**. | Server gate `course_gate_open()`; the app shows them locked with a reason. A teacher may instead scope an assessment to a single topic. |
| **Practice** for every topic, any time; review test and exam later. | Topic practice is always available (uses the existing practice engine). Review is available after the window closes, or right after submitting if the teacher turned that on. |
| **Ranked by first score** in tests, exams and daily quizzes. | `course_leaderboard()` (formula in Step 1). Only first scored attempts count. |
| **AI as a guide** while studying. | Companion screen opened from a course/topic gets that course's notes as context and guide rules (Step 7). |
| Teacher **manages topics**: add, rename, reorder, delete, and edit everything inside, including all resources. | Course → Topics: add, ↑ ↓ reorder. Topic screen: rename; **Edit** any resource (rename, change link or note text, move to another topic, files can be renamed or moved) or question (text, options, answer, where it is used, move); delete the topic **keeping its content in General** or **deleting everything** (including uploaded files). Students see changes the next time they open the course. |
| Everything **responsive and easy to navigate**. | New `Screen` shell (Step 3), chip tabs, wrapping rows, no fixed widths, tablet max width. |

### Decisions the human should know about (already built in)

1. **Practice any time vs after finishing a topic:** the request said both. Practice is **always available**; "I've finished this topic" is what unlocks tests, exams and the next steps.
2. **Topic completion rule:** a student can mark a topic finished only after opening **every** resource in it (the server verifies). A topic with no resources can be finished at once.
3. **Courses with no topics:** nothing to finish, so tests are not gated. Add topics first, then schedule tests.
4. **Adding a topic later** re-locks whole-course tests for students who had finished everything. That is intended.
5. **Question pools and answer secrecy:** each question is *Practice + daily quiz* (default), *Practice only*, or *Tests & exams only*. **No answer key is ever sent to a student's phone.** Practice is checked on the server one answer at a time (`check_course_practice_answer`), which reveals the right answer and explanation only for the question just answered. Tests-and-exams-only questions are never delivered at all outside the timed exam. Consequence: practice needs an internet connection. A student can still learn answers by practising, which is just studying; daily quizzes prefer questions the student has not seen before.
6. **Joining:** students are **not silently enrolled**. Joining shows that their results are shared with the teacher and puts them on the ranking, so it stays a one-tap choice. Joining by teacher code still works for any department or level (for cross-listed courses).
7. **Global leaderboards keep working:** each submitted daily quiz adds `5 × correct` and each submitted test, exam or practical adds `round(100 × correct ÷ total)` to the student's `total_points`, and daily quizzes update the streak. The department, faculty and campus leaderboards therefore keep growing from course activity, using the same points as the course ranking.
8. **Midnight:** an unfinished daily quiz can still be submitted after midnight (it counts for the day it was started); a new day's quiz is created only once the old one is submitted.
9. **Date and time entry** uses native pickers (no more typing `YYYY-MM-DD`).

## 2. What already exists (do NOT rebuild)

- Courses, join codes, `course_members`, `course_materials` (note/link/video/file with the private `course-files` bucket), `course_questions`, announcements (`course_events`), timed exams (`course_exams`, `course_exam_attempts`, `ExamScreen`), AI question drafting, bulk question paste, class statistics, study groups.
- The student's phone keeps a local "study space" copy of a joined course so practice works offline (`importCourseBundle`, `PracticeSession`). Keep using it for **topic practice**; the student UI now calls it automatically so students never see a separate "Subject room" step for course content.

---

## STEP 1: Database (create three files in `supabase/`)

The human runs them in the Supabase SQL editor in order: 027, then 028, then 029.

### `supabase/027_course_levels_and_teacher_scope.sql` (NEW)
```sql
-- 027: course LEVEL, teacher scope (department + assigned levels), student matching.
-- Idempotent: safe to run even if an earlier partial version was applied.
-- PL/pgSQL RULE FOR THIS WHOLE PROJECT: every function that RETURNS TABLE, or has OUT params, must alias tables and
-- qualify every column (pr.role, pr.id ...). Unqualified names collide with the output columns ("column reference is ambiguous").
-- The functions below return jsonb/void/uuid, so there are no OUT columns, but we still qualify everything.

alter table courses  add column if not exists level int check (level between 1 and 8);
alter table profiles add column if not exists teaching_levels int[];

alter table profiles drop constraint if exists profiles_teaching_levels_check;
alter table profiles add constraint profiles_teaching_levels_check
  check (teaching_levels is null or teaching_levels <@ array[1,2,3,4,5,6,7,8]);

  -- A teacher must not be able to edit their own assigned levels from the client (RLS lets users update their own row).
  -- current_user is 'authenticated' for direct client writes and the function owner inside SECURITY DEFINER functions.
  create or replace function guard_teaching_levels() returns trigger language plpgsql as $$
  begin
    if current_user = 'authenticated' and new.teaching_levels is distinct from old.teaching_levels then
        raise exception 'Only an admin can change teaching levels';
          end if;
            return new;
            end;
            $$;
            drop trigger if exists trg_guard_teaching_levels on profiles;
            create trigger trg_guard_teaching_levels before update on profiles
              for each row execute function guard_teaching_levels();

              -- Admin assigns which levels (years) a teacher may create courses/content for.
              create or replace function admin_set_teacher_levels(p_teacher_id uuid, p_levels int[])
              returns void language plpgsql security definer set search_path = public as $$
              declare
                v_caller_role text;
                  v_target_role text;
                  begin
                    select pr.role into v_caller_role from profiles pr where pr.id = auth.uid();
                      if v_caller_role is distinct from 'admin' then raise exception 'Not authorized'; end if;
                        select pr.role into v_target_role from profiles pr where pr.id = p_teacher_id;
                          if v_target_role is distinct from 'teacher' then raise exception 'That user is not a teacher'; end if;
                            if p_levels is not null and not (p_levels <@ array[1,2,3,4,5,6,7,8]) then
                                raise exception 'Levels must be between 1 and 8';
                                  end if;
                                    update profiles set teaching_levels = nullif(p_levels, '{}'::int[]) where profiles.id = p_teacher_id;
                                    end;
                                    $$;

                                    -- Create a course. Teachers: own department AND an assigned level only. Admins: any.
                                    drop function if exists create_course(uuid, text, text);
                                    create or replace function create_course(p_department_id uuid, p_code text, p_title text, p_level int)
                                    returns jsonb language plpgsql security definer set search_path = public as $$
                                    declare
                                      v_uid uuid := auth.uid();
                                        v_role text;
                                          v_dept uuid;
                                            v_levels int[];
                                              v_row courses;
                                              begin
                                                if v_uid is null then raise exception 'Not authenticated'; end if;
                                                  select pr.role, pr.department_id, pr.teaching_levels into v_role, v_dept, v_levels from profiles pr where pr.id = v_uid;
                                                    if v_role not in ('teacher', 'admin') then raise exception 'Not authorized'; end if;
                                                      if v_role = 'teacher' then
                                                          if v_dept is distinct from p_department_id then
                                                                raise exception 'Teachers can only create courses in their own department';
                                                                    end if;
                                                                        if v_levels is null or not (p_level = any (v_levels)) then
                                                                              raise exception 'You are not assigned to level %. Ask an admin to assign your levels.', p_level;
                                                                                  end if;
                                                                                    end if;
                                                                                      if char_length(trim(p_code)) < 2 or char_length(trim(p_title)) < 2 then raise exception 'Course code and title are required'; end if;
                                                                                        if p_level is null or p_level not between 1 and 8 then raise exception 'Choose the course level'; end if;
                                                                                          insert into courses (department_id, code, title, level, created_by)
                                                                                            values (p_department_id, upper(trim(p_code)), trim(p_title), p_level, v_uid)
                                                                                              returning * into v_row;
                                                                                                return jsonb_build_object('id', v_row.id, 'join_code', v_row.join_code);
                                                                                                end;
                                                                                                $$;

                                                                                                create or replace function staff_list_courses()
                                                                                                returns jsonb language plpgsql security definer set search_path = public as $$
                                                                                                declare
                                                                                                  v_uid uuid := auth.uid();
                                                                                                    v_role text;
                                                                                                    begin
                                                                                                      if v_uid is null then raise exception 'Not authenticated'; end if;
                                                                                                        select pr.role into v_role from profiles pr where pr.id = v_uid;
                                                                                                          if v_role not in ('teacher', 'admin') then raise exception 'Not authorized'; end if;
                                                                                                            return coalesce((
                                                                                                                select jsonb_agg(x order by x.code) from (
                                                                                                                      select c.id, c.code, c.title, c.level, c.join_code, d.name as department, pr.name as teacher_name,
                                                                                                                              (select count(*) from course_members m where m.course_id = c.id) as member_count,
                                                                                                                                      (select count(*) from course_questions q where q.course_id = c.id) as question_count,
                                                                                                                                              (select count(*) from course_materials t where t.course_id = c.id) as material_count
                                                                                                                                                    from courses c
                                                                                                                                                          join departments d on d.id = c.department_id
                                                                                                                                                                join profiles pr on pr.id = c.created_by
                                                                                                                                                                      where v_role = 'admin' or c.created_by = v_uid
                                                                                                                                                                          ) x
                                                                                                                                                                            ), '[]'::jsonb);
                                                                                                                                                                            end;
                                                                                                                                                                            $$;

                                                                                                                                                                            create or replace function my_courses()
                                                                                                                                                                            returns jsonb language plpgsql security definer set search_path = public as $$
                                                                                                                                                                            begin
                                                                                                                                                                              if auth.uid() is null then raise exception 'Not authenticated'; end if;
                                                                                                                                                                                return coalesce((
                                                                                                                                                                                    select jsonb_agg(x order by x.code) from (
                                                                                                                                                                                          select c.id, c.code, c.title, c.level, d.name as department, pr.name as teacher_name,
                                                                                                                                                                                                  (select count(*) from course_members m2 where m2.course_id = c.id) as member_count,
                                                                                                                                                                                                          (select min(e.event_date) from course_events e
                                                                                                                                                                                                                    where e.course_id = c.id and e.kind = 'exam' and e.event_date >= current_date) as next_exam
                                                                                                                                                                                                                          from courses c
                                                                                                                                                                                                                                join course_members m on m.course_id = c.id and m.profile_id = auth.uid()
                                                                                                                                                                                                                                      join departments d on d.id = c.department_id
                                                                                                                                                                                                                                            join profiles pr on pr.id = c.created_by
                                                                                                                                                                                                                                                ) x
                                                                                                                                                                                                                                                  ), '[]'::jsonb);
                                                                                                                                                                                                                                                  end;
                                                                                                                                                                                                                                                  $$;

                                                                                                                                                                                                                                                  -- Courses in the student's own department AND level that they have not joined yet.
                                                                                                                                                                                                                                                  create or replace function suggested_courses()
                                                                                                                                                                                                                                                  returns jsonb language plpgsql security definer set search_path = public as $$
                                                                                                                                                                                                                                                  declare
                                                                                                                                                                                                                                                    v_uid uuid := auth.uid();
                                                                                                                                                                                                                                                      v_role text;
                                                                                                                                                                                                                                                        v_dept uuid;
                                                                                                                                                                                                                                                          v_year int;
                                                                                                                                                                                                                                                          begin
                                                                                                                                                                                                                                                            if v_uid is null then raise exception 'Not authenticated'; end if;
                                                                                                                                                                                                                                                              select pr.role, pr.department_id, pr.year into v_role, v_dept, v_year from profiles pr where pr.id = v_uid;
                                                                                                                                                                                                                                                                if v_role is distinct from 'student' then return '[]'::jsonb; end if;
                                                                                                                                                                                                                                                                  return coalesce((
                                                                                                                                                                                                                                                                      select jsonb_agg(x order by x.code) from (
                                                                                                                                                                                                                                                                            select c.id, c.code, c.title, c.level, d.name as department, t.name as teacher_name
                                                                                                                                                                                                                                                                                  from courses c
                                                                                                                                                                                                                                                                                        join departments d on d.id = c.department_id
                                                                                                                                                                                                                                                                                              join profiles t on t.id = c.created_by
                                                                                                                                                                                                                                                                                                    where c.department_id = v_dept and c.level = v_year
                                                                                                                                                                                                                                                                                                            and not exists (select 1 from course_members m where m.course_id = c.id and m.profile_id = v_uid)
                                                                                                                                                                                                                                                                                                                ) x
                                                                                                                                                                                                                                                                                                                  ), '[]'::jsonb);
                                                                                                                                                                                                                                                                                                                  end;
                                                                                                                                                                                                                                                                                                                  $$;

                                                                                                                                                                                                                                                                                                                  -- One-tap join, only when department AND level match the student's profile.
                                                                                                                                                                                                                                                                                                                  create or replace function join_suggested_course(p_course_id uuid)
                                                                                                                                                                                                                                                                                                                  returns jsonb language plpgsql security definer set search_path = public as $$
                                                                                                                                                                                                                                                                                                                  declare
                                                                                                                                                                                                                                                                                                                    v_uid uuid := auth.uid();
                                                                                                                                                                                                                                                                                                                      v_role text;
                                                                                                                                                                                                                                                                                                                        v_dept uuid;
                                                                                                                                                                                                                                                                                                                          v_year int;
                                                                                                                                                                                                                                                                                                                            v_course courses;
                                                                                                                                                                                                                                                                                                                            begin
                                                                                                                                                                                                                                                                                                                              if v_uid is null then raise exception 'Not authenticated'; end if;
                                                                                                                                                                                                                                                                                                                                select pr.role, pr.department_id, pr.year into v_role, v_dept, v_year from profiles pr where pr.id = v_uid;
                                                                                                                                                                                                                                                                                                                                  if v_role is distinct from 'student' then raise exception 'Only students can join a course'; end if;
                                                                                                                                                                                                                                                                                                                                    select * into v_course from courses c where c.id = p_course_id;
                                                                                                                                                                                                                                                                                                                                      if not found then raise exception 'Course not found'; end if;
                                                                                                                                                                                                                                                                                                                                        if v_course.department_id is distinct from v_dept or v_course.level is distinct from v_year then
                                                                                                                                                                                                                                                                                                                                            raise exception 'This course is not for your department and level';
                                                                                                                                                                                                                                                                                                                                              end if;
                                                                                                                                                                                                                                                                                                                                                insert into course_members (course_id, profile_id) values (v_course.id, v_uid) on conflict do nothing;
                                                                                                                                                                                                                                                                                                                                                  return jsonb_build_object('course_id', v_course.id, 'code', v_course.code, 'title', v_course.title);
                                                                                                                                                                                                                                                                                                                                                  end;
                                                                                                                                                                                                                                                                                                                                                  $$;

                                                                                                                                                                                                                                                                                                                                                  do $$
                                                                                                                                                                                                                                                                                                                                                  declare r record;
                                                                                                                                                                                                                                                                                                                                                  begin
                                                                                                                                                                                                                                                                                                                                                    for r in
                                                                                                                                                                                                                                                                                                                                                        select p.oid::regprocedure as sig
                                                                                                                                                                                                                                                                                                                                                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                                                                                                                                                                                                                                                                                                                                                where n.nspname = 'public' and p.proname = any (array[
                                                                                                                                                                                                                                                                                                                                                                      'admin_set_teacher_levels', 'create_course', 'staff_list_courses', 'my_courses', 'suggested_courses', 'join_suggested_course'
                                                                                                                                                                                                                                                                                                                                                                          ])
                                                                                                                                                                                                                                                                                                                                                                            loop
                                                                                                                                                                                                                                                                                                                                                                                execute format('revoke all on function %s from public', r.sig);
                                                                                                                                                                                                                                                                                                                                                                                    execute format('grant execute on function %s to authenticated', r.sig);
                                                                                                                                                                                                                                                                                                                                                                                      end loop;
                                                                                                                                                                                                                                                                                                                                                                                      end;
                                                                                                                                                                                                                                                                                                                                                                                      $$;

                                                                                                                                                                                                                                                                                                                                                                                      -- OPTIONAL one-time backfill so existing teachers are not locked out until an admin assigns levels:
                                                                                                                                                                                                                                                                                                                                                                                      -- update profiles set teaching_levels = array[1,2,3,4,5,6,7,8] where role = 'teacher' and teaching_levels is null;
                                                                                                                                                                                                                                                                                                                                                                                      ```

                                                                                            ### `supabase/028_topics_and_progress.sql` (NEW)
```sql
-- 028: topics as first-class rows, resource tracking, topic completion, question pools.
-- Run after 027. Idempotent.
-- Design: existing clients keep sending the topic NAME (text). A trigger maps that text to a course_topics row
-- (creating it if missing), so old code paths keep working while topic_id becomes the real link.

create table if not exists course_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  position int not null default 0,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_course_topics_title on course_topics (course_id, lower(title));
create index if not exists idx_course_topics_course on course_topics (course_id, position);
alter table course_topics enable row level security;
drop policy if exists "topics visible to members and staff" on course_topics;
create policy "topics visible to members and staff" on course_topics for select to authenticated
  using (is_course_member(course_id) or is_course_staff(course_id));

alter table course_materials add column if not exists topic_id uuid references course_topics (id) on delete set null;
alter table course_questions add column if not exists topic_id uuid references course_topics (id) on delete set null;
-- Question pools: practice + daily (default), practice only, or assessment-only (never sent to students' phones).
alter table course_questions add column if not exists in_daily boolean not null default true;
alter table course_questions add column if not exists assessment_only boolean not null default false;
alter table course_questions drop constraint if exists course_questions_pool_check;
alter table course_questions add constraint course_questions_pool_check check (not (assessment_only and in_daily));
create index if not exists idx_course_materials_topic on course_materials (topic_id);
create index if not exists idx_course_questions_topic on course_questions (topic_id);

-- Backfill topics from the free-text topic names that already exist.
insert into course_topics (course_id, title, position, created_by)
select x.course_id, x.title, (row_number() over (partition by x.course_id order by x.first_seen) - 1)::int, x.created_by
from (
  select u.course_id, trim(u.topic) as title, min(u.created_at) as first_seen,
         (array_agg(u.created_by order by u.created_at))[1] as created_by
  from (
    select m.course_id, m.topic, m.created_at, m.created_by from course_materials m where trim(m.topic) <> ''
    union all
    select q.course_id, q.topic, q.created_at, q.created_by from course_questions q where trim(q.topic) <> ''
  ) u
  group by u.course_id, trim(u.topic)
) x
on conflict do nothing;

update course_materials m set topic_id = t.id
  from course_topics t
 where m.topic_id is null and trim(m.topic) <> '' and t.course_id = m.course_id and lower(t.title) = lower(trim(m.topic));
update course_questions q set topic_id = t.id
  from course_topics t
 where q.topic_id is null and trim(q.topic) <> '' and t.course_id = q.course_id and lower(t.title) = lower(trim(q.topic));

-- Keeps topic (text) and topic_id in step on every insert / topic change.
create or replace function sync_course_topic() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text := nullif(trim(coalesce(new.topic, '')), '');
  v_id uuid;
begin
  if v_title is null then
    new.topic := '';
    new.topic_id := null;
    return new;
  end if;
  select t.id into v_id from course_topics t where t.course_id = new.course_id and lower(t.title) = lower(v_title);
  if v_id is null then
    insert into course_topics (course_id, title, position, created_by)
    values (new.course_id, v_title,
            coalesce((select max(x.position) + 1 from course_topics x where x.course_id = new.course_id), 0),
            new.created_by)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select t.id into v_id from course_topics t where t.course_id = new.course_id and lower(t.title) = lower(v_title);
    end if;
  end if;
  new.topic_id := v_id;
  new.topic := (select t.title from course_topics t where t.id = v_id);
  return new;
end;
$$;
drop trigger if exists trg_sync_topic_materials on course_materials;
create trigger trg_sync_topic_materials before insert or update of topic on course_materials
  for each row execute function sync_course_topic();
drop trigger if exists trg_sync_topic_questions on course_questions;
create trigger trg_sync_topic_questions before insert or update of topic on course_questions
  for each row execute function sync_course_topic();

-- Per-student tracking. RLS on, no policies: access only through the functions below.
create table if not exists course_material_views (
  material_id uuid not null references course_materials (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (material_id, profile_id)
);
create index if not exists idx_material_views_profile on course_material_views (profile_id, course_id);
create table if not exists course_topic_progress (
  topic_id uuid not null references course_topics (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (topic_id, profile_id)
);
create index if not exists idx_topic_progress_profile on course_topic_progress (profile_id, course_id);
alter table course_material_views enable row level security;
alter table course_topic_progress enable row level security;

-- ── Teacher: topics ──
create or replace function staff_upsert_topic(p_id uuid, p_course_id uuid, p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text := trim(coalesce(p_title, ''));
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception 'Topic name must be 1 to 80 characters'; end if;
  if p_id is null then
    if (select count(*) from course_topics t where t.course_id = p_course_id) >= 60 then
      raise exception 'A course can have at most 60 topics';
    end if;
    insert into course_topics (course_id, title, position, created_by)
    values (p_course_id, v_title,
            coalesce((select max(x.position) + 1 from course_topics x where x.course_id = p_course_id), 0), auth.uid())
    returning id into v_id;
  else
    update course_topics set title = v_title where course_topics.id = p_id and course_topics.course_id = p_course_id returning course_topics.id into v_id;
    if v_id is null then raise exception 'Topic not found'; end if;
    update course_materials set topic = v_title where course_materials.topic_id = v_id;
    update course_questions set topic = v_title where course_questions.topic_id = v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'This course already has a topic with that name';
end;
$$;

-- Delete a topic. p_delete_content = false: its resources and questions are kept and move to "General" (no topic).
-- p_delete_content = true: the topic AND all its resources and questions are deleted (the app removes uploaded files from storage first).
-- The old one-argument version is dropped so one-argument calls stay unambiguous.
drop function if exists staff_delete_topic(uuid);
create or replace function staff_delete_topic(p_topic_id uuid, p_delete_content boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  select t.course_id into v_course from course_topics t where t.id = p_topic_id;
  if v_course is null or not is_course_staff(v_course) then raise exception 'Topic not found'; end if;
  if coalesce(p_delete_content, false) then
    delete from course_materials where course_materials.topic_id = p_topic_id;
    delete from course_questions where course_questions.topic_id = p_topic_id;
  else
    update course_materials set topic = '' where course_materials.topic_id = p_topic_id;
    update course_questions set topic = '' where course_questions.topic_id = p_topic_id;
  end if;
  delete from course_topics where course_topics.id = p_topic_id;
end;
$$;

-- Rename a resource (any kind, including files) and/or move it to another topic. p_topic '' = General.
create or replace function staff_update_material_meta(p_id uuid, p_title text, p_topic text)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  select m.course_id into v_course from course_materials m where m.id = p_id;
  if v_course is null or not is_course_staff(v_course) then raise exception 'Resource not found'; end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Give the resource a name'; end if;
  update course_materials set title = trim(p_title), topic = coalesce(trim(p_topic), '') where course_materials.id = p_id;
end;
$$;

create or replace function staff_reorder_topics(p_course_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  update course_topics t set position = (u.n - 1)::int
    from unnest(p_ids) with ordinality as u(tid, n)
   where t.id = u.tid and t.course_id = p_course_id;
end;
$$;
                                                                                                                                       
                                                                                                                                                   

-- Question upsert with pool flags. The old 7-argument version is dropped so named-argument calls stay unambiguous;
-- existing clients that send 7 arguments keep working because the new arguments have defaults.
drop function if exists staff_upsert_course_question(uuid, uuid, text, text, text[], int, text);
create or replace function staff_upsert_course_question(
  p_id uuid, p_course_id uuid, p_topic text, p_question text, p_options text[], p_correct_index int, p_explanation text,
  p_in_daily boolean default true, p_assessment_only boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_daily boolean := coalesce(p_in_daily, true) and not coalesce(p_assessment_only, false);
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if array_length(p_options, 1) is distinct from 4 then raise exception 'Exactly four options are required'; end if;
  if p_correct_index < 0 or p_correct_index > 3 then raise exception 'correct_index out of range'; end if;
  if p_id is null then
    insert into course_questions (course_id, topic, question, options, correct_index, explanation, in_daily, assessment_only, created_by)
    values (p_course_id, coalesce(trim(p_topic), ''), trim(p_question), p_options, p_correct_index, coalesce(trim(p_explanation), ''),
            v_daily, coalesce(p_assessment_only, false), auth.uid())
    returning id into v_id;
  else
    update course_questions set topic = coalesce(trim(p_topic), ''), question = trim(p_question), options = p_options,
      correct_index = p_correct_index, explanation = coalesce(trim(p_explanation), ''),
      in_daily = v_daily, assessment_only = coalesce(p_assessment_only, false)
    where course_questions.id = p_id and course_questions.course_id = p_course_id returning course_questions.id into v_id;
    if v_id is null then raise exception 'Question not found'; end if;
  end if;
  return v_id;
end;
$$;

-- ── Student: reading progress ──
create or replace function record_material_view(p_material_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  select m.course_id into v_course from course_materials m where m.id = p_material_id;
  if v_course is null or not is_course_member(v_course) then raise exception 'Not authorized'; end if;
  insert into course_material_views (material_id, profile_id, course_id) values (p_material_id, auth.uid(), v_course)
  on conflict do nothing;
end;
$$;

create or replace function course_progress(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_topics jsonb; v_total int; v_done int;
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x.position, x.title), '[]'::jsonb) into v_topics from (
    select t.id, t.title, t.position,
      (select count(*) from course_materials m where m.topic_id = t.id) as materials_total,
      (select count(*) from course_material_views v join course_materials m2 on m2.id = v.material_id
        where m2.topic_id = t.id and v.profile_id = auth.uid()) as materials_viewed,
      (select count(*) from course_questions q where q.topic_id = t.id and not q.assessment_only) as question_count,
      exists (select 1 from course_topic_progress g where g.topic_id = t.id and g.profile_id = auth.uid()) as completed
    from course_topics t where t.course_id = p_course_id
  ) x;
  v_total := jsonb_array_length(v_topics);
  select count(*) into v_done from jsonb_array_elements(v_topics) as t(e) where (t.e ->> 'completed')::boolean;
  return jsonb_build_object('topics', v_topics, 'topic_count', v_total, 'completed_count', v_done,
                            'course_complete', v_done = v_total,
                            'viewed_ids', coalesce((select jsonb_agg(v.material_id) from course_material_views v
                                                     where v.course_id = p_course_id and v.profile_id = auth.uid()), '[]'::jsonb));
end;
$$;

create or replace function mark_topic_complete(p_topic_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_course uuid; v_total int; v_seen int;
begin
  select t.course_id into v_course from course_topics t where t.id = p_topic_id;
  if v_course is null or not is_course_member(v_course) then raise exception 'Not authorized'; end if;
  select count(*) into v_total from course_materials m where m.topic_id = p_topic_id;
  select count(*) into v_seen from course_material_views v join course_materials m on m.id = v.material_id
   where m.topic_id = p_topic_id and v.profile_id = auth.uid();
  if v_seen < v_total then
    raise exception 'Open every resource in this topic first (% of % opened)', v_seen, v_total;
  end if;
  insert into course_topic_progress (topic_id, profile_id, course_id) values (p_topic_id, auth.uid(), v_course)
  on conflict do nothing;
  return course_progress(v_course);
end;
$$;

-- Used by tests/exams/practicals. A topic-scoped assessment needs that topic done; otherwise EVERY topic must be done.
-- A course with no topics has nothing to finish, so the gate is open.
create or replace function course_gate_open(p_course_id uuid, p_topic_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_topic_id is not null then
      exists (select 1 from course_topic_progress g where g.topic_id = p_topic_id and g.profile_id = auth.uid())
    else
      not exists (
        select 1 from course_topics t
        where t.course_id = p_course_id
          and not exists (select 1 from course_topic_progress g where g.topic_id = t.id and g.profile_id = auth.uid())
      )
  end;
$$;

-- Teacher: how far the class has got.
create or replace function staff_topic_progress(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'member_count', (select count(*) from course_members m where m.course_id = p_course_id),
    'topics', coalesce((select jsonb_agg(x order by x.position, x.title) from (
      select t.id, t.title, t.position,
        (select count(*) from course_topic_progress g where g.topic_id = t.id) as completed_count,
        (select count(distinct v.profile_id) from course_material_views v join course_materials m on m.id = v.material_id
          where m.topic_id = t.id) as readers
      from course_topics t where t.course_id = p_course_id) x), '[]'::jsonb)
  );
end;
$$;

-- ── Server-checked practice: the answer key never reaches the phone ──
-- Returns random practice questions WITHOUT answers. p_topic_id null = the "General" questions.
create or replace function get_course_practice_set(p_course_id uuid, p_topic_id uuid default null, p_count int default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int := least(greatest(coalesce(p_count, 10), 3), 20);
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.question, 'options', to_jsonb(x.options), 'topic', x.topic))
    from (
      select q.id, q.question, q.options, q.topic
      from course_questions q
      where q.course_id = p_course_id and not q.assessment_only and q.topic_id is not distinct from p_topic_id
      order by random() limit v_n
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Grades ONE practice answer on the server, reveals the right answer and explanation for that question only, and
-- records it for the teacher's class statistics (at most 3 recorded answers per student per question per day).
create or replace function check_course_practice_answer(p_question_id uuid, p_picked int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_q course_questions;
begin
  select * into v_q from course_questions q where q.id = p_question_id;
  if not found or v_q.assessment_only or not (is_course_member(v_q.course_id) or is_course_staff(v_q.course_id)) then
    raise exception 'Question not found';
  end if;
  if p_picked is null or p_picked not between 0 and 3 then raise exception 'Invalid answer'; end if;
  if is_course_member(v_q.course_id) and (
       select count(*) from course_answer_events e
        where e.profile_id = auth.uid() and e.question_id = p_question_id and e.created_at > now() - interval '1 day') < 3 then
    insert into course_answer_events (course_id, question_id, profile_id, correct, picked)
    values (v_q.course_id, p_question_id, auth.uid(), p_picked = v_q.correct_index, p_picked);
  end if;
  return jsonb_build_object('correct', v_q.correct_index, 'explanation', v_q.explanation, 'was_correct', p_picked = v_q.correct_index);
end;
$$;

-- Same as 022 plus topic ids, the topic list, pool flags. For STUDENTS: assessment-only questions are not sent at all, and
-- practice questions arrive WITHOUT correct_index / explanation (null). Practice is checked on the server, see below.
create or replace function get_course_content(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_staff boolean;
begin
  v_staff := is_course_staff(p_course_id);
  if not (is_course_member(p_course_id) or v_staff) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'course', (select jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'level', c.level) from courses c where c.id = p_course_id),
    'topics', coalesce((select jsonb_agg(t order by t.position, t.title) from (
        select id, title, position from course_topics where course_id = p_course_id) t), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(m order by m.created_at) from (
        select id, topic, topic_id, title, kind, body, file_name, file_size, mime, created_at
        from course_materials where course_id = p_course_id order by created_at limit 300) m), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(q order by q.created_at) from (
        select id, topic, topic_id, question, options,
               case when v_staff then correct_index end as correct_index,
               case when v_staff then explanation end as explanation,
               in_daily, assessment_only, created_at
        from course_questions where course_id = p_course_id and (v_staff or not assessment_only)
        order by created_at limit 500) q), '[]'::jsonb),
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
      'staff_upsert_topic', 'staff_delete_topic', 'staff_reorder_topics', 'staff_upsert_course_question',
      'record_material_view', 'course_progress', 'mark_topic_complete', 'course_gate_open', 'staff_topic_progress', 'get_course_content',
      'staff_update_material_meta', 'get_course_practice_set', 'check_course_practice_answer'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
```

0

### `supabase/029_daily_quizzes_assessments_ranking.sql` (NEW)
```sql
-- 029: per-course DAILY quizzes, practical/test/exam kinds with completion gating, review after submit, course ranking,
-- and course points feeding the global leaderboards (total_points + streak).
-- Run after 028. Idempotent. Replaces functions from 021 (full bodies below, patched).

alter table course_exams add column if not exists kind text not null default 'exam' check (kind in ('practical', 'test', 'exam'));
alter table course_exams add column if not exists topic_id uuid references course_topics (id) on delete set null;
alter table course_exams add column if not exists review_after_submit boolean not null default false;

-- Old 6-argument signature must go, otherwise calls with defaults become ambiguous.
drop function if exists staff_create_exam(uuid, text, uuid[], timestamptz, timestamptz, int);

-- ── patched from 021: kind + topic + review flag on create ──
create or replace function staff_create_exam(
  p_course_id uuid, p_title text, p_question_ids uuid[],
  p_starts_at timestamptz, p_ends_at timestamptz, p_duration_minutes int,
  p_kind text default 'exam', p_topic_id uuid default null, p_review_after_submit boolean default false
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
  if p_kind not in ('practical', 'test', 'exam') then raise exception 'Kind must be practical, test or exam'; end if;
  if p_topic_id is not null and not exists (select 1 from course_topics t where t.id = p_topic_id and t.course_id = p_course_id) then
    raise exception 'That topic does not belong to this course';
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
    p_course_id, 'exam', left(initcap(p_kind) || ': ' || trim(p_title), 120),
    format('Opens %s, closes %s (UTC). %s minutes once you start; one attempt.',
           to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           to_char(p_ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
           p_duration_minutes),
    (p_starts_at at time zone 'UTC')::date, auth.uid()
  ) returning id into v_event;

  insert into course_exams (course_id, title, questions, starts_at, ends_at, duration_minutes, event_id, created_by, kind, topic_id, review_after_submit)
  values (p_course_id, trim(p_title), v_snapshot, p_starts_at, p_ends_at, p_duration_minutes, v_event, auth.uid(), p_kind, p_topic_id, coalesce(p_review_after_submit, false))
  returning id into v_exam;

  return jsonb_build_object('exam_id', v_exam, 'event_id', v_event);
end;
$$;

-- ── patched: kind/topic/review/locked in the list ──
create or replace function list_course_exams(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_staff boolean;
begin
  v_staff := is_course_staff(p_course_id);
  if not (v_staff or is_course_member(p_course_id)) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(x order by x.starts_at desc) from (
      select e.id, e.title, e.starts_at, e.ends_at, e.duration_minutes, e.kind, e.topic_id, e.review_after_submit,
        (not v_staff and not course_gate_open(e.course_id, e.topic_id)) as locked,
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

-- ── patched: completion gate before a NEW attempt can start ──
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
    if not course_gate_open(v_exam.course_id, v_exam.topic_id) then
      raise exception '%', case when v_exam.topic_id is null
        then 'Finish every topic in this course to unlock this ' || v_exam.kind
        else 'Finish the topic first to unlock this ' || v_exam.kind end;
    end if;
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

-- ── patched: exam points also feed the global leaderboards ──
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

  -- global leaderboards: same points as the course ranking (round(100 * correct / total)); one attempt per exam, so this runs once
  update profiles set total_points = total_points + round(100.0 * v_correct / v_total)::int where profiles.id = auth.uid();

  return jsonb_build_object('correct', v_correct, 'total', v_total);
end;
$$;

-- ── patched: review after submit when the teacher allowed it ──
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
  if now() <= v_exam.ends_at and not is_course_staff(v_exam.course_id)
     and not (v_exam.review_after_submit and exists (
           select 1 from course_exam_attempts a
            where a.exam_id = p_exam_id and a.profile_id = auth.uid() and a.submitted_at is not null)) then
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

-- ─────────────────────────────────────────────
-- Course daily quiz: one scored session per student per course per day.
-- Questions come from the course's daily pool, limited to topics the student has started (opened a resource or
-- completed it) plus questions with no topic. Questions not seen in earlier sessions are preferred, then random.
-- The score of a day's session is the FIRST and only scored attempt for that day; extra practice is unscored.
-- ─────────────────────────────────────────────
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
alter table course_daily_sessions enable row level security;

create or replace function get_course_daily_quiz(p_course_id uuid, p_count int default 5)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sess course_daily_sessions;
  v_ids uuid[];
  v_n int := least(greatest(coalesce(p_count, 5), 3), 10);
begin
  if v_uid is null or not is_course_member(p_course_id) then raise exception 'Not authorized'; end if;
  -- Resume an unfinished quiz first, even one started just before midnight (yesterday's session still counts for its own day).
  select * into v_sess from course_daily_sessions s
   where s.course_id = p_course_id and s.profile_id = v_uid and s.submitted_at is null and s.quiz_date >= current_date - 1
   order by s.quiz_date desc limit 1;
  if not found then
    select * into v_sess from course_daily_sessions s
     where s.course_id = p_course_id and s.profile_id = v_uid and s.quiz_date = current_date;
    if found then  -- today's session exists and is already submitted
      return jsonb_build_object('status', 'done', 'correct', v_sess.correct, 'total', v_sess.total);
    end if;
    with seen as (
      select coalesce(array_agg(u.qid), '{}'::uuid[]) as ids
      from course_daily_sessions s2, unnest(s2.question_ids) as u(qid)
      where s2.course_id = p_course_id and s2.profile_id = v_uid
    ), started as (
      select t.id from course_topics t
      where t.course_id = p_course_id and (
        exists (select 1 from course_topic_progress g where g.topic_id = t.id and g.profile_id = v_uid)
        or exists (select 1 from course_material_views v join course_materials m on m.id = v.material_id
                    where m.topic_id = t.id and v.profile_id = v_uid))
    )
    select array_agg(pick.id) into v_ids from (
      select cq.id from course_questions cq, seen
      where cq.course_id = p_course_id and cq.in_daily and not cq.assessment_only
        and (cq.topic_id is null or cq.topic_id in (select st.id from started st))
      order by (cq.id = any (seen.ids)), random()
      limit v_n
    ) pick;
    if v_ids is null then return jsonb_build_object('status', 'locked'); end if;
    insert into course_daily_sessions (course_id, profile_id, question_ids) values (p_course_id, v_uid, v_ids)
    returning * into v_sess;
  end if;
  return jsonb_build_object(
    'status', 'ready',
    'questions', (
      select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.question, 'options', to_jsonb(q.options), 'topic', q.topic)
                       order by array_position(v_sess.question_ids, q.id))
      from course_questions q where q.id = any (v_sess.question_ids)
    )
  );
end;
$$;

-- p_answers: array with one entry per question in the session order: option index 0-3, or null if skipped.
-- Scores the unfinished session (today's, or yesterday's if it was started before midnight). The first submission also
-- adds the points to the student's global total_points (same 5 per correct answer as the course ranking) and updates the streak.
create or replace function submit_course_daily_quiz(p_course_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sess course_daily_sessions;
  v_total int;
  v_correct int;
begin
  if v_uid is null or not is_course_member(p_course_id) then raise exception 'Not authorized'; end if;
  select * into v_sess from course_daily_sessions s
   where s.course_id = p_course_id and s.profile_id = v_uid and s.submitted_at is null and s.quiz_date >= current_date - 1
   order by s.quiz_date desc limit 1 for update;
  if not found then raise exception 'Open the daily quiz first (or it was already submitted)'; end if;
  v_total := array_length(v_sess.question_ids, 1);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answers do not match the quiz';
  end if;
  select count(*) into v_correct
    from unnest(v_sess.question_ids) with ordinality as u(qid, n)
    join course_questions q on q.id = u.qid
   where (p_answers -> (u.n::int - 1))::text = q.correct_index::text;
  update course_daily_sessions set submitted_at = now(), answers = p_answers, correct = v_correct, total = v_total
   where course_daily_sessions.id = v_sess.id;
  update profiles set
    total_points = total_points + v_correct * 5,
    current_streak = case when last_quiz_date = current_date then current_streak
                          when last_quiz_date = current_date - 1 then current_streak + 1
                          else 1 end,
    last_quiz_date = current_date
   where profiles.id = v_uid;
  return jsonb_build_object(
    'correct', v_correct, 'total', v_total,
    'review', (
      select jsonb_agg(jsonb_build_object('q', q.question, 'options', to_jsonb(q.options), 'correct', q.correct_index,
                                          'explanation', q.explanation, 'picked', p_answers -> (u.n::int - 1)) order by u.n)
      from unnest(v_sess.question_ids) with ordinality as u(qid, n)
      join course_questions q on q.id = u.qid
    )
  );
end;
$$;

-- ─────────────────────────────────────────────
-- Course ranking. Points are only from FIRST scored attempts:
--   every test / exam / practical the student submitted: round(100 * correct / total)   (one attempt each, by design)
--   every daily quiz session the student submitted:      5 * correct                    (one scored session per day)
-- Returns the top 50 plus the caller's own row. Enrolled students with no scores appear with 0.
-- ─────────────────────────────────────────────
create or replace function course_leaderboard(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then raise exception 'Not authorized'; end if;
  return (
    with pts as (
      select a.profile_id, round(100.0 * a.correct / a.total)::int as p, 'assessment'::text as src
        from course_exam_attempts a join course_exams e on e.id = a.exam_id
       where e.course_id = p_course_id and a.submitted_at is not null
      union all
      select s.profile_id, s.correct * 5, 'daily'::text
        from course_daily_sessions s
       where s.course_id = p_course_id and s.submitted_at is not null
    ), agg as (
      select m.profile_id, pr.name,
             coalesce(sum(pts.p), 0)::int as points,
             (count(*) filter (where pts.src = 'assessment'))::int as assessments,
             (count(*) filter (where pts.src = 'daily'))::int as dailies
        from course_members m
        join profiles pr on pr.id = m.profile_id
        left join pts on pts.profile_id = m.profile_id
       where m.course_id = p_course_id
       group by m.profile_id, pr.name
    ), ranked as (
      select agg.profile_id, agg.name, agg.points, agg.assessments, agg.dailies,
             rank() over (order by agg.points desc) as rnk,
             (agg.profile_id = v_me) as is_me
        from agg
    )
    select jsonb_build_object(
      'me', (select to_jsonb(r) - 'profile_id' from ranked r where r.profile_id = v_me),
      'top', coalesce((select jsonb_agg(to_jsonb(t) - 'profile_id' order by t.rnk, t.name)
                         from (select * from ranked order by rnk, name limit 50) t), '[]'::jsonb),
      'size', (select count(*) from ranked)
    )
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
      'staff_create_exam', 'list_course_exams', 'start_course_exam', 'submit_course_exam', 'review_course_exam',
      'get_course_daily_quiz', 'submit_course_daily_quiz', 'course_leaderboard'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
```

**Ranking formula (implemented in `course_leaderboard`):** every test / exam / practical the student submitted gives `round(100 × correct ÷ total)` points (one attempt each by design); every daily quiz session gives `5 × correct` (one scored session per student per day). Ties share a ra
nk.

**SQL smoke tests the human can run after the three migrations** (replace the UUIDs):
```sql
select proname from pg_proc where proname in ('create_course','suggested_courses','join_suggested_course','staff_upsert_topic','course_progress','mark_topic_complete','get_course_daily_quiz','submit_course_daily_quiz','course_leaderboard','admin_set_teacher_levels') order by 1;  -- expect 10 rows
select column_name from information_schema.columns where table_name = 'courses' and column_name = 'level';      -- 1 row
select column_name from information_schema.columns where table_name = 'course_exams' and column_name in ('kind','topic_id','review_after_submit');  -- 3 rows
```
Optional one-time backfill so **existing teachers are not locked out** until an admin assigns levels:
`update profiles set teaching_levels = array[1,2,3,4,5,6,7,8] where role = 'teacher' and teaching_levels is null;`

## STEP 2: Types and API layer

```ts
// src/types.ts — EDIT: in `interface Profile` add one line after `year`:
  teaching_levels: number[] | null; // teachers only: levels an admin assigned them. The profile query uses select("*") so it arrives automatically.

// src/lib/studyCourseSync.ts — EDIT: REPLACE the CourseBundle interface with this (new fields are optional so existing tests still compile):
export interface CourseBundle {
  course: { id: string; code: string; title: string; level?: number | null };
  topics?: { id: string; title: string; position: number }[];
  materials: { id: string; topic: string; topic_id?: string | null; title: string; kind: "note" | "link" | "video" | "file"; body: string; file_name?: string | null; file_size?: number | null; mime?: string | null }[];
  questions: { id: string; topic: string; topic_id?: string | null; question: string; options: string[]; correct_index: number; explanation: string; in_daily?: boolean; assessment_only?: boolean }[];
  events: { id: string; kind: "announcement" | "exam"; title: string; body: string; event_date: string | null }[];
}

// src/lib/studyCourseSync.ts — EDIT: ALSO append this helper. Students must never get the answer key on their phone, so every
// importCourseBundle(...) call for a course bundle goes through it (the screens in Step 5 already do):
export const withoutQuestions = (b: CourseBundle): CourseBundle => ({ ...b, questions: [] });
// Note: the server already sends students practice questions with correct_index / explanation = null, and never sends
// "tests & exams only" questions. withoutQuestions also stops null answers from being merged into the local study data.

// src/lib/adminApi.ts — EDIT: append
export async function setTeacherLevels(teacherId: string, levels: number[]): Promise<void> {
  const { error } = await supabase.rpc("admin_set_teacher_levels", { p_teacher_id: teacherId, p_levels: levels });
  if (error) throw error;
}

// src/screens/admin/AdminUsersScreen.tsx — EDITS
// (a) add the import:
import TeacherLevelsEditor from "../../components/admin/TeacherLevelsEditor";
// (b) inside renderItem, directly AFTER the closing </View> of <View style={styles.roleRow}> and before the closing </View> of the card, add:
{item.role === "teacher" && <TeacherLevelsEditor userId={item.id} />}
```

### `src/lib/courseApi.ts` edits
```ts
// src/lib/courseApi.ts — EDITS (apply all five)

// 1) REPLACE the MyCourse and StaffCourse interface lines with these (adds `level`), and ADD SuggestedCourse:
export interface MyCourse { id: string; code: string; title: string; level: number | null; department: string; teacher_name: string; member_count: number; next_exam: string | null }
export interface StaffCourse { id: string; code: string; title: string; level: number | null; join_code: string; department: string; teacher_name: string; member_count: number; question_count: number; material_count: number }
export interface SuggestedCourse { id: string; code: string; title: string; level: number; department: string; teacher_name: string }

// 2) REPLACE createCourse with this (level is now required):
export const createCourse = (departmentId: string, code: string, title: string, level: number) =>
  call<{ id: string; join_code: string }>("create_course", { p_department_id: departmentId, p_code: code, p_title: title, p_level: level });

// 3) REPLACE upsertCourseQuestion with this (adds the question pool):
export type QuestionPool = "daily" | "practice" | "assessment"; // daily = practice + daily quiz; assessment = tests/exams only
export const upsertCourseQuestion = (q: { id?: string | null; courseId: string; topic: string; question: string; options: string[]; correctIndex: number; explanation: string; pool?: QuestionPool }) =>
  call<string>("staff_upsert_course_question", {
    p_id: q.id ?? null, p_course_id: q.courseId, p_topic: q.topic, p_question: q.question, p_options: q.options,
    p_correct_index: q.correctIndex, p_explanation: q.explanation,
    p_in_daily: (q.pool ?? "daily") === "daily", p_assessment_only: q.pool === "assessment",
  });

// 4) In ExamSummary ADD these fields, and REPLACE scheduleExam:
//    kind: "practical" | "test" | "exam"; topic_id: string | null; review_after_submit: boolean; locked?: boolean;
export const scheduleExam = async (e: {
  courseId: string; title: string; questionIds: string[]; startsAt: Date; endsAt: Date; durationMinutes: number;
  kind?: "practical" | "test" | "exam"; topicId?: string | null; reviewAfterSubmit?: boolean;
}) => {
  const r = await call<{ exam_id: string; event_id: string }>("staff_create_exam", {
    p_course_id: e.courseId, p_title: e.title, p_question_ids: e.questionIds,
    p_starts_at: e.startsAt.toISOString(), p_ends_at: e.endsAt.toISOString(), p_duration_minutes: e.durationMinutes,
    p_kind: e.kind ?? "exam", p_topic_id: e.topicId ?? null, p_review_after_submit: !!e.reviewAfterSubmit,
  });
  notifyAnnouncement(r.event_id);
  return r;
};

// 5) APPEND at the end of the file:
// ── suggested courses (027) ──
export const fetchSuggestedCourses = async () => (await call<SuggestedCourse[]>("suggested_courses")) ?? [];
export const joinSuggestedCourse = (courseId: string) => call<{ course_id: string; code: string; title: string }>("join_suggested_course", { p_course_id: courseId });

// ── topics + progress (028) ──
export interface CourseTopicProgress { id: string; title: string; position: number; materials_total: number; materials_viewed: number; question_count: number; completed: boolean }
export interface CourseProgress { topics: CourseTopicProgress[]; topic_count: number; completed_count: number; course_complete: boolean; viewed_ids: string[] }
export const fetchCourseProgress = (courseId: string) => call<CourseProgress>("course_progress", { p_course_id: courseId });
export const recordMaterialView = (materialId: string) => call<void>("record_material_view", { p_material_id: materialId });
export const markTopicComplete = (topicId: string) => call<CourseProgress>("mark_topic_complete", { p_topic_id: topicId });
export const upsertTopic = (t: { id?: string | null; courseId: string; title: string }) => call<string>("staff_upsert_topic", { p_id: t.id ?? null, p_course_id: t.courseId, p_title: t.title });
// deleteContent=false: resources and questions move to General. deleteContent=true: the topic AND everything in it is deleted (remove uploaded files from storage first, see TeacherTopicScreen).
export const deleteTopic = (topicId: string, deleteContent = false) => call<void>("staff_delete_topic", { p_topic_id: topicId, p_delete_content: deleteContent });
export const updateMaterialMeta = (id: string, title: string, topic: string) => call<void>("staff_update_material_meta", { p_id: id, p_title: title, p_topic: topic });
export const reorderTopics = (courseId: string, ids: string[]) => call<void>("staff_reorder_topics", { p_course_id: courseId, p_ids: ids });
export interface StaffTopicProgress { member_count: number; topics: { id: string; title: string; position: number; completed_count: number; readers: number }[] }
export const fetchStaffTopicProgress = (courseId: string) => call<StaffTopicProgress>("staff_topic_progress", { p_course_id: courseId });

// ── server-checked practice (028): the phone never holds the answer key ──
export interface PracticeQ { id: string; q: string; options: string[]; topic: string }
export interface PracticeCheck { correct: number; explanation: string; was_correct: boolean }
export const fetchPracticeSet = async (courseId: string, topicId: string | null, count = 10) =>
  (await call<PracticeQ[]>("get_course_practice_set", { p_course_id: courseId, p_topic_id: topicId, p_count: count })) ?? [];
export const checkPracticeAnswer = (questionId: string, picked: number) => call<PracticeCheck>("check_course_practice_answer", { p_question_id: questionId, p_picked: picked });

// ── course daily quiz + ranking (029) ──
export type DailyQuiz =
  | { status: "locked" }
  | { status: "done"; correct: number; total: number }
  | { status: "ready"; questions: { id: string; q: string; options: string[]; topic: string }[] };
export interface DailyResult { correct: number; total: number; review: ExamReviewItem[] }
export const fetchDailyQuiz = (courseId: string) => call<DailyQuiz>("get_course_daily_quiz", { p_course_id: courseId, p_count: 5 });
export const submitDailyQuiz = (courseId: string, answers: (number | null)[]) => call<DailyResult>("submit_course_daily_quiz", { p_course_id: courseId, p_answers: answers });
export interface RankRow { rnk: number; name: string; points: number; assessments: number; dailies: number; is_me: boolean }
export interface CourseRanking { me: RankRow | null; top: RankRow[]; size: number }
export const fetchCourseRanking = (courseId: string) => call<CourseRanking>("course_leaderboard", { p_course_id: courseId });
```

## STEP 3: Shared responsive shell

```tsx
// src/components/study/Screen.tsx  (NEW)
import React from "react";
import { View, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, RefreshControl, useWindowDimensions } from "react-native";
import { spacing } from "../../theme/tokens";
import { s } from "./ui";

/**
 * Responsive page shell: safe area, keyboard avoidance, pull-to-refresh, and a centred column that is full width on
 * phones and capped at 720 px on tablets / landscape / web so nothing stretches edge to edge.
 */
export default function Screen({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const { width } = useWindowDimensions();
  const pad = width < 360 ? spacing.lg : spacing.xl;
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: pad, paddingBottom: spacing.xxxl * 2, alignItems: "center" }}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          <View style={{ width: "100%", maxWidth: 720 }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

### `src/components/study/DateTimeField.tsx` (NEW) — native date and time picker (replaces typing `YYYY-MM-DD` / `HH:MM`)
First run: `npx expo install @react-native-community/datetimepicker`. If the app is installed from an EAS / dev-client build, a **new native build** is needed after adding it (Expo Go already includes it).
```tsx
// src/components/study/DateTimeField.tsx  (NEW) — native date / time picker field. Install first:  npx expo install @react-native-community/datetimepicker
import React, { useState } from "react";
import { View, Text, Platform } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import PressableScale from "../animated/PressableScale";
import { colors, spacing, type } from "../../theme/tokens";
import { Muted, s } from "./ui";

export const fmtField = (d: Date, mode: "date" | "datetime") =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) +
  (mode === "datetime" ? ` · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "");
/** "YYYY-MM-DD" in the device's local time zone (what course events store). */
export const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Props = { label: string; value: Date | null; onChange: (d: Date) => void; mode?: "date" | "datetime"; minimumDate?: Date; defaultValue?: Date };

/** Android shows the date dialog then the time dialog; iOS shows one inline picker with a Done button. */
export default function DateTimeField({ label, value, onChange, mode = "datetime", minimumDate, defaultValue }: Props) {
  const [step, setStep] = useState<null | "date" | "time">(null);
  const [draft, setDraft] = useState<Date>(value ?? defaultValue ?? new Date());

  const begin = () => { setDraft(value ?? defaultValue ?? new Date()); setStep("date"); };
  const onAndroid = (e: DateTimePickerEvent, picked?: Date) => {
    if (e.type === "dismissed" || !picked) { setStep(null); return; }
    if (step === "date") {
      const next = new Date(draft);
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      if (mode === "datetime") { setDraft(next); setStep("time"); } else { setStep(null); onChange(next); }
    } else {
      const next = new Date(draft);
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setStep(null); onChange(next);
    }
  };

  return (
    <View style={{ marginTop: spacing.sm }}>
      <Muted>{label}</Muted>
      <PressableScale style={[s.input, { marginTop: 4 }]} onPress={begin} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={[type.body, { color: value ? colors.text : colors.textFaint }]}>{value ? fmtField(value, mode) : mode === "date" ? "Choose a date" : "Choose date and time"}</Text>
      </PressableScale>
      {Platform.OS === "android" && step && (
        <DateTimePicker value={draft} mode={step} is24Hour={false} minimumDate={step === "date" ? minimumDate : undefined} onChange={onAndroid} />
      )}
      {Platform.OS === "ios" && step && (
        <View>
          <DateTimePicker value={draft} mode={mode === "date" ? "date" : "datetime"} display="spinner" minimumDate={minimumDate} onChange={(_e, d) => { if (d) { setDraft(d); onChange(d); } }} />
          <PressableScale style={[s.btn, s.btnGhost]} onPress={() => setStep(null)}><Text style={[s.btnText, { color: colors.tealDeep }]}>Done</Text></PressableScale>
        </View>
      )}
    </View>
  );
}
```

Use `<Screen>` as the outer wrapper of every new or replaced screen below (already done in the code). Rules for any other screen you touch: no fixed pixel widths for text blocks, use `flexWrap` rows (`s.row`), `minWidth: "46%"` + `flexGrow: 1` for card grids, `flexShrink: 1` on long text next to a tag or number, `KeyboardAvoidingView` around forms, and keep touch targets at least 44 px high.

## STEP 4: Teacher and admin side

### `src/screens/teacher/TeacherCoursesScreen.tsx` (REPLACE WHOLE FILE)
```tsx
// src/screens/teacher/TeacherCoursesScreen.tsx  (REPLACE WHOLE FILE)
import React, { useCallback, useEffect, useState } from "react";
import { Text, Alert, TextInput, View } from "react-native";
import { colors, spacing } from "../../theme/tokens";
import { useApp } from "../../context/AppContext";
import { Btn, Card, Chip, Label, Muted, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import { fetchStaffCourses, createCourse, StaffCourse } from "../../lib/courseApi";

/** Teachers see their own courses; admins see every course. Teachers can only create courses in their own department and assigned levels. */
export default function TeacherCoursesScreen({ navigation }: any) {
  const { profile } = useApp();
  const [courses, setCourses] = useState<StaffCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(""), [title, setTitle] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const isAdmin = profile?.role === "admin";
  const myLevels = (profile?.teaching_levels ?? []).slice().sort((a, b) => a - b);

  const load = useCallback(async () => {
    try { setCourses(await fetchStaffCourses()); setError(null); } catch (e: any) { setError(e?.message ?? "Couldn't load courses."); setCourses((c) => c ?? []); }
  }, []);
  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

  const create = async () => {
    if (!profile?.department_id || !level || busy) return;
    setBusy(true);
    try {
      const c = await createCourse(profile.department_id, code, title, level);
      setCode(""); setTitle(""); setLevel(null); await load();
      Alert.alert("Course created", `${profile.department} · Level ${level}. Students in that department and level will see it automatically. Now add topics and resources.`,
        [{ text: "Add topics", onPress: () => navigation.navigate("TeacherCourse", { courseId: c.id }) }]);
    } catch (e: any) { Alert.alert("Couldn't create course", e?.message ?? "Try again."); } finally { setBusy(false); }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <Text style={s.h1}>{isAdmin ? "All courses" : "My courses"}</Text>
      {!isAdmin && <Muted>{profile?.department}{myLevels.length ? ` · Levels ${myLevels.join(", ")}` : ""}</Muted>}
      {courses === null && <ListSkeleton />}
      {error && <Muted style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Muted>}
      {courses?.length === 0 && !error && <Muted style={{ marginTop: spacing.sm }}>{isAdmin ? "No courses yet." : "Create your first course below, then add topics and resources to it."}</Muted>}
      {courses?.map((c) => (
        <Card key={c.id} style={{ marginTop: spacing.sm }} onPress={() => navigation.navigate("TeacherCourse", { courseId: c.id })}>
          <Text style={s.h3}>{c.code} · {c.title}</Text>
          <Muted>{c.department} · {c.level ? `Level ${c.level}` : "No level set"}</Muted>
          <Muted>{c.member_count} students · {c.material_count} resources · {c.question_count} questions{isAdmin ? ` · ${c.teacher_name}` : ` · code ${c.join_code}`}</Muted>
        </Card>
      ))}

      {!isAdmin && !!profile?.department_id && myLevels.length === 0 && (
        <Card style={{ marginTop: spacing.lg }}><Text style={s.h3}>Waiting for level assignment</Text><Muted>An admin must assign the level(s) you teach before you can create courses. Ask them to open Users → your name → Teaching levels.</Muted></Card>
      )}

      {!!profile?.department_id && (isAdmin || myLevels.length > 0) && (
        <>
          <Label>NEW COURSE</Label>
          <Muted>Department: {profile.department}</Muted>
          <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="Course code (e.g. PHY101)" placeholderTextColor={colors.textFaint} autoCapitalize="characters" />
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Title (e.g. General Physics I)" placeholderTextColor={colors.textFaint} />
          <Label>LEVEL</Label>
          <View style={s.row}>{(isAdmin ? [1, 2, 3, 4, 5, 6, 7, 8] : myLevels).map((n) => <Chip key={n} label={`Level ${n}`} on={level === n} onPress={() => setLevel(n)} />)}</View>
          <Btn label={busy ? "Creating…" : "Create course"} onPress={create} disabled={busy || !level || code.trim().length < 2 || title.trim().length < 2} />
        </>
      )}
    </Screen>
  );
}
```

g### `src/screens/teacher/TeacherCourseScreen.tsx` (REPLACE WHOLE FILE)
```tsx
// src/screens/teacher/TeacherCourseScreen.tsx  (REPLACE WHOLE FILE)
// Tabs: Topics (create topics, open one to add resources + questions) · Tests & exams · Insights · Updates.
// The old Materials and Questions tabs moved into TeacherTopicScreen so everything is topic by topic.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Alert, ScrollView } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Bar, Btn, Card, Chip, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import {
  fetchCourseContent, fetchCourseStats, CourseStats, postCourseEvent, deleteCourseContent, deleteCourse, fetchStaffCourses,
    removeCourseFiles, upsertTopic, reorderTopics, fetchStaffTopicProgress, StaffTopicProgress,
    } from "../../lib/courseApi";
    import { CourseBundle } from "../../lib/studyCourseSync";
    import TeacherExamsPanel from "./TeacherExamsPanel";
    import DateTimeField, { toYmd } from "../../components/study/DateTimeField";

    type Tab = "Topics" | "Tests & exams" | "Insights" | "Updates";
    const TABS: Tab[] = ["Topics", "Tests & exams", "Insights", "Updates"];

    export default function TeacherCourseScreen({ navigation, route }: any) {
      const { courseId } = route.params as { courseId: string };
        const [tab, setTab] = useState<Tab>("Topics");
          const [bundle, setBundle] = useState<CourseBundle | null>(null);
            const [stats, setStats] = useState<CourseStats | null>(null);
              const [prog, setProg] = useState<StaffTopicProgress | null>(null);
                const [joinCode, setJoinCode] = useState("");
                  const [meta, setMeta] = useState<{ department: string; level: number | null } | null>(null);
                    const [error, setError] = useState<string | null>(null);
                      const [busy, setBusy] = useState(false);
                        const [newTopic, setNewTopic] = useState("");
                          const [eKind, setEKind] = useState<"announcement" | "exam">("announcement"), [eTitle, setETitle] = useState(""), [eBody, setEBody] = useState(""), [eDate, setEDate] = useState<Date | null>(null);

                            const load = useCallback(async () => {
                                try {
                                      const [b, st, list, tp] = await Promise.all([fetchCourseContent(courseId), fetchCourseStats(courseId), fetchStaffCourses(), fetchStaffTopicProgress(courseId)]);
                                            setBundle(b); setStats(st); setProg(tp);
                                                  const me = list.find((c) => c.id === courseId);
                                                        setJoinCode(me?.join_code ?? ""); setMeta(me ? { department: me.department, level: me.level } : null); setError(null);
                                                            } catch (e: any) { setError(e?.message ?? "Couldn't load this course."); }
                                                              }, [courseId]);
                                                                useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

                                                                  const act = async (fn: () => Promise<unknown>, fail: string) => { if (busy) return; setBusy(true); try { await fn(); await load(); } catch (e: any) { Alert.alert(fail, e?.message ?? "Try again."); } finally { setBusy(false); } };
                                                                    const topics = [...(bundle?.topics ?? [])].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
                                                                      const move = (i: number, dir: -1 | 1) => {
                                                                          const j = i + dir; if (j < 0 || j >= topics.length) return;
                                                                              const ids = topics.map((t) => t.id); [ids[i], ids[j]] = [ids[j], ids[i]];
                                                                                  act(() => reorderTopics(courseId, ids), "Couldn't reorder");
                                                                                    };
                                                                                      const addTopic = () => act(async () => { await upsertTopic({ courseId, title: newTopic }); setNewTopic(""); }, "Couldn't add topic");
                                                                                        const saveEvent = () => {
                                                                                            if (eKind === "exam" && !eDate) return Alert.alert("Exam date", "Choose the date first.");
                                                                                                act(async () => { await postCourseEvent({ courseId, kind: eKind, title: eTitle, body: eBody, eventDate: eKind === "exam" && eDate ? toYmd(eDate) : null }); setETitle(""); setEBody(""); setEDate(null); }, "Couldn't post");
                                                                                                  };
                                                                                                    const confirmDeleteEvent = (id: string) => Alert.alert("Delete?", "This can't be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => act(() => deleteCourseContent("event", id), "Couldn't delete") }]);
                                                                                                      const removeCourse = () => Alert.alert("Delete this course?", "Students lose access to its content and results. Their own copies of practice material stay with them.", [
                                                                                                          { text: "Cancel", style: "cancel" },
                                                                                                              { text: "Delete course", style: "destructive", onPress: async () => { try { await removeCourseFiles(courseId); await deleteCourse(courseId); navigation.goBack(); } catch (e: any) { Alert.alert("Couldn't delete", e?.message ?? "Try again."); } } },
                                                                                                                ]);

                                                                                                                  if (error && !bundle) return <Screen><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Course unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></Screen>;
                                                                                                                    if (!bundle || !stats) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;

                                                                                                                      const input = (v: string, set: (x: string) => void, ph: string, extra: any = {}) => <TextInput style={[s.input, extra]} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={colors.textFaint} />;
                                                                                                                        const tone = (p: number) => (p >= 75 ? colors.success : p >= 50 ? colors.ember : colors.danger);
                                                                                                                          const countIn = (topicId: string | null) => ({
                                                                                                                              res: bundle.materials.filter((m) => (m.topic_id ?? null) === topicId).length,
                                                                                                                                  qs: bundle.questions.filter((q) => (q.topic_id ?? null) === topicId).length,
                                                                                                                                    });
                                                                                                                                      const general = countIn(null);

                                                                                                                                        return (
                                                                                                                                            <Screen>
                                                                                                                                                  <Back onPress={() => navigation.goBack()} />
                                                                                                                                                        <Text style={s.h1}>{bundle.course.code}</Text>
                                                                                                                                                              <Muted>{bundle.course.title}</Muted>
                                                                                                                                                                    <Muted>{meta ? `${meta.department} · ${meta.level ? `Level ${meta.level}` : "no level"}` : ""}{joinCode ? ` · join code ${joinCode}` : ""}</Muted>
                                                                                                                                                                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.lg, flexGrow: 0 }}>
                                                                                                                                                                                  <View style={s.row}>{TABS.map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}</View>
                                                                                                                                                                                        </ScrollView>

                                                                                                                                                                                              {tab === "Topics" && (
                                                                                                                                                                                                      <>
                                                                                                                                                                                                                <Muted>Break the course into topics. Open a topic to upload its notes, links, videos and files, and to add its practice and daily-quiz questions. Students read topic by topic, and tests and exams unlock when they finish every topic.</Muted>
                                                                                                                                                                                                                          {topics.length === 0 && <Card style={{ marginTop: spacing.md }}><Text style={s.h3}>No topics yet</Text><Muted>Add the first topic below, for example "Kinematics".</Muted></Card>}
                                                                                                                                                                                                                                    {topics.map((t, i) => {
                                                                                                                                                                                                                                                const c = countIn(t.id);
                                                                                                                                                                                                                                                            const p = prog?.topics.find((x) => x.id === t.id);
                                                                                                                                                                                                                                                                        return (
                                                                                                                                                                                                                                                                                      <Card key={t.id} style={{ marginTop: spacing.sm }} onPress={() => navigation.navigate("TeacherTopic", { courseId, topicId: t.id, title: t.title })}>
                                                                                                                                                                                                                                                                                                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                                                                                                                                                                                                                                                                                                                        <View style={{ flex: 1 }}>
                                                                                                                                                                                                                                                                                                                                            <Text style={s.h3}>{i + 1}. {t.title}</Text>
                                                                                                                                                                                                                                                                                                                                                                <Muted>{c.res} resource{c.res === 1 ? "" : "s"} · {c.qs} question{c.qs === 1 ? "" : "s"}{p && prog ? ` · ${p.completed_count}/${prog.member_count} finished` : ""}</Muted>
                                                                                                                                                                                                                                                                                                                                                                                  </View>
                                                                                                                                                                                                                                                                                                                                                                                                    <PressableScale onPress={() => move(i, -1)} accessibilityLabel="Move up"><Text style={[s.h3, { paddingHorizontal: 10 }]}>↑</Text></PressableScale>
                                                                                                                                                                                                                                                                                                                                                                                                                      <PressableScale onPress={() => move(i, 1)} accessibilityLabel="Move down"><Text style={[s.h3, { paddingHorizontal: 10 }]}>↓</Text></PressableScale>
                                                                                                                                                                                                                                                                                                                                                                                                                                      </View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                    </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          })}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {(general.res > 0 || general.qs > 0) && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Card style={{ marginTop: spacing.sm }} onPress={() => navigation.navigate("TeacherTopic", { courseId, topicId: null, title: "General" })}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <Text style={s.h3}>General (no topic)</Text><Muted>{general.res} resources · {general.qs} questions. Students can't mark this finished, so move them into a topic.</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <Label>ADD A TOPIC</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        {input(newTopic, setNewTopic, "Topic name (e.g. Kinematics)")}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <Btn label="Add topic" disabled={busy || !newTopic.trim()} onPress={addTopic} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {tab === "Tests & exams" && <TeacherExamsPanel courseId={courseId} questions={bundle.questions} topics={topics} onChanged={load} />}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {tab === "Insights" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <View style={s.row}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          {[[`${stats.member_count}`, "students"], [`${stats.active_7d}`, "active this week"], [`${stats.answers_total}`, "answers"], [stats.accuracy == null ? "—" : `${stats.accuracy}%`, "class accuracy"]].map(([v, k]) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Card key={k} style={{ minWidth: "46%", flexGrow: 1 }}><Text style={s.h2}>{v}</Text><Muted>{k}</Muted></Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              </View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Label>TOPIC COMPLETION</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  {prog?.topics.length === 0 && <Muted>No topics yet.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {prog?.topics.map((t) => {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        const pct = prog.member_count ? Math.round((100 * t.completed_count) / prog.member_count) : 0;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <Card key={t.id}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={s.h3}>{t.title}</Text><Muted>{t.completed_count}/{prog.member_count} finished · {t.readers} reading</Muted></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <View style={{ marginTop: 6 }}><Bar value={pct / 100} color={tone(pct)} /></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      })}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Label>HARDEST QUESTIONS</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          {stats.hardest.length === 0 && <Muted>Needs at least 3 answers per question. Practice results appear here automatically.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {stats.hardest.map((h) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Card key={h.question_id}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <Text style={type.bodyMedium} numberOfLines={3}>{h.question}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Tag label={`${h.pct_correct}% correct`} color={tone(h.pct_correct)} /><Muted>{h.attempts} attempts{h.topic ? ` · ${h.topic}` : ""}</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          <Label>TOPICS TO REVISIT IN CLASS</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {stats.topics.map((t) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Card key={t.topic}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={s.h3}>{t.topic}</Text><Muted>{t.pct_correct}% · {t.attempts} answers</Muted></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <View style={{ marginTop: 6 }}><Bar value={t.pct_correct / 100} color={tone(t.pct_correct)} /></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Label>STUDENTS (LOWEST ACCURACY FIRST)</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {stats.students.length === 0 && <Muted>No answers yet.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {stats.students.slice(0, 20).map((st, i) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Card key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={type.bodyMedium}>{st.name}</Text><Muted>{st.accuracy}% · {st.answers} answers</Muted></Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Btn ghost danger label="Delete course" onPress={removeCourse} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {tab === "Updates" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {bundle.events.length === 0 && <Muted>Post announcements. Test and exam dates you schedule also show here automatically.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {bundle.events.map((e) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Card key={e.id} style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          <View style={{ flex: 1 }}><Text style={s.h3}>{e.kind === "exam" ? "📝 " : "📣 "}{e.title}</Text><Muted>{e.event_date ?? ""}{e.body ? ` ${e.body}` : ""}</Muted></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <PressableScale onPress={() => confirmDeleteEvent(e.id)}><Text style={s.muted}>Delete</Text></PressableScale>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Label>NEW UPDATE</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <View style={s.row}>{(["announcement", "exam"] as const).map((k) => <Chip key={k} label={k === "exam" ? "exam date" : k} on={eKind === k} onPress={() => setEKind(k)} />)}</View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {input(eTitle, setETitle, eKind === "exam" ? "Title (e.g. Midterm)" : "Announcement title")}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {input(eBody, setEBody, "Details (optional)")}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {eKind === "exam" && <DateTimeField label="Date" mode="date" value={eDate} onChange={setEDate} minimumDate={new Date()} />}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          <Btn label="Post" disabled={busy || !eTitle.trim()} onPress={saveEvent} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            </Screen>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ```

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ### `src/screens/teacher/TeacherTopicScreen.tsx` (NEW)
```tsx
// src/screens/teacher/TeacherTopicScreen.tsx  (NEW) — everything for ONE topic: resources (notes, links, videos, files) and questions.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Btn, Card, Chip, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import {
  fetchCourseContent, upsertMaterial, upsertCourseQuestion, deleteCourseContent, removeMaterialFile, upsertTopic, deleteTopic, updateMaterialMeta, QuestionPool,
} from "../../lib/courseApi";
import { CourseBundle } from "../../lib/studyCourseSync";
import { generateQuestions, FileInfo } from "../../lib/studyAi";
import { parseQuestionBlocks, ParsedQuestion } from "../../lib/bulkImport";
import TeacherFileUpload from "./TeacherFileUpload";
import { fmtSize } from "../../lib/fileRules";

const LETTERS = ["A", "B", "C", "D"];
const POOLS: { id: QuestionPool; label: string; hint: string }[] = [
  { id: "daily", label: "Practice + daily quiz", hint: "Students practise it, and it can appear in their daily quiz." },
  { id: "practice", label: "Practice only", hint: "Topic practice only; never in the daily quiz." },
  { id: "assessment", label: "Tests & exams only", hint: "Hidden from students until you put it in a test, exam or practical." },
];
const poolOf = (q: { in_daily?: boolean; assessment_only?: boolean }): QuestionPool => (q.assessment_only ? "assessment" : q.in_daily === false ? "practice" : "daily");
const KIND_ICON = { note: "📝", link: "🔗", video: "🎬", file: "📎" } as const;

export default function TeacherTopicScreen({ navigation, route }: any) {
  const { courseId, topicId, title: initialTitle } = route.params as { courseId: string; topicId: string | null; title: string };
  const [title, setTitle] = useState(initialTitle);
  const [renameTo, setRenameTo] = useState(initialTitle);
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const topicName = topicId ? title : ""; // "" = General (no topic)
  // editing: tap Edit on a resource or question to load it into the form below; "Topic" chips let you move it to another topic
  const [editMat, setEditMat] = useState<{ id: string; kind: "note" | "link" | "video" | "file" } | null>(null);
  const [editQ, setEditQ] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null); // null = stay in this topic
  const target = dest ?? topicName;
  // resource form
  const [mTitle, setMTitle] = useState(""), [mKind, setMKind] = useState<"note" | "link" | "video">("note"), [mBody, setMBody] = useState("");
  // question form
  const [qText, setQText] = useState(""), [opts, setOpts] = useState(["", "", "", ""]), [right, setRight] = useState(0), [why, setWhy] = useState(""), [pool, setPool] = useState<QuestionPool>("daily");
  const [drafts, setDrafts] = useState<ParsedQuestion[]>([]), [drafting, setDrafting] = useState(false), [paste, setPaste] = useState("");
  const parsed = useMemo(() => (paste.trim() ? parseQuestionBlocks(paste) : null), [paste]);

  const load = useCallback(async () => {
    try { setBundle(await fetchCourseContent(courseId)); setError(null); } catch (e: any) { setError(e?.message ?? "Couldn't load."); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, fail: string) => { if (busy) return; setBusy(true); try { await fn(); await load(); } catch (e: any) { Alert.alert(fail, e?.message ?? "Try again."); } finally { setBusy(false); } };
  const materials = (bundle?.materials ?? []).filter((m) => (m.topic_id ?? null) === topicId);
  const questions = (bundle?.questions ?? []).filter((q) => (q.topic_id ?? null) === topicId);
  const input = (v: string, set: (x: string) => void, ph: string, style: any = {}, props: any = {}) => <TextInput style={[s.input, style]} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={colors.textFaint} {...props} />;

  const confirmDelete = (kind: "material" | "question", id: string) =>
    Alert.alert("Delete?", kind === "question" ? "Students' copies are removed the next time they open the course." : "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => act(async () => {
        const filePath = kind === "material" ? materials.find((m) => m.id === id && m.kind === "file")?.body : undefined;
        await deleteCourseContent(kind, id);
        if (filePath) await removeMaterialFile(filePath);
      }, "Couldn't delete") },
    ]);

  const saveQuestion = () => {
    if (!qText.trim() || opts.some((o) => !o.trim())) return Alert.alert("Incomplete", "Enter the question and all four options.");
    act(async () => {
      await upsertCourseQuestion({ id: editQ, courseId, topic: editQ ? target : topicName, question: qText, options: opts.map((o) => o.trim()), correctIndex: right, explanation: why, pool });
      resetQuestion();
    }, "Couldn't save question");
  };
  const resetQuestion = () => { setEditQ(null); setDest(null); setQText(""); setOpts(["", "", "", ""]); setWhy(""); setRight(0); };
  const resetMaterial = () => { setEditMat(null); setDest(null); setMTitle(""); setMBody(""); setMKind("note"); };
  const startEditMaterial = (m: CourseBundle["materials"][number]) => {
    setEditQ(null); setEditMat({ id: m.id, kind: m.kind }); setDest(null); setMTitle(m.title);
    if (m.kind !== "file") { setMKind(m.kind); setMBody(m.body); } else { setMBody(""); }
  };
  const startEditQuestion = (q: CourseBundle["questions"][number]) => {
    setEditMat(null); setEditQ(q.id); setDest(null); setQText(q.question); setOpts([...q.options]); setRight(q.correct_index); setWhy(q.explanation ?? ""); setPool(poolOf(q));
  };
  const saveMaterial = () => act(async () => {
    if (editMat?.kind === "file") await updateMaterialMeta(editMat.id, mTitle, target);
    else await upsertMaterial({ id: editMat?.id ?? null, courseId, topic: editMat ? target : topicName, title: mTitle, kind: mKind, body: mBody });
    resetMaterial();
  }, "Couldn't save");
  const topicChips = (
    <>
      <Muted style={{ marginTop: spacing.sm }}>Topic (change it to move this item)</Muted>
      <View style={s.row}>
        {[{ t: "", label: "General" }, ...(bundle?.topics ?? []).map((x) => ({ t: x.title, label: x.title }))].map((x) => (
          <Chip key={x.t || "general"} label={x.label} on={target === x.t} onPress={() => setDest(x.t)} />
        ))}
      </View>
    </>
  );
  const publishAll = async (items: ParsedQuestion[]) => {
    if (busy || !items.length) return 0;
    setBusy(true); let ok = 0;
    try { for (const it of items) { await upsertCourseQuestion({ courseId, topic: topicName, question: it.question, options: it.options, correctIndex: it.correctIndex, explanation: it.explanation, pool }); ok++; } }
    catch (e: any) { Alert.alert("Stopped early", `${ok} of ${items.length} published. ${e?.message ?? "Try again."}`); }
    finally { setBusy(false); await load(); }
    return ok;
  };
  const draftWithAi = async () => {
    if (!bundle || drafting) return;
    setDrafting(true);
    try {
      const notes = materials.filter((m) => m.kind !== "file").map((m) => `${m.title}: ${m.body}`).join("\n");
      const files = materials.filter((m) => m.kind === "file").slice(-3).map((m) => m.body);
      let info: FileInfo | null = null;
      const made = await generateQuestions({ subject: `${bundle.course.code} ${bundle.course.title}`, topic: topicName || undefined, notes, files, onFiles: (i) => { info = i; }, count: 5 });
      setDrafts(made.map((m) => ({ topic: topicName, question: m.q, options: m.options, correctIndex: m.correct, explanation: m.explanation })));
      const skipped = (info as FileInfo | null)?.skipped ?? 0;
      if (skipped > 0) Alert.alert("Some files weren't used", `${skipped} file${skipped === 1 ? "" : "s"} couldn't be read, so those questions use your notes and the other files.`);
    } catch { Alert.alert("Couldn't draft questions", "The AI service is unreachable. Check your connection, or that the study-companion function is deployed."); }
    finally { setDrafting(false); }
  };
  const rename = () => act(async () => { await upsertTopic({ id: topicId, courseId, title: renameTo }); setTitle(renameTo.trim()); }, "Couldn't rename");
  const removeTopic = () => Alert.alert("Delete this topic?", `"${title}" has ${materials.length} resource${materials.length === 1 ? "" : "s"} and ${questions.length} question${questions.length === 1 ? "" : "s"}. Students' progress on it is removed either way.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Keep content in General", onPress: async () => { try { await deleteTopic(topicId!, false); navigation.goBack(); } catch (e: any) { Alert.alert("Couldn't delete", e?.message ?? "Try again."); } } },
    { text: "Delete everything", style: "destructive", onPress: () => Alert.alert("Delete topic and ALL its content?", "The topic, its notes, links, videos, uploaded files and questions are permanently deleted for you and your students.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete everything", style: "destructive", onPress: async () => {
        try {
          const files = materials.filter((m) => m.kind === "file").map((m) => m.body);
          await deleteTopic(topicId!, true);
          await Promise.all(files.map((f) => removeMaterialFile(f))); // after the rows are gone; best effort
          navigation.goBack();
        } catch (e: any) { Alert.alert("Couldn't delete", e?.message ?? "Try again."); }
      } },
    ]) },
  ]);

  if (error && !bundle) return <Screen><Back onPress={() => navigation.goBack()} /><Muted>{error}</Muted></Screen>;
  if (!bundle) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;
  const hasText = materials.some((m) => m.kind !== "file");

  return (
    <Screen>
      <Back onPress={() => navigation.goBack()} />
      <Text style={s.h1}>{title}</Text>
      <Muted>{bundle.course.code} · {materials.length} resource{materials.length === 1 ? "" : "s"} · {questions.length} question{questions.length === 1 ? "" : "s"}</Muted>

      {topicId && (
        <>
          {input(renameTo, setRenameTo, "Topic name")}
          <View style={s.row}>
            <Chip label="Rename" on={false} onPress={rename} />
            <Chip label="Delete topic" on={false} onPress={removeTopic} />
          </View>
        </>
      )}

      <Label>RESOURCES FOR THIS TOPIC</Label>
      {materials.length === 0 && <Muted>Nothing yet. Add as many notes, links, videos and files as you like. Students open them in the order shown.</Muted>}
      {materials.map((m) => (
        <Card key={m.id} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>{KIND_ICON[m.kind]} {m.title}</Text>
            <Muted>{m.kind === "file" ? `${m.file_name ?? "file"}${m.file_size ? ` · ${fmtSize(m.file_size)}` : ""}` : m.kind === "note" ? `${m.body.length} characters` : m.body}</Muted>
          </View>
          <PressableScale onPress={() => startEditMaterial(m)}><Text style={[s.muted, { color: colors.tealDeep, paddingHorizontal: 10 }]}>Edit</Text></PressableScale>
          <PressableScale onPress={() => confirmDelete("material", m.id)}><Text style={s.muted}>Delete</Text></PressableScale>
        </Card>
      ))}
      <Label>{editMat ? "EDIT RESOURCE" : "ADD A NOTE, LINK OR VIDEO"}</Label>
      {editMat?.kind === "file" && <Muted>Files can be renamed or moved to another topic. To replace the file itself, delete it and upload the new one.</Muted>}
      {editMat?.kind !== "file" && <View style={s.row}>{(["note", "link", "video"] as const).map((k) => <Chip key={k} label={k} on={mKind === k} onPress={() => setMKind(k)} />)}</View>}
      {input(mTitle, setMTitle, "Name this resource (e.g. Lecture 1 notes)")}
      {editMat?.kind !== "file" && input(mBody, setMBody, mKind === "note" ? "Write or paste the notes" : mKind === "link" ? "https://…" : "Video link (https://…)", { minHeight: mKind === "note" ? 140 : undefined, textAlignVertical: "top" }, { multiline: mKind === "note", autoCapitalize: mKind === "note" ? "sentences" : "none", autoCorrect: mKind === "note" })}
      {editMat && topicChips}
      <Btn label={editMat ? "Save changes" : "Add resource"} disabled={busy || !mTitle.trim() || (editMat?.kind !== "file" && (!mBody.trim() || (mKind !== "note" && !/^https?:\/\//i.test(mBody.trim()))))} onPress={saveMaterial} />
      {editMat && <Btn ghost label="Cancel editing" onPress={resetMaterial} />}
      {mKind !== "note" && !!mBody.trim() && !/^https?:\/\//i.test(mBody.trim()) && <Muted style={{ color: colors.danger }}>Links must start with http:// or https://</Muted>}
      <Label>ATTACH A FILE (PDF, Word, slides, image…)</Label>
      <TeacherFileUpload courseId={courseId} topic={topicName} onAdded={load} />

      <Label>QUESTIONS FOR THIS TOPIC</Label>
      {questions.length === 0 && <Muted>Add questions students will practise after reading. Choose where each one is used.</Muted>}
      {questions.map((q) => (
        <Card key={q.id} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyMedium} numberOfLines={2}>{q.question}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <Tag label={POOLS.find((p) => p.id === poolOf(q))!.label} color={poolOf(q) === "assessment" ? colors.violet : poolOf(q) === "daily" ? colors.teal : colors.ember} />
              <Muted>answer {LETTERS[q.correct_index]}</Muted>
            </View>
          </View>
          <PressableScale onPress={() => startEditQuestion(q)}><Text style={[s.muted, { color: colors.tealDeep, paddingHorizontal: 10 }]}>Edit</Text></PressableScale>
          <PressableScale onPress={() => confirmDelete("question", q.id)}><Text style={s.muted}>Delete</Text></PressableScale>
        </Card>
      ))}

      <Label>{editQ ? "WHERE THIS QUESTION IS USED" : "WHERE THE NEXT QUESTIONS WILL BE USED"}</Label>
      <View style={s.row}>{POOLS.map((p) => <Chip key={p.id} label={p.label} on={pool === p.id} onPress={() => setPool(p.id)} />)}</View>
      <Muted style={{ marginTop: 6 }}>{POOLS.find((p) => p.id === pool)!.hint}</Muted>

      <Label>DRAFT WITH AI</Label>
      <Muted>Drafts 5 questions from this topic's notes and files. Check every one before publishing: AI can be wrong.</Muted>
      <Btn ghost label={drafting ? "Drafting…" : "✨ Draft 5 questions"} onPress={draftWithAi} disabled={drafting || materials.length === 0} />
      {materials.length === 0 && <Muted>Add a resource first so the questions are based on your content.</Muted>}
      {drafts.map((d, i) => (
        <Card key={i} style={{ marginTop: spacing.sm }}>
          <Text style={s.h3}>{d.question}</Text>
          {d.options.map((o, k) => <Text key={k} style={[type.body, { color: k === d.correctIndex ? colors.success : colors.text, marginTop: 2 }]}>{LETTERS[k]}. {o}{k === d.correctIndex ? "  ✓" : ""}</Text>)}
          {!!d.explanation && <Muted style={{ marginTop: 6 }}>{d.explanation}</Muted>}
          <View style={[s.row, { marginTop: spacing.sm }]}>
            <Chip label="Publish" on onPress={async () => { if (await publishAll([d])) setDrafts((x) => x.filter((_, k) => k !== i)); }} />
            <Chip label="Discard" on={false} onPress={() => setDrafts((x) => x.filter((_, k) => k !== i))} />
          </View>
        </Card>
      ))}
      {drafts.length > 1 && <Btn label={`Publish all ${drafts.length}`} disabled={busy} onPress={async () => { if (await publishAll(drafts)) setDrafts([]); }} />}
      {!hasText && materials.length > 0 && <Muted>Only files so far: the server reads PDF, Word, slides and text, but not scanned pages.</Muted>}

      <Label>PASTE MANY QUESTIONS</Label>
      <Muted>One block per question, separated by a blank line: "Q:" text, options A) to D), then "Answer: B". Optional "Why:" line.</Muted>
      <TextInput style={[s.input, { minHeight: 140, textAlignVertical: "top" }]} multiline value={paste} onChangeText={setPaste} placeholder={"Q: What is the root of a tree?\nA) The top node\nB) A leaf\nC) An edge\nD) A cycle\nAnswer: A\nWhy: It has no parent."} placeholderTextColor={colors.textFaint} autoCapitalize="none" />
      {parsed && (
        <>
          <Muted style={{ marginTop: 6 }}>{parsed.questions.length} ready to import{parsed.errors.length ? ` · ${parsed.errors.length} with problems (skipped)` : ""}</Muted>
          {parsed.errors.map((e) => <Text key={e.block} style={[type.caption, { color: colors.danger }]}>Question {e.block}: {e.message}</Text>)}
          <Btn label={`Import ${parsed.questions.length} question${parsed.questions.length === 1 ? "" : "s"}`} disabled={busy || parsed.questions.length === 0}
            onPress={async () => { const n = await publishAll(parsed.questions); if (n === parsed.questions.length) { setPaste(""); Alert.alert("Imported", `${n} questions published.`); } }} />
        </>
      )}

      <Label>{editQ ? "EDIT QUESTION" : "ADD ONE QUESTION"}</Label>
      {input(qText, setQText, "Question", { minHeight: 70, textAlignVertical: "top" }, { multiline: true })}
      {opts.map((o, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <PressableScale onPress={() => setRight(i)} style={{ marginTop: spacing.sm, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: right === i ? colors.success : colors.border }}>
            <Text style={[type.label, { color: right === i ? "#fff" : colors.text }]}>{LETTERS[i]}</Text>
          </PressableScale>
          <TextInput style={[s.input, { flex: 1 }]} value={o} onChangeText={(v) => setOpts(opts.map((x, k) => (k === i ? v : x)))} placeholder={`Option ${LETTERS[i]}`} placeholderTextColor={colors.textFaint} />
        </View>
      ))}
      <Muted style={{ marginTop: 4 }}>Tap a letter to mark the correct answer.</Muted>
      {input(why, setWhy, "Explanation shown after answering")}
      {editQ && topicChips}
      <Btn label={editQ ? "Save changes" : "Add question"} disabled={busy} onPress={saveQuestion} />
      {editQ && <Btn ghost label="Cancel editing" onPress={resetQuestion} />}
    </Screen>
  );
}
```



### `src/screens/teacher/TeacherExamsPanel.tsx` (REPLACE WHOLE FILE)
```tsx
// src/screens/teacher/TeacherExamsPanel.tsx  (REPLACE WHOLE FILE)
// Practical tests, tests and exams. Students can only start one after finishing the whole course
// (or the chosen topic, if you scope it to a topic). The server enforces this, not the app.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { colors, spacing } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Btn, Card, Chip, Label, Muted, Tag, s } from "../../components/study/ui";
import { fetchCourseExams, scheduleExam, deleteExam, fetchExamResults, ExamSummary, ExamResults } from "../../lib/courseApi";
import { validateExamSchedule, fmtWhen, fmtClock } from "../../lib/examTime";
import DateTimeField from "../../components/study/DateTimeField";
import { CourseBundle } from "../../lib/studyCourseSync";

type Kind = "practical" | "test" | "exam";
const KINDS: { id: Kind; label: string }[] = [{ id: "practical", label: "Practical test" }, { id: "test", label: "Test" }, { id: "exam", label: "Exam" }];
const kindLabel = (k: Kind) => KINDS.find((x) => x.id === k)?.label ?? "Exam";

export default function TeacherExamsPanel({ courseId, questions, topics, onChanged }: {
  courseId: string; questions: CourseBundle["questions"]; topics: { id: string; title: string }[]; onChanged?: () => void;
}) {
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; data: ExamResults } | null>(null);
  const [kind, setKind] = useState<Kind>("exam");
  const [scopeTopic, setScopeTopic] = useState<string | null>(null); // null = whole course must be finished
  const [review, setReview] = useState(false);
  const [title, setTitle] = useState(""), [dur, setDur] = useState("60");
  const [starts, setStarts] = useState<Date | null>(null), [ends, setEnds] = useState<Date | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { setExams(await fetchCourseExams(courseId)); setUnavailable(false); }
    catch { setExams([]); setUnavailable(true); } // migrations 021/029 not applied yet
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const pool = questions.filter((q) => !scopeTopic || q.topic_id === scopeTopic);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const input = (v: string, set: (x: string) => void, ph: string, style: any = {}, props: any = {}) =>
    <TextInput style={[s.input, style]} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={colors.textFaint} autoCapitalize="none" {...props} />;
  const pickScope = (id: string | null) => { setScopeTopic(id); setPicked(new Set()); };

  const create = async () => {
    const duration = parseInt(dur, 10);
    const err = validateExamSchedule({ title, starts, ends, duration, questionCount: picked.size });
    if (err) return Alert.alert(`Check the ${kindLabel(kind).toLowerCase()}`, err);
    setBusy(true);
    try {
      const ids = questions.filter((q) => picked.has(q.id)).map((q) => q.id); // keeps the course order
      await scheduleExam({ courseId, title: title.trim(), questionIds: ids, startsAt: starts!, endsAt: ends!, durationMinutes: duration, kind, topicId: scopeTopic, reviewAfterSubmit: review });
      setTitle(""); setPicked(new Set()); await load(); onChanged?.();
      Alert.alert(`${kindLabel(kind)} scheduled`, "Enrolled students were notified. It stays locked for each student until they finish the required topics. Questions are copied in, so later edits to the question bank won't change it.");
    } catch (e: any) { Alert.alert("Couldn't schedule", e?.message ?? "Try again."); }
    finally { setBusy(false); }
  };

  const remove = (x: ExamSummary) =>
    Alert.alert(`Delete this ${x.kind}?`, "All submitted results for it are deleted too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteExam(x.id); if (open?.id === x.id) setOpen(null); await load(); onChanged?.(); }
        catch (e: any) { Alert.alert("Couldn't delete", e?.message ?? "Try again."); }
      } },
    ]);

  const showResults = async (x: ExamSummary) => {
    if (open?.id === x.id) return setOpen(null);
    try { setOpen({ id: x.id, data: await fetchExamResults(x.id) }); }
    catch (e: any) { Alert.alert("Couldn't load results", e?.message ?? "Try again."); }
  };

  if (unavailable) return <Muted>Tests and exams aren't available yet. Apply database migrations 021 and 029 first.</Muted>;

  return (
    <>
      {exams === null && <Muted>Loading…</Muted>}
      {exams?.length === 0 && <Muted>No practical tests, tests or exams yet. Create one below from this course's questions.</Muted>}
      {exams?.map((x) => (
        <Card key={x.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={[s.h3, { flex: 1 }]}>{x.title}</Text>
            <Tag label={x.status} color={x.status === "open" ? colors.danger : x.status === "upcoming" ? colors.violet : colors.textFaint} />
          </View>
          <Muted>{kindLabel(x.kind)} · {x.topic_id ? `topic: ${topics.find((t) => t.id === x.topic_id)?.title ?? "?"}` : "whole course"} · {x.question_count} questions · {x.duration_minutes} min · {x.submitted_count ?? 0} submitted</Muted>
          <Muted>Opens {fmtWhen(x.starts_at)} · closes {fmtWhen(x.ends_at)}{x.review_after_submit ? " · review right after submitting" : " · review after it closes"}</Muted>
          <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
            <PressableScale onPress={() => showResults(x)}><Text style={[s.muted, { color: colors.tealDeep }]}>{open?.id === x.id ? "Hide results" : "Results"}</Text></PressableScale>
            <PressableScale onPress={() => remove(x)}><Text style={s.muted}>Delete</Text></PressableScale>
          </View>
          {open?.id === x.id && (
            <View style={{ marginTop: spacing.md }}>
              <Muted>Students not yet submitted count as 0 and are marked.</Muted>
              {open.data.students.length === 0 && <Muted>Nobody is enrolled.</Muted>}
              {open.data.students.map((st, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, gap: spacing.sm }}>
                  <Text style={[s.muted, { flexShrink: 1 }]}>{st.name}</Text>
                  <Text style={s.muted}>{st.submitted ? `${st.correct}/${open.data.total}${st.seconds != null ? ` · ${fmtClock(st.seconds)}` : ""}` : st.started ? "started, not submitted" : "not started"}</Text>
                </View>
              ))}
              <Label>PER QUESTION</Label>
              {open.data.questions.map((q, i) => (
                <View key={i} style={{ marginTop: 4 }}>
                  <Text style={s.muted} numberOfLines={2}>{i + 1}. {q.q}</Text>
                  <Text style={[s.muted, { color: q.pct_correct == null ? colors.textFaint : q.pct_correct >= 60 ? colors.success : colors.danger }]}>{q.pct_correct == null ? "no submissions" : `${q.pct_correct}% correct (${q.attempts})`}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      ))}

      <Label>CREATE A {kindLabel(kind).toUpperCase()}</Label>
      <View style={s.row}>{KINDS.map((k) => <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => setKind(k.id)} />)}</View>
      <Muted style={{ marginTop: spacing.sm }}>Unlocks for a student when they have finished:</Muted>
      <View style={s.row}>
        <Chip label="Whole course" on={scopeTopic === null} onPress={() => pickScope(null)} />
        {topics.map((t) => <Chip key={t.id} label={t.title} on={scopeTopic === t.id} onPress={() => pickScope(t.id)} />)}
      </View>
      {pool.length < 3 ? <Muted style={{ marginTop: spacing.sm }}>Add at least 3 questions{scopeTopic ? " to that topic" : " to this course"} first. Tip: mark questions "Tests & exams only" so students never see them while practising.</Muted> : (
        <>
          {input(title, setTitle, `${kindLabel(kind)} title (e.g. Midterm)`, {}, { autoCapitalize: "sentences" })}
          <DateTimeField label="Opens (your local time)" value={starts} onChange={(d) => { setStarts(d); if (!ends || ends <= d) setEnds(new Date(d.getTime() + 24 * 3600 * 1000)); }} minimumDate={new Date()} />
          <DateTimeField label="Closes (hard stop: unsubmitted attempts end here for everyone)" value={ends} onChange={setEnds} minimumDate={starts ?? new Date()} defaultValue={starts ? new Date(starts.getTime() + 24 * 3600 * 1000) : undefined} />
          <Muted style={{ marginTop: spacing.sm }}>Minutes each student gets once they start</Muted>
          {input(dur, setDur, "60", {}, { keyboardType: "number-pad" })}
          <Muted style={{ marginTop: spacing.sm }}>When can students review their answers?</Muted>
          <View style={s.row}>
            <Chip label="After it closes" on={!review} onPress={() => setReview(false)} />
            <Chip label="Right after they submit" on={review} onPress={() => setReview(true)} />
          </View>
          <Muted style={{ marginTop: spacing.md }}>Questions ({picked.size} selected)</Muted>
          <View style={[s.row, { marginTop: spacing.sm }]}>
            <Chip label="Select all" on={false} onPress={() => setPicked(new Set(pool.slice(0, 60).map((q) => q.id)))} />
            <Chip label="Clear" on={false} onPress={() => setPicked(new Set())} />
          </View>
          {pool.map((q) => (
            <PressableScale key={q.id} onPress={() => toggle(q.id)}>
              <Card style={{ borderColor: picked.has(q.id) ? colors.teal : colors.border, backgroundColor: picked.has(q.id) ? colors.tealTint : colors.card }}>
                <Text style={s.muted} numberOfLines={2}>{picked.has(q.id) ? "☑ " : "☐ "}{q.question}</Text>
                {!!q.topic && <Muted>{q.topic}{q.assessment_only ? " · tests & exams only" : ""}</Muted>}
              </Card>
            </PressableScale>
          ))}
          <Btn label={busy ? "Scheduling…" : `Schedule ${kindLabel(kind).toLowerCase()}`} disabled={busy} onPress={create} />
        </>
      )}
    </>
  );
}
```



### `src/components/admin/TeacherLevelsEditor.tsx` (NEW)
```tsx
// src/components/admin/TeacherLevelsEditor.tsx  (NEW)
import React, { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { setTeacherLevels } from "../../lib/adminApi";
import { Chip, Muted } from "../study/ui";

/** Admin picks which levels (years) a teacher may create courses and content for. */
export default function TeacherLevelsEditor({ userId }: { userId: string }) {
  const [levels, setLevels] = useState<number[] | null>(null);
    const [saving, setSaving] = useState(false);
      useEffect(() => {
          supabase.from("profiles").select("teaching_levels").eq("id", userId).maybeSingle()
                .then(({ data }) => setLevels((data?.teaching_levels as number[] | null) ?? []));
                  }, [userId]);
                    const toggle = async (n: number) => {
                        if (levels === null || saving) return;
                            const next = levels.includes(n) ? levels.filter((x) => x !== n) : [...levels, n].sort((a, b) => a - b);
                                setSaving(true);
                                    try { await setTeacherLevels(userId, next); setLevels(next); }
                                        catch (e: any) { Alert.alert("Couldn't save levels", e?.message ?? "Try again."); }
                                            finally { setSaving(false); }
                                              };
                                                return (
                                                    <View style={{ marginTop: 10 }}>
                                                          <Muted>Teaching levels: this teacher can only create courses and upload content for these levels, in their own department.</Muted>
                                                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                                                                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <Chip key={n} label={`L${n}`} on={!!levels?.includes(n)} onPress={() => toggle(n)} />)}
                                                                              </View>
                                                                                  </View>
                                                                                    );
                                                                                    }
                                                                                    ```

                                                                                    (The `types.ts` / `adminApi.ts` / `AdminUsersScreen.tsx` edits that wire it up are in Step 2's first block.)

                                                                                    ## STEP 5: Student side

                                                                                    ### `src/screens/community/CoursesScreen.tsx` (REPLACE WHOLE FILE)
                                                                                    ```tsx
                                                                                    // src/screens/community/CoursesScreen.tsx  (REPLACE WHOLE FILE)
                                                                                    import React, { useCallback, useEffect, useState } from "react";
                                                                                    import { Text, TextInput, Alert, View } from "react-native";
                                                                                    import { colors, spacing } from "../../theme/tokens";
                                                                                    import { Back, Btn, Card, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
                                                                                    import Screen from "../../components/study/Screen";
                                                                                    import { fetchMyCourses, joinCourse, joinSuggestedCourse, fetchSuggestedCourses, fetchCourseContent, MyCourse, SuggestedCourse } from "../../lib/courseApi";
                                                                                    import { importCourseBundle, daysUntil } from "../../lib/studyStore";
                                                                                    import { withoutQuestions } from "../../lib/studyCourseSync";
                                                                                    import StaggerIn from "../../components/animated/StaggerIn";

                                                                                    export default function CoursesScreen({ navigation }: any) {
                                                                                      const [courses, setCourses] = useState<MyCourse[] | null>(null);
                                                                                        const [suggested, setSuggested] = useState<SuggestedCourse[]>([]);
                                                                                          const [code, setCode] = useState("");
                                                                                            const [busy, setBusy] = useState(false);
                                                                                              const [refreshing, setRefreshing] = useState(false);
                                                                                                const [error, setError] = useState<string | null>(null);

                                                                                                  const load = useCallback(async () => {
                                                                                                      try { setCourses(await fetchMyCourses()); setError(null); }
                                                                                                          catch (e: any) { setError(e?.message ?? "Couldn't load your courses."); setCourses((c) => c ?? []); }
                                                                                                              try { setSuggested(await fetchSuggestedCourses()); } catch { setSuggested([]); }
                                                                                                                }, []);
                                                                                                                  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

                                                                                                                    const finishJoin = async (j: { course_id: string; code: string }) => {
                                                                                                                        try { importCourseBundle(withoutQuestions(await fetchCourseContent(j.course_id))); } catch { /* the course screen retries the sync */ }
                                                                                                                            await load();
                                                                                                                                Alert.alert(`Joined ${j.code}`, "Open the course to start with its first topic.", [
                                                                                                                                      { text: "Later", style: "cancel" }, { text: "Open course", onPress: () => navigation.navigate("Course", { courseId: j.course_id }) },
                                                                                                                                          ]);
                                                                                                                                            };
                                                                                                                                              const join = async () => {
                                                                                                                                                  if (!code.trim() || busy) return;
                                                                                                                                                      setBusy(true);
                                                                                                                                                          try { await finishJoin(await joinCourse(code)); setCode(""); }
                                                                                                                                                              catch (e: any) { Alert.alert("Couldn't join", e?.message ?? "Check the code and try again."); }
                                                                                                                                                                  finally { setBusy(false); }
                                                                                                                                                                    };
                                                                                                                                                                      const joinSuggested = async (c: SuggestedCourse) => {
                                                                                                                                                                          if (busy) return;
                                                                                                                                                                              setBusy(true);
                                                                                                                                                                                  try { await finishJoin(await joinSuggestedCourse(c.id)); }
                                                                                                                                                                                      catch (e: any) { Alert.alert("Couldn't join", e?.message ?? "Try again."); }
                                                                                                                                                                                          finally { setBusy(false); }
                                                                                                                                                                                            };

                                                                                                                                                                                              return (
                                                                                                                                                                                                  <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
                                                                                                                                                                                                        <Back onPress={() => navigation.goBack()} />
                                                                                                                                                                                                              <Text style={s.h1}>My courses</Text>

                                                                                                                                                                                                                    {suggested.length > 0 && (
                                                                                                                                                                                                                            <>
                                                                                                                                                                                                                                      <Label>FOR YOUR DEPARTMENT AND LEVEL</Label>
                                                                                                                                                                                                                                                {suggested.map((c) => (
                                                                                                                                                                                                                                                            <Card key={c.id} style={{ marginTop: spacing.sm }}>
                                                                                                                                                                                                                                                                          <Text style={s.h3}>{c.code} · {c.title}</Text>
                                                                                                                                                                                                                                                                                        <Muted>{c.department} · Level {c.level} · {c.teacher_name}</Muted>
                                                                                                                                                                                                                                                                                                      <Btn label={busy ? "Joining…" : "Join this course"} onPress={() => joinSuggested(c)} disabled={busy} />
                                                                                                                                                                                                                                                                                                                  </Card>
                                                                                                                                                                                                                                                                                                                            ))}
                                                                                                                                                                                                                                                                                                                                      <Muted style={{ marginTop: 6 }}>Joining shares your quiz and test results with the teacher as class statistics, and puts you on the course ranking.</Muted>
                                                                                                                                                                                                                                                                                                                                              </>
                                                                                                                                                                                                                                                                                                                                                    )}

                                                                                                                                                                                                                                                                                                                                                          {courses === null && <ListSkeleton />}
                                                                                                                                                                                                                                                                                                                                                                {error && <Muted style={{ marginTop: spacing.sm, color: colors.danger }}>{error}</Muted>}
                                                                                                                                                                                                                                                                                                                                                                      {courses?.length === 0 && !error && suggested.length === 0 && <Muted style={{ marginTop: spacing.sm }}>No courses for your department and level yet. If your teacher gave you a course code, enter it below.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                            {courses?.map((c, i) => (
                                                                                                                                                                                                                                                                                                                                                                                    <StaggerIn key={c.id} index={i}>
                                                                                                                                                                                                                                                                                                                                                                                              <Card onPress={() => navigation.navigate("Course", { courseId: c.id })} style={{ marginTop: spacing.sm }}>
                                                                                                                                                                                                                                                                                                                                                                                                          <Text style={s.h3}>{c.code} · {c.title}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                      <Muted>{c.department}{c.level ? ` · Level ${c.level}` : ""} · {c.teacher_name}</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                  {c.next_exam ? <View style={{ marginTop: 6 }}><Tag label={`Exam in ${Math.max(0, daysUntil(c.next_exam))}d`} color={colors.danger} /></View> : null}
                                                                                                                                                                                                                                                                                                                                                                                                                                            </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                    </StaggerIn>
                                                                                                                                                                                                                                                                                                                                                                                                                                                          ))}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Label>JOIN WITH A CODE</Label>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="Course code from your teacher" placeholderTextColor={colors.textFaint} autoCapitalize="characters" autoCorrect={false} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Btn label={busy ? "Joining…" : "Join course"} onPress={join} disabled={busy || !code.trim()} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                </Screen>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ```

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ### `src/screens/community/CourseDetailScreen.tsx` (REPLACE WHOLE FILE)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ```tsx
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  // src/screens/community/CourseDetailScreen.tsx  (REPLACE WHOLE FILE)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  // Student view of ONE course: Topics (read + practise) · Daily quiz · Tests & exams (locked until finished) · Ranking · News.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import React, { useCallback, useEffect, useState } from "react";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import { View, Text, Alert, ScrollView } from "react-native";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import { colors, spacing, type } from "../../theme/tokens";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import { Back, Bar, Btn, Card, Chip, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import Screen from "../../components/study/Screen";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  import {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    fetchCourseContent, leaveCourse, fetchCourseExams, ExamSummary, fetchCourseProgress, CourseProgress,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      fetchDailyQuiz, DailyQuiz, fetchCourseRanking, CourseRanking,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      } from "../../lib/courseApi";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      import { fmtWhen } from "../../lib/examTime";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      import { CourseBundle, withoutQuestions } from "../../lib/studyCourseSync";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      import { importCourseBundle, detachCourse } from "../../lib/studyStore";

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      type Tab = "Topics" | "Daily quiz" | "Tests & exams" | "Ranking" | "News";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const TABS: Tab[] = ["Topics", "Daily quiz", "Tests & exams", "Ranking", "News"];
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const KIND_LABEL = { practical: "Practical test", test: "Test", exam: "Exam" } as const;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      export default function CourseDetailScreen({ navigation, route }: any) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        const { courseId } = route.params as { courseId: string };
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          const [tab, setTab] = useState<Tab>("Topics");
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            const [bundle, setBundle] = useState<CourseBundle | null>(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              const [progress, setProgress] = useState<CourseProgress | null>(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const [timed, setTimed] = useState<ExamSummary[]>([]);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const [daily, setDaily] = useState<DailyQuiz | null>(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    const [rank, setRank] = useState<CourseRanking | null>(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const [error, setError] = useState<string | null>(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        const [refreshing, setRefreshing] = useState(false);

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          const load = useCallback(async () => {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              try {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    const b = await fetchCourseContent(courseId);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          setBundle(b);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                importCourseBundle(withoutQuestions(b)); // keeps the planner / exam dates in sync; answer keys never go on the phone (idempotent)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      setProgress(await fetchCourseProgress(courseId));
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            setError(null);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                } catch (e: any) { setError(e?.message ?? "Couldn't load this course."); }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    fetchCourseExams(courseId).then(setTimed).catch(() => setTimed([]));
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        fetchDailyQuiz(courseId).then(setDaily).catch(() => setDaily(null));
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            fetchCourseRanking(courseId).then(setRank).catch(() => setRank(null));
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              }, [courseId]);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const leave = () =>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      Alert.alert("Leave this course?", "You keep what you've already studied, but stop receiving updates, and you leave the ranking.", [
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            { text: "Stay", style: "cancel" },
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  { text: "Leave", style: "destructive", onPress: async () => { try { await leaveCourse(courseId); detachCourse(courseId); navigation.goBack(); } catch (e: any) { Alert.alert("Couldn't leave", e?.message ?? "Try again."); } } },
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ]);

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if (error && !bundle) return <Screen><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Course unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></Screen>;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          if (!bundle || !progress) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            const left = progress.topic_count - progress.completed_count;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              const generalCount = bundle.materials.filter((m) => !m.topic_id).length;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const news = bundle.events.filter((e) => e.kind === "announcement");
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const askGuide = () => navigation.navigate("Companion", { course: { id: courseId, code: bundle.course.code, title: bundle.course.title } });

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <Back onPress={() => navigation.goBack()} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <Text style={s.h1}>{bundle.course.code}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          <Muted>{bundle.course.title}{bundle.course.level ? ` · Level ${bundle.course.level}` : ""}</Muted>

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <Card style={{ marginTop: spacing.lg, backgroundColor: colors.tealTint, borderWidth: 0 }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Text style={s.h3}>{progress.topic_count === 0 ? "No topics yet" : progress.course_complete ? "🎓 Course finished. Tests and exams are unlocked." : `${progress.completed_count} of ${progress.topic_count} topics finished`}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {progress.topic_count > 0 && <View style={{ marginTop: 8 }}><Bar value={progress.completed_count / progress.topic_count} /></View>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Btn ghost label="💬 Ask my AI study guide" onPress={askGuide} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              </Card>

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.lg, flexGrow: 0 }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <View style={s.row}>{TABS.map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}</View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  </ScrollView>

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        {tab === "Topics" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          {progress.topics.length === 0 && <Muted>Your teacher hasn't added topics yet. Pull down to refresh later.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {progress.topics.map((t, i) => {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const reading = t.materials_viewed > 0 && !t.completed;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            const label = t.completed ? "Finished ✓" : reading ? `Reading ${t.materials_viewed}/${t.materials_total}` : "Not started";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        const color = t.completed ? colors.success : reading ? colors.ember : colors.textFaint;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <Card key={t.id} onPress={() => navigation.navigate("CourseTopic", { courseId, topicId: t.id })}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <Text style={[s.h3, { flex: 1 }]}>{i + 1}. {t.title}</Text><Tag label={label} color={color} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    </View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <Muted>{t.materials_total} resource{t.materials_total === 1 ? "" : "s"} · {t.question_count} practice question{t.question_count === 1 ? "" : "s"}</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        })}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  {generalCount > 0 && <Card onPress={() => navigation.navigate("CourseTopic", { courseId, topicId: null })}><Text style={s.h3}>General resources</Text><Muted>{generalCount} item{generalCount === 1 ? "" : "s"} for the whole course</Muted></Card>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {tab === "Daily quiz" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <Text style={s.h3}>Today's quiz for {bundle.course.code}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  {daily?.status === "ready" && <><Muted>{daily.questions.length} questions picked from the topics you've started. Your first score today counts toward the course ranking.</Muted><Btn label="Start today's quiz" onPress={() => navigation.navigate("CourseDaily", { courseId, code: bundle.course.code, title: bundle.course.title })} /></>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {daily?.status === "done" && <Muted>Done today: {daily.correct}/{daily.total}. A new quiz arrives tomorrow. Practise any topic in the meantime.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {daily?.status === "locked" && <Muted>Open a topic and start reading. Your daily quiz is built from the topics you've started, and your teacher needs to have added questions for them.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {daily === null && <Muted>Couldn't load today's quiz. Pull down to retry.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {tab === "Tests & exams" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {!progress.course_complete && progress.topic_count > 0 && <Card style={{ borderColor: colors.ember }}><Text style={s.h3}>🔒 Finish the course to unlock</Text><Muted>{left} topic{left === 1 ? "" : "s"} left. Tests, exams and practicals for the whole course open once every topic is finished.</Muted></Card>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {timed.length === 0 && <Muted>Nothing scheduled yet.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          {timed.map((x) => {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const a = x.my_attempt;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const done = !!a?.submitted;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              const locked = !!x.locked && !a;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          const label = done ? "Submitted" : locked ? "Locked" : x.status === "open" ? (a ? "Resume" : "Start") : x.status === "upcoming" ? "Upcoming" : "Closed";
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const tone = done ? colors.success : locked ? colors.ember : x.status === "open" ? colors.danger : colors.violet;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const canReview = x.status === "closed" || (x.review_after_submit && done);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Card key={x.id}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}><Text style={[s.h3, { flex: 1 }]}>{x.title}</Text><Tag label={label} color={tone} /></View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Muted>{KIND_LABEL[x.kind]} · {x.question_count} questions · {x.duration_minutes} min · one attempt</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Muted>Opens {fmtWhen(x.starts_at)} · closes {fmtWhen(x.ends_at)}</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {locked && <Muted style={{ color: colors.ember }}>{x.topic_id ? "Finish its topic to unlock." : `Finish all topics to unlock (${left} left).`}</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {done && a?.total ? <Muted>Your score: {a.correct}/{a.total}</Muted> : null}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {x.status === "open" && !done && !locked && <Btn label={a ? "Resume" : `Start ${KIND_LABEL[x.kind].toLowerCase()}`} onPress={() => Alert.alert(a ? "Resume?" : "Start now?", a ? "Your clock is already running." : `You'll have ${x.duration_minutes} minutes and one attempt. Your first score counts for ranking. The clock starts now.`, [{ text: "Not now", style: "cancel" }, { text: a ? "Resume" : "Start", onPress: () => navigation.navigate("Exam", { examId: x.id }) }])} />}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            {canReview && <Btn ghost label="Review answers" onPress={() => navigation.navigate("Exam", { examId: x.id, mode: "review" })} />}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                })}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {tab === "Ranking" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      <Muted>Ranked by your FIRST scores only: each test, exam or practical (up to 100 points each) plus each day's quiz (5 points per correct answer). Retakes and extra practice don't change your rank.</Muted>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                {rank?.me && <Card style={{ marginTop: spacing.md, backgroundColor: colors.tealTint, borderWidth: 0 }}><Text style={s.h2}>#{rank.me.rnk} of {rank.size}</Text><Muted>{rank.me.points} points · {rank.me.assessments} test{rank.me.assessments === 1 ? "" : "s"} · {rank.me.dailies} daily quiz{rank.me.dailies === 1 ? "" : "zes"}</Muted></Card>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          {rank?.top.map((r) => (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      <Card key={`${r.rnk}-${r.name}`} style={r.is_me ? { borderColor: colors.teal } : undefined}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <Text style={[type.bodyMedium, { flexShrink: 1 }]}>{r.rnk}. {r.name}{r.is_me ? " (you)" : ""}</Text><Text style={s.h3}>{r.points}</Text>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  </View>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              </Card>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  {rank === null && <Muted style={{ marginTop: spacing.md }}>Couldn't load the ranking. Pull down to retry.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      {tab === "News" && (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              <>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        {news.length === 0 && <Muted>Nothing yet.</Muted>}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  {news.map((n) => <Card key={n.id}><Text style={s.h3}>{n.title}</Text>{!!n.body && <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{n.body}</Text>}</Card>)}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                )}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      <Btn ghost label="Leave course" onPress={leave} />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          </Screen>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ```

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ### `src/screens/community/CourseDetailScreen.tsx` (REPLACE WHOLE FILE)
```tsx
// src/screens/community/CourseDetailScreen.tsx  (REPLACE WHOLE FILE)
// Student view of ONE course: Topics (read + practise) · Daily quiz · Tests & exams (locked until finished) · Ranking · News.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Alert, ScrollView } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import { Back, Bar, Btn, Card, Chip, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import {
  fetchCourseContent, leaveCourse, fetchCourseExams, ExamSummary, fetchCourseProgress, CourseProgress,
  fetchDailyQuiz, DailyQuiz, fetchCourseRanking, CourseRanking,
} from "../../lib/courseApi";
import { fmtWhen } from "../../lib/examTime";
import { CourseBundle, withoutQuestions } from "../../lib/studyCourseSync";
import { importCourseBundle, detachCourse } from "../../lib/studyStore";

type Tab = "Topics" | "Daily quiz" | "Tests & exams" | "Ranking" | "News";
const TABS: Tab[] = ["Topics", "Daily quiz", "Tests & exams", "Ranking", "News"];
const KIND_LABEL = { practical: "Practical test", test: "Test", exam: "Exam" } as const;

export default function CourseDetailScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const [tab, setTab] = useState<Tab>("Topics");
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [timed, setTimed] = useState<ExamSummary[]>([]);
  const [daily, setDaily] = useState<DailyQuiz | null>(null);
  const [rank, setRank] = useState<CourseRanking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await fetchCourseContent(courseId);
      setBundle(b);
      importCourseBundle(withoutQuestions(b)); // keeps the planner / exam dates in sync; answer keys never go on the phone (idempotent)
      setProgress(await fetchCourseProgress(courseId));
      setError(null);
    } catch (e: any) { setError(e?.message ?? "Couldn't load this course."); }
    fetchCourseExams(courseId).then(setTimed).catch(() => setTimed([]));
    fetchDailyQuiz(courseId).then(setDaily).catch(() => setDaily(null));
    fetchCourseRanking(courseId).then(setRank).catch(() => setRank(null));
  }, [courseId]);
  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

  const leave = () =>
    Alert.alert("Leave this course?", "You keep what you've already studied, but stop receiving updates, and you leave the ranking.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => { try { await leaveCourse(courseId); detachCourse(courseId); navigation.goBack(); } catch (e: any) { Alert.alert("Couldn't leave", e?.message ?? "Try again."); } } },
    ]);

  if (error && !bundle) return <Screen><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Course unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></Screen>;
  if (!bundle || !progress) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;

  const left = progress.topic_count - progress.completed_count;
  const generalCount = bundle.materials.filter((m) => !m.topic_id).length;
  const news = bundle.events.filter((e) => e.kind === "announcement");
  const askGuide = () => navigation.navigate("Companion", { course: { id: courseId, code: bundle.course.code, title: bundle.course.title } });

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <Back onPress={() => navigation.goBack()} />
      <Text style={s.h1}>{bundle.course.code}</Text>
      <Muted>{bundle.course.title}{bundle.course.level ? ` · Level ${bundle.course.level}` : ""}</Muted>

      <Card style={{ marginTop: spacing.lg, backgroundColor: colors.tealTint, borderWidth: 0 }}>
        <Text style={s.h3}>{progress.topic_count === 0 ? "No topics yet" : progress.course_complete ? "🎓 Course finished. Tests and exams are unlocked." : `${progress.completed_count} of ${progress.topic_count} topics finished`}</Text>
        {progress.topic_count > 0 && <View style={{ marginTop: 8 }}><Bar value={progress.completed_count / progress.topic_count} /></View>}
        <Btn ghost label="💬 Ask my AI study guide" onPress={askGuide} />
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.lg, flexGrow: 0 }}>
        <View style={s.row}>{TABS.map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}</View>
      </ScrollView>

      {tab === "Topics" && (
        <>
          {progress.topics.length === 0 && <Muted>Your teacher hasn't added topics yet. Pull down to refresh later.</Muted>}
          {progress.topics.map((t, i) => {
            const reading = t.materials_viewed > 0 && !t.completed;
            const label = t.completed ? "Finished ✓" : reading ? `Reading ${t.materials_viewed}/${t.materials_total}` : "Not started";
            const color = t.completed ? colors.success : reading ? colors.ember : colors.textFaint;
            return (
              <Card key={t.id} onPress={() => navigation.navigate("CourseTopic", { courseId, topicId: t.id })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={[s.h3, { flex: 1 }]}>{i + 1}. {t.title}</Text><Tag label={label} color={color} />
                </View>
                <Muted>{t.materials_total} resource{t.materials_total === 1 ? "" : "s"} · {t.question_count} practice question{t.question_count === 1 ? "" : "s"}</Muted>
              </Card>
            );
          })}
          {generalCount > 0 && <Card onPress={() => navigation.navigate("CourseTopic", { courseId, topicId: null })}><Text style={s.h3}>General resources</Text><Muted>{generalCount} item{generalCount === 1 ? "" : "s"} for the whole course</Muted></Card>}
        </>
      )}

      {tab === "Daily quiz" && (
        <Card>
          <Text style={s.h3}>Today's quiz for {bundle.course.code}</Text>
          {daily?.status === "ready" && <><Muted>{daily.questions.length} questions picked from the topics you've started. Your first score today counts toward the course ranking.</Muted><Btn label="Start today's quiz" onPress={() => navigation.navigate("CourseDaily", { courseId, code: bundle.course.code, title: bundle.course.title })} /></>}
          {daily?.status === "done" && <Muted>Done today: {daily.correct}/{daily.total}. A new quiz arrives tomorrow. Practise any topic in the meantime.</Muted>}
          {daily?.status === "locked" && <Muted>Open a topic and start reading. Your daily quiz is built from the topics you've started, and your teacher needs to have added questions for them.</Muted>}
          {daily === null && <Muted>Couldn't load today's quiz. Pull down to retry.</Muted>}
        </Card>
      )}

      {tab === "Tests & exams" && (
        <>
          {!progress.course_complete && progress.topic_count > 0 && <Card style={{ borderColor: colors.ember }}><Text style={s.h3}>🔒 Finish the course to unlock</Text><Muted>{left} topic{left === 1 ? "" : "s"} left. Tests, exams and practicals for the whole course open once every topic is finished.</Muted></Card>}
          {timed.length === 0 && <Muted>Nothing scheduled yet.</Muted>}
          {timed.map((x) => {
            const a = x.my_attempt;
            const done = !!a?.submitted;
            const locked = !!x.locked && !a;
            const label = done ? "Submitted" : locked ? "Locked" : x.status === "open" ? (a ? "Resume" : "Start") : x.status === "upcoming" ? "Upcoming" : "Closed";
            const tone = done ? colors.success : locked ? colors.ember : x.status === "open" ? colors.danger : colors.violet;
            const canReview = x.status === "closed" || (x.review_after_submit && done);
            return (
              <Card key={x.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}><Text style={[s.h3, { flex: 1 }]}>{x.title}</Text><Tag label={label} color={tone} /></View>
                <Muted>{KIND_LABEL[x.kind]} · {x.question_count} questions · {x.duration_minutes} min · one attempt</Muted>
                <Muted>Opens {fmtWhen(x.starts_at)} · closes {fmtWhen(x.ends_at)}</Muted>
                {locked && <Muted style={{ color: colors.ember }}>{x.topic_id ? "Finish its topic to unlock." : `Finish all topics to unlock (${left} left).`}</Muted>}
                {done && a?.total ? <Muted>Your score: {a.correct}/{a.total}</Muted> : null}
                {x.status === "open" && !done && !locked && <Btn label={a ? "Resume" : `Start ${KIND_LABEL[x.kind].toLowerCase()}`} onPress={() => Alert.alert(a ? "Resume?" : "Start now?", a ? "Your clock is already running." : `You'll have ${x.duration_minutes} minutes and one attempt. Your first score counts for ranking. The clock starts now.`, [{ text: "Not now", style: "cancel" }, { text: a ? "Resume" : "Start", onPress: () => navigation.navigate("Exam", { examId: x.id }) }])} />}
                {canReview && <Btn ghost label="Review answers" onPress={() => navigation.navigate("Exam", { examId: x.id, mode: "review" })} />}
              </Card>
            );
          })}
        </>
      )}

      {tab === "Ranking" && (
        <>
          <Muted>Ranked by your FIRST scores only: each test, exam or practical (up to 100 points each) plus each day's quiz (5 points per correct answer). Retakes and extra practice don't change your rank.</Muted>
          {rank?.me && <Card style={{ marginTop: spacing.md, backgroundColor: colors.tealTint, borderWidth: 0 }}><Text style={s.h2}>#{rank.me.rnk} of {rank.size}</Text><Muted>{rank.me.points} points · {rank.me.assessments} test{rank.me.assessments === 1 ? "" : "s"} · {rank.me.dailies} daily quiz{rank.me.dailies === 1 ? "" : "zes"}</Muted></Card>}
          {rank?.top.map((r) => (
            <Card key={`${r.rnk}-${r.name}`} style={r.is_me ? { borderColor: colors.teal } : undefined}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={[type.bodyMedium, { flexShrink: 1 }]}>{r.rnk}. {r.name}{r.is_me ? " (you)" : ""}</Text><Text style={s.h3}>{r.points}</Text>
              </View>
            </Card>
          ))}
          {rank === null && <Muted style={{ marginTop: spacing.md }}>Couldn't load the ranking. Pull down to retry.</Muted>}
        </>
      )}

      {tab === "News" && (
        <>
          {news.length === 0 && <Muted>Nothing yet.</Muted>}
          {news.map((n) => <Card key={n.id}><Text style={s.h3}>{n.title}</Text>{!!n.body && <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{n.body}</Text>}</Card>)}
        </>
      )}

      <Btn ghost label="Leave course" onPress={leave} />
    </Screen>
  );
}
```


                                                                                                                                                                                                                                                           ### `src/screens/community/CourseTopicScreen.tsx` (NEW)
```tsx
// src/screens/community/CourseTopicScreen.tsx  (NEW) — one topic: read the teacher's resources, finish the topic, practise, ask the AI guide.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Alert, Linking } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import { Back, Bar, Btn, Card, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import {
  fetchCourseContent, fetchCourseProgress, CourseProgress, recordMaterialView, markTopicComplete, materialFileUrl,
} from "../../lib/courseApi";
import { fmtSize } from "../../lib/fileRules";
import { CourseBundle } from "../../lib/studyCourseSync";

const ICON = { note: "📝", link: "🔗", video: "🎬", file: "📎" } as const;

export default function CourseTopicScreen({ navigation, route }: any) {
  const { courseId, topicId } = route.params as { courseId: string; topicId: string | null };
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [b, p] = await Promise.all([fetchCourseContent(courseId), fetchCourseProgress(courseId)]); setBundle(b); setProgress(p); setError(null); }
    catch (e: any) { setError(e?.message ?? "Couldn't load this topic."); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  if (error && !bundle) return <Screen><Back onPress={() => navigation.goBack()} /><Muted>{error}</Muted></Screen>;
  if (!bundle || !progress) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;

  const topic = topicId ? progress.topics.find((t) => t.id === topicId) : undefined;
  const title = topicId ? topic?.title ?? "Topic" : "General resources";
  const materials = bundle.materials.filter((m) => (m.topic_id ?? null) === topicId);
  const viewed = new Set(progress.viewed_ids);
  const allViewed = materials.every((m) => viewed.has(m.id));
  const idx = topicId ? progress.topics.findIndex((t) => t.id === topicId) : -1;
  const next = idx >= 0 ? progress.topics[idx + 1] : undefined;
  const notesText = materials.filter((m) => m.kind === "note").map((m) => `${m.title}: ${m.body}`).join("\n").slice(0, 3000);

  const markViewed = async (id: string) => {
    if (viewed.has(id)) return;
    try { await recordMaterialView(id); setProgress(await fetchCourseProgress(courseId)); } catch { /* retried on the next open */ }
  };
  const open = async (m: CourseBundle["materials"][number]) => {
    try {
      if (m.kind === "note") { setOpenNote(openNote === m.id ? null : m.id); await markViewed(m.id); return; }
      const url = m.kind === "file" ? await materialFileUrl(m.body) : m.body;
      await Linking.openURL(url);
      await markViewed(m.id);
    } catch (e: any) { Alert.alert("Couldn't open it", e?.message ?? "Check your connection and try again."); }
  };
  const finish = async () => {
    if (!topicId || busy) return;
    setBusy(true);
    try {
      const p = await markTopicComplete(topicId); setProgress(p);
      Alert.alert("Topic finished 🎉", p.course_complete ? "That was the last topic. Tests and exams are now unlocked." : "Try the practice questions while it's fresh.", [
        { text: "Later", style: "cancel" }, { text: "Practise now", onPress: practise },
      ]);
    } catch (e: any) { Alert.alert("Not yet", e?.message ?? "Try again."); } finally { setBusy(false); }
  };
  // Practice is checked on the server (needs a connection); there is nothing to import onto the phone.
  const practise = () => navigation.navigate("CoursePractice", { courseId, topicId, title, code: bundle.course.code });
  const askGuide = () => navigation.navigate("Companion", { course: { id: courseId, code: bundle.course.code, title: bundle.course.title, topic: topicId ? title : undefined, notes: notesText } });

  return (
    <Screen>
      <Back onPress={() => navigation.goBack()} />
      <Text style={s.h1}>{title}</Text>
      <Muted>{bundle.course.code} · {materials.length} resource{materials.length === 1 ? "" : "s"}</Muted>
      {materials.length > 0 && <View style={{ marginTop: spacing.sm }}><Bar value={materials.filter((m) => viewed.has(m.id)).length / materials.length} /></View>}

      <Label>READ AND WATCH</Label>
      {materials.length === 0 && <Muted>Nothing has been uploaded for this topic yet.</Muted>}
      {materials.map((m) => (
        <Card key={m.id} onPress={() => open(m)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={[s.h3, { flex: 1 }]}>{ICON[m.kind]} {m.title}</Text>
            <Tag label={viewed.has(m.id) ? "Opened ✓" : "New"} color={viewed.has(m.id) ? colors.success : colors.teal} />
          </View>
          <Muted>{m.kind === "file" ? `${m.file_name ?? "file"}${m.file_size ? ` · ${fmtSize(m.file_size)}` : ""} · tap to open` : m.kind === "note" ? (openNote === m.id ? "tap to collapse" : "tap to read") : "tap to open"}</Muted>
          {m.kind === "note" && openNote === m.id && <Text style={[type.body, { color: colors.text, marginTop: spacing.sm }]}>{m.body}</Text>}
        </Card>
      ))}

      {topicId && (
        <>
          <Btn label={topic?.completed ? "Finished ✓" : allViewed ? "I've finished this topic" : "Open every resource to finish"} onPress={finish} disabled={busy || !!topic?.completed || !allViewed} />
          {!allViewed && <Muted>Finishing unlocks the next steps and counts toward unlocking tests and exams.</Muted>}
        </>
      )}
      <Btn ghost label="🎯 Practise this topic" onPress={practise} />
      <Btn ghost label="💬 Ask my AI study guide" onPress={askGuide} />
      {topic?.completed && next && <Btn ghost label={`Next: ${next.title} →`} onPress={() => navigation.replace("CourseTopic", { courseId, topicId: next.id })} />}
    </Screen>
  );
}
```

### `src/screens/community/CourseDailyQuizScreen.tsx` (NEW)
```tsx
// src/screens/community/CourseDailyQuizScreen.tsx  (NEW) — today's quiz for ONE course. First score of the day counts for ranking.
import React, { useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Bar, Btn, Card, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import { fetchDailyQuiz, submitDailyQuiz, DailyQuiz, DailyResult } from "../../lib/courseApi";

const LETTERS = ["A", "B", "C", "D"];

export default function CourseDailyQuizScreen({ navigation, route }: any) {
  const { courseId, code = "", title = "" } = route.params as { courseId: string; code?: string; title?: string };
  const [quiz, setQuiz] = useState<DailyQuiz | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<DailyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDailyQuiz(courseId)
      .then((q) => { setQuiz(q); if (q.status === "ready") setAnswers(q.questions.map(() => null)); })
      .catch((e) => setError(e?.message ?? "Couldn't load today's quiz."));
  }, [courseId]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try { setResult(await submitDailyQuiz(courseId, answers)); }
    catch (e: any) { Alert.alert("Couldn't submit", e?.message ?? "Check your connection and try again."); }
    finally { setBusy(false); }
  };

  if (error) return <Screen><Back onPress={() => navigation.goBack()} /><Muted>{error}</Muted></Screen>;
  if (!quiz) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;
  if (quiz.status !== "ready") {
    return (
      <Screen><Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Daily quiz</Text>
        <Muted style={{ marginTop: 8 }}>{quiz.status === "done" ? `You already finished today's quiz: ${quiz.correct}/${quiz.total}. Come back tomorrow.` : "Open a topic and start reading first. Your daily quiz is built from the topics you've started."}</Muted>
        <Btn label="Back to course" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <Text style={s.h1}>{result.correct}/{result.total} correct</Text>
        <Muted>+{result.correct * 5} ranking points. This was your scored attempt for today.</Muted>
        <Label>REVIEW</Label>
        {result.review.map((r, i) => (
          <Card key={i}>
            <Text style={s.h3}>{i + 1}. {r.q}</Text>
            {r.options.map((o, k) => (
              <Text key={k} style={[type.body, { marginTop: 2, color: k === r.correct ? colors.success : k === r.picked ? colors.danger : colors.text }]}>
                {LETTERS[k]}. {o}{k === r.correct ? "  ✓" : k === r.picked ? "  ✗ your answer" : ""}
              </Text>
            ))}
            {!!r.explanation && <Muted style={{ marginTop: 6 }}>{r.explanation}</Muted>}
            {r.picked !== r.correct && <Btn ghost label="💬 Explain this" onPress={() => navigation.navigate("Companion", { course: { id: courseId, code, title }, prompt: `Explain why the answer is "${r.options[r.correct]}" for: ${r.q}` })} />}
          </Card>
        ))}
        <Btn label="Done" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const q = quiz.questions[idx];
  const last = idx === quiz.questions.length - 1;
  return (
    <Screen>
      <Back onPress={() => Alert.alert("Leave the quiz?", "Your answers are not saved. You can come back and finish it today.", [{ text: "Stay", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => navigation.goBack() }])} label="← Leave" />
      <Muted>Question {idx + 1} of {quiz.questions.length}</Muted>
      <View style={{ marginVertical: spacing.sm }}><Bar value={(idx + 1) / quiz.questions.length} /></View>
      {!!q.topic && <Tag label={q.topic} color={colors.teal} />}
      <Text style={[s.h2, { marginTop: spacing.md }]}>{q.q}</Text>
      {q.options.map((o, k) => (
        <PressableScale key={k} onPress={() => setAnswers((a) => a.map((x, i) => (i === idx ? k : x)))}>
          <Card style={{ borderColor: answers[idx] === k ? colors.teal : colors.border, backgroundColor: answers[idx] === k ? colors.tealTint : colors.card }}>
            <Text style={type.bodyMedium}>{LETTERS[k]}. {o}</Text>
          </Card>
        </PressableScale>
      ))}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {idx > 0 && <View style={{ flex: 1 }}><Btn ghost label="Back" onPress={() => setIdx(idx - 1)} /></View>}
        <View style={{ flex: 1 }}>
          {last ? <Btn label={busy ? "Submitting…" : "Submit"} onPress={() => (answers.some((a) => a === null) ? Alert.alert("Unanswered questions", "Submit anyway? Skipped questions count as wrong.", [{ text: "Keep going", style: "cancel" }, { text: "Submit", onPress: submit }]) : submit())} disabled={busy} />
                 : <Btn label="Next" onPress={() => setIdx(idx + 1)} disabled={answers[idx] === null} />}
        </View>
      </View>
    </Screen>
  );
}
```




   ### `src/screens/community/CoursePracticeScreen.tsx` (NEW)
```tsx
// src/screens/community/CoursePracticeScreen.tsx  (NEW) — topic practice, checked on the SERVER.
// The phone never holds the answer key: each answer is sent to the server, which replies with the right answer and explanation for that question only.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Bar, Btn, Card, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import Screen from "../../components/study/Screen";
import { fetchPracticeSet, checkPracticeAnswer, PracticeQ, PracticeCheck } from "../../lib/courseApi";

const LETTERS = ["A", "B", "C", "D"];

export default function CoursePracticeScreen({ navigation, route }: any) {
  const { courseId, topicId, title, code = "" } = route.params as { courseId: string; topicId: string | null; title: string; code?: string };
  const [qs, setQs] = useState<PracticeQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [fb, setFb] = useState<PracticeCheck | null>(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setQs(null); setIdx(0); setPicked(null); setFb(null); setScore(0); setError(null);
    try { setQs(await fetchPracticeSet(courseId, topicId, 10)); }
    catch (e: any) { setError(e?.message ?? "Couldn't load practice questions. Check your connection."); }
  }, [courseId, topicId]);
  useEffect(() => { start(); }, [start]);

  const choose = async (k: number) => {
    if (!qs || picked !== null || busy) return;
    setPicked(k); setBusy(true);
    try { const r = await checkPracticeAnswer(qs[idx].id, k); setFb(r); if (r.was_correct) setScore((x) => x + 1); }
    catch (e: any) { setPicked(null); Alert.alert("Couldn't check that answer", e?.message ?? "Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const next = () => { setIdx((i) => i + 1); setPicked(null); setFb(null); };
  const guide = (extra?: string) => navigation.navigate("Companion", { course: { id: courseId, code, title: "", topic: title }, prompt: extra });

  if (error) return <Screen><Back onPress={() => navigation.goBack()} /><Muted>{error}</Muted><Btn label="Try again" onPress={start} /></Screen>;
  if (!qs) return <Screen><Back onPress={() => navigation.goBack()} /><ListSkeleton /></Screen>;
  if (qs.length === 0) return <Screen><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Practice</Text><Muted style={{ marginTop: 8 }}>Your teacher hasn't added practice questions for this topic yet.</Muted></Screen>;

  if (idx >= qs.length) {
    return (
      <Screen>
        <Text style={s.h1}>{score}/{qs.length} correct</Text>
        <Muted>{title}. Practice doesn't change your ranking, so try as often as you like.</Muted>
        <Btn label="Practise again (new set)" onPress={start} />
        <Btn ghost label="💬 Ask my study guide about this topic" onPress={() => guide()} />
        <Btn ghost label="Back to topic" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const q = qs[idx];
  const color = (k: number) => (!fb ? (picked === k ? colors.teal : colors.border) : k === fb.correct ? colors.success : k === picked ? colors.danger : colors.border);
  return (
    <Screen>
      <Back onPress={() => navigation.goBack()} label="← Stop" />
      <Muted>{title} · question {idx + 1} of {qs.length}</Muted>
      <View style={{ marginVertical: spacing.sm }}><Bar value={(idx + (fb ? 1 : 0)) / qs.length} /></View>
      <Text style={[s.h2, { marginTop: spacing.sm }]}>{q.q}</Text>
      {q.options.map((o, k) => (
        <PressableScale key={k} onPress={() => choose(k)} disabled={picked !== null}>
          <Card style={{ borderColor: color(k), backgroundColor: fb && k === fb.correct ? colors.success + "18" : colors.card }}>
            <Text style={type.bodyMedium}>{LETTERS[k]}. {o}</Text>
          </Card>
        </PressableScale>
      ))}
      {fb && (
        <Card style={{ marginTop: spacing.sm }}>
          <Tag label={fb.was_correct ? "Correct" : "Not quite"} color={fb.was_correct ? colors.success : colors.danger} />
          {!!fb.explanation && <Text style={[type.body, { color: colors.text, marginTop: spacing.sm }]}>{fb.explanation}</Text>}
          {!fb.was_correct && <Btn ghost label="💬 Explain this to me" onPress={() => guide(`Explain why the answer is "${q.options[fb.correct]}" for: ${q.q}`)} />}
        </Card>
      )}
      {fb && <Btn label={idx === qs.length - 1 ? "See result" : "Next question"} onPress={next} />}
    </Screen>
  );
}
```

`ExamScreen.tsx` needs **no change**: practicals, tests and exams all use the same server-timed flow; the new lock and review rules are enforced by the database functions and surfaced by `CourseDetailScreen`.

## STEP 6: Navigation
```ts
// src/navigation/RootNavigator.tsx — EDITS

// 1) Imports: ADD
import TeacherTopicScreen from "../screens/teacher/TeacherTopicScreen";
import CourseTopicScreen from "../screens/community/CourseTopicScreen";
import CourseDailyQuizScreen from "../screens/community/CourseDailyQuizScreen";
import CoursePracticeScreen from "../screens/community/CoursePracticeScreen";
//    and REMOVE this import (the file stays on disk, just unused):
//    import TeacherQuestionsScreen from "../screens/teacher/TeacherQuestionsScreen";

// 2) RootStackParamList: REPLACE `Companion: ...` and ADD three lines.
  Companion: { prompt?: string; course?: { id: string; code: string; title: string; topic?: string; notes?: string } } | undefined;
  CourseTopic: { courseId: string; topicId: string | null };
  CourseDaily: { courseId: string; code?: string; title?: string };
  TeacherTopic: { courseId: string; topicId: string | null; title: string };
  CoursePractice: { courseId: string; topicId: string | null; title: string; code?: string };

// 3) TeacherTabParamList: REMOVE the `TeacherQuestions: undefined;` line so it reads:
export type TeacherTabParamList = {
  TeacherDashboard: undefined;
  TeacherCourses: undefined;
  Profile: undefined;
};

// 4) TeacherTabs(): in iconMap REMOVE `TeacherQuestions: "create",` and REMOVE the line
//    <TeacherTab.Screen name="TeacherQuestions" component={TeacherQuestionsScreen} options={{ title: "Daily quiz" }} />
//    and make the Courses tab clearer:
<TeacherTab.Screen name="TeacherCourses" component={TeacherCoursesScreen} options={{ title: "Courses & content" }} />

// 5) Root Stack: add TeacherTopic next to TeacherCourse in BOTH the admin and the teacher branch:
<Stack.Screen name="TeacherCourse" component={TeacherCourseScreen} />
<Stack.Screen name="TeacherTopic" component={TeacherTopicScreen} />

// 6) Root Stack, student branch: add these three next to <Stack.Screen name="Course" .../>
<Stack.Screen name="CourseTopic" component={CourseTopicScreen} />
<Stack.Screen name="CourseDaily" component={CourseDailyQuizScreen} options={{ animation: "fade_from_bottom", gestureEnabled: false }} />
<Stack.Screen name="CoursePractice" component={CoursePracticeScreen} options={{ animation: "fade_from_bottom" }} />
```

## STEP 7: AI study guide
```ts
// src/screens/CompanionScreen.tsx — EDITS

// (a) Near the top of the component, after `const { data } = useStudy();` add:
const course = route?.params?.course as { id: string; code: string; title: string; topic?: string; notes?: string } | undefined;

// (b) Add this effect next to the existing `route?.params?.prompt` effect. It greets the student once per course/topic:
useEffect(() => {
  if (!course) return;
  reply(`I'm your study guide for ${course.code}${course.topic ? `, topic "${course.topic}"` : ""}. Ask me to explain an idea, give an example, quiz you, or help you plan what to read next. I won't give answers to tests or exams, but I'll happily explain the concepts behind them.`);
}, [course?.id, course?.topic]);

// (c) In `send`, REPLACE the `const context = { ... }` object by the same object plus a `course` entry:
const context = {
  subjects: data.subjects.map((s) => ({ name: s.name, examInDays: s.examDate ? daysUntil(s.examDate) : null })),
  weak: subjectStats(data).filter((s) => s.label === "Needs review").map((s) => s.name),
  weakTopics: topicStats(data).filter((t) => t.label === "Needs review").map((t) => `${t.name} (${t.accuracy}%)`),
  dueForReview: dueTopics(data).map((t) => t.name),
  dailyStudyMinutes: data.prefs.dailyMinutes,
  course: course ? { code: course.code, title: course.title, topic: course.topic, notes: (course.notes ?? "").slice(0, 3000) } : undefined,
};
```

```ts
// supabase/functions/study-companion/index.ts — EDIT the plain chat branch (the code after the `task === "questions"` block).
// REPLACE the `const res = await fetch(...)` body so that `system` and `max_tokens` read as below. Nothing else in the file changes.
const course = context?.course;
const guide = course
  ? `\nYou are this student's study guide for the course ${String(course.code ?? "").slice(0, 20)} ${String(course.title ?? "").slice(0, 120)}${course.topic ? `, topic "${String(course.topic).slice(0, 80)}"` : ""}. ` +
    `Teach from the teacher's notes below. Explain simply with one short example, then ask ONE quick check question. ` +
    `Guide with hints and steps instead of handing over final answers to graded work. Never help cheat on a test, exam or practical: if asked for answers to one, decline and offer to explain the underlying concept instead. ` +
    `Keep replies under 150 words.\nTeacher notes:\n${String(course.notes ?? "").slice(0, 3000)}`
  : "";
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({
    model: "claude-sonnet-5-5", max_tokens: 700,
    system: `${SYSTEM}\nStudent context: ${JSON.stringify({ ...(context ?? {}), course: undefined }).slice(0, 1500)}${guide}`,
    messages: clean,
  }),
});
// Then redeploy:  supabase functions deploy study-companion
```

The student reaches the guide from three places: the **Ask my AI study guide** buttons on the course and topic screens, and **Explain this** on a wrong daily-quiz answer. The Exam screen deliberately has **no** link to the guide.

## STEP 8: Retire the department-wide daily quiz from the main flows
```tsx
// ── Re-point the old department-wide daily quiz entry points to the new course-based flow. Do NOT delete QuizScreen, TeacherQuestionsScreen or the quiz_questions tables. ──

// src/screens/HomeScreen.tsx — REPLACE the whole <PressableScale style={[styles.quizCard, ...]}> ... </PressableScale> block (the one whose onPress is navigation.navigate("Quiz"))
// with the version below. Keep whatever trailing child (arrow/icon) the original block had after the text <View>, unchanged.
<PressableScale style={styles.quizCard} onPress={() => navigation.navigate("Courses")} haptic="medium" accessibilityRole="button">
  <View style={{ flex: 1 }}>
    <Text style={styles.quizCardTitle}>Daily quizzes now live inside your courses</Text>
    <Text style={styles.quizCardSubtitle}>Open a course, read a topic, then take today's quiz and climb the course ranking.</Text>
  </View>
  {/* keep the original trailing element here */}
</PressableScale>

// src/screens/PracticeScreen.tsx — REPLACE the `<Label>RANKED</Label>` line and the <Card onPress={() => navigation.navigate("Quiz")} ...> block after it with:
<Label>DAILY QUIZ</Label>
<Card onPress={() => navigation.navigate("Courses")}>
  <Text style={s.h3}>🏆 Daily quizzes live in your courses</Text>
  <Muted>Pick a course, read its topics, then take today's quiz. Your first scores count toward the course ranking.</Muted>
</Card>

// src/screens/teacher/TeacherDashboardScreen.tsx — EDITS
// (a) change the signature to receive navigation:  export default function TeacherDashboardScreen({ navigation }: any) {
// (b) in the main (loaded) return, REMOVE the second statsRow (Today's Questions / Completion Rate) and the infoCard that follows it
//     (they describe the old department quiz), and put these two action cards directly under <Text style={styles.department}>:
<View style={styles.statsRow}>
  <PressableScale style={{ flex: 1, backgroundColor: colors.teal, borderRadius: 14, padding: 16 }} onPress={() => navigation.navigate("TeacherCourses")}>
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Create a course</Text>
    <Text style={{ color: "#fff", opacity: 0.9, marginTop: 4 }}>For your department and level</Text>
  </PressableScale>
  <PressableScale style={{ flex: 1, backgroundColor: colors.navy, borderRadius: 14, padding: 16 }} onPress={() => navigation.navigate("TeacherCourses")}>
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Upload resources</Text>
    <Text style={{ color: "#fff", opacity: 0.9, marginTop: 4 }}>Open a course, then a topic</Text>
  </PressableScale>
</View>
```

## STEP 9: Final checks

1. `npx tsc --noEmit` passes; `npm test` still passes (existing tests build `CourseBundle` objects without the new optional fields, which is why they are optional).
2. No remaining references to `navigation.navigate("Quiz")` in `HomeScreen.tsx` or `PracticeScreen.tsx`; no `TeacherQuestions` references in `RootNavigator.tsx`.
3. Manual test script (use three accounts: admin, teacher, student; the student's profile must have the same department and year as the course):
   1. Admin: Users → search the teacher → tap levels (e.g. L1, L2).
   2. Teacher: Courses & content → create `PHY101` for Level 1. Try Level 3: it must be unavailable. Add topics "Kinematics" and "Forces". Open Kinematics: add a note, a link, a video link and a PDF; add 4 questions (one "Tests & exams only"); use "Draft with AI".
   3. Teacher: Tests & exams → create a **Test** for the whole course using at least 3 questions, opening now.
   4. Student (Level 1, same department): My courses shows PHY101 under "For your department and level" → Join. A Level 2 student must not see it.
   5. Student: Topics tab → open Kinematics → the finish button is disabled until every resource is opened → open all → finish. Practise this topic works. Ask my AI study guide answers about the topic.
   6. Student: Tests & exams tab shows the test locked ("Finish all topics…"). Finish Forces too → the test unlocks → take it → score shows. Ranking tab shows the student with points.
   7. Student: Daily quiz tab → only questions from started topics appear and never the "Tests & exams only" one → submit → a second attempt the same day is refused ("already finished").
   8. Teacher: Insights shows topic completion; Tests & exams → Results shows the student's score.
   9. Student: Practise this topic → each answer reveals correct/incorrect and the explanation from the server. In the network inspector or Supabase table view confirm the `get_course_content` response has `correct_index: null` for the student and contains no "Tests & exams only" question.
   10. Student: after the test and a daily quiz, the department / campus Leaderboard tab shows the student's points increased (`profiles.total_points`).
   11. Teacher: open a topic → Edit a resource (rename it, move it to another topic), Edit a question (change the answer, move it), then delete a topic with **Delete everything** and confirm its files disappear from Storage (`course-files` bucket) and the student no longer sees the topic.
   12. Teacher: Tests & exams → the Opens / Closes fields open the native date and time picker (no typing).
4. Confirm in the Supabase SQL editor that a student cannot change their own level assignment or role: `update profiles set teaching_levels = array[1] where id = auth.uid();` run **as a client** must fail with "Only an admin can change teaching levels". (Also verify that `update profiles set role = 'admin' ...` fails for a normal client; if it succeeds, tell the human, because the column-level revoke in migration 006 may not be effective on this Supabase project.)

## Known limitations (mention in your final report, do not "fix" without asking)

- Practice and the AI study guide need an internet connection (answers are checked on the server). Students who joined a course with an older app version still have the old answer keys in their local study data; they stop being refreshed.
- Course points are added to the global `total_points` going forward only; nothing is back-filled for quizzes taken before this upgrade.
- Exam open/close times use the teacher's device time zone; students see them converted to their own.
                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
