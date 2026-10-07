-- Phase 3: Courses, teacher content, course analytics, and study groups.
-- Run after 016_subscriptions.sql.  NOT yet executed against a database — review before applying.
--
-- Same security model as 006/007/015: row-level security allows READS to the people who should
-- see a row; every WRITE goes through a security-definer function that re-checks who the caller
-- is and what they're allowed to do. No direct insert/update/delete policies exist.

-- ─────────────────────────────────────────────
-- A. Helper predicates (security definer so policies don't recurse into RLS)
-- ─────────────────────────────────────────────
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  code text not null check (char_length(trim(code)) between 2 and 20),
  title text not null check (char_length(trim(title)) between 2 and 120),
  join_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_courses_created_by on courses (created_by);

create table if not exists course_members (
  course_id uuid not null references courses (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (course_id, profile_id)
);
create index if not exists idx_course_members_profile on course_members (profile_id);

create table if not exists course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  topic text not null default '' check (char_length(topic) <= 80),
  title text not null check (char_length(trim(title)) between 1 and 120),
  kind text not null default 'note' check (kind in ('note', 'link', 'video')),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_course_materials_course on course_materials (course_id);

create table if not exists course_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  topic text not null default '' check (char_length(topic) <= 80),
  question text not null check (char_length(trim(question)) between 1 and 600),
  options text[] not null,
  correct_index int not null,
  explanation text not null default '' check (char_length(explanation) <= 1000),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (array_length(options, 1) = 4),
  check (correct_index between 0 and 3)
);
create index if not exists idx_course_questions_course on course_questions (course_id);

create table if not exists course_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  kind text not null check (kind in ('announcement', 'exam')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  event_date date,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'exam' or event_date is not null)
);
create index if not exists idx_course_events_course on course_events (course_id, created_at desc);

-- One row per answered course question, reported by the student's app after a practice quiz.
-- Powers the teacher's "difficult questions" and per-topic views. Students are told this on join.
create table if not exists course_answer_events (
  id bigint generated always as identity primary key,
  course_id uuid not null references courses (id) on delete cascade,
  question_id uuid not null references course_questions (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_answer_events_course on course_answer_events (course_id, created_at desc);
create index if not exists idx_answer_events_question on course_answer_events (question_id);

create table if not exists study_groups (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments (id),
  course_id uuid references courses (id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  owner_id uuid not null references profiles (id) on delete cascade,
  join_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references study_groups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists idx_group_members_profile on group_members (profile_id);

create table if not exists group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  kind text not null default 'discussion' check (kind in ('discussion', 'question', 'resource')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  reply_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_group_posts_group on group_posts (group_id, created_at desc);

create table if not exists group_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references group_posts (id) on delete cascade,
  group_id uuid not null references study_groups (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_group_replies_post on group_replies (post_id, created_at);

create table if not exists group_challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  target_minutes int not null check (target_minutes between 10 and 10000),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists idx_group_challenges_group on group_challenges (group_id, ends_on desc);

create table if not exists group_challenge_progress (
  challenge_id uuid not null references group_challenges (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  minutes int not null default 0 check (minutes >= 0),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, profile_id)
);

-- ─────────────────────────────────────────────
-- B. Predicates used by RLS and RPCs
-- ─────────────────────────────────────────────
create or replace function is_course_member(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from course_members where course_id = p_course and profile_id = auth.uid());
$$;

-- Staff = the teacher who created the course, or any admin.
create or replace function is_course_staff(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
      or exists (
        select 1 from courses c join profiles p on p.id = auth.uid()
        where c.id = p_course and c.created_by = auth.uid() and p.role = 'teacher'
      );
$$;

create or replace function is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and profile_id = auth.uid());
$$;

-- ─────────────────────────────────────────────
-- C. Row-level security (read-only; writes only via the functions below)
-- ─────────────────────────────────────────────
alter table courses enable row level security;
alter table course_members enable row level security;
alter table course_materials enable row level security;
alter table course_questions enable row level security;
alter table course_events enable row level security;
alter table course_answer_events enable row level security;
alter table study_groups enable row level security;
alter table group_members enable row level security;
alter table group_posts enable row level security;
alter table group_replies enable row level security;
alter table group_challenges enable row level security;
alter table group_challenge_progress enable row level security;

drop policy if exists "course visible to members and staff" on courses;
create policy "course visible to members and staff" on courses for select to authenticated
  using (is_course_member(id) or is_course_staff(id));
drop policy if exists "own course memberships" on course_members;
create policy "own course memberships" on course_members for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "materials visible to members and staff" on course_materials;
create policy "materials visible to members and staff" on course_materials for select to authenticated
  using (is_course_member(course_id) or is_course_staff(course_id));
drop policy if exists "questions visible to members and staff" on course_questions;
create policy "questions visible to members and staff" on course_questions for select to authenticated
  using (is_course_member(course_id) or is_course_staff(course_id));
drop policy if exists "events visible to members and staff" on course_events;
create policy "events visible to members and staff" on course_events for select to authenticated
  using (is_course_member(course_id) or is_course_staff(course_id));
-- course_answer_events: no policy → clients can't read it; teachers get aggregates via teacher_course_stats().

drop policy if exists "groups visible to members" on study_groups;
create policy "groups visible to members" on study_groups for select to authenticated using (is_group_member(id));
drop policy if exists "group membership visible to members" on group_members;
create policy "group membership visible to members" on group_members for select to authenticated using (is_group_member(group_id));
drop policy if exists "posts visible to group members" on group_posts;
create policy "posts visible to group members" on group_posts for select to authenticated using (is_group_member(group_id));
drop policy if exists "replies visible to group members" on group_replies;
create policy "replies visible to group members" on group_replies for select to authenticated using (is_group_member(group_id));
drop policy if exists "challenges visible to group members" on group_challenges;
create policy "challenges visible to group members" on group_challenges for select to authenticated using (is_group_member(group_id));
drop policy if exists "challenge progress visible to group members" on group_challenge_progress;
create policy "challenge progress visible to group members" on group_challenge_progress for select to authenticated
  using (exists (select 1 from group_challenges c where c.id = challenge_id and is_group_member(c.group_id)));

-- ─────────────────────────────────────────────
-- D. Teacher / admin: course management
-- ─────────────────────────────────────────────
create or replace function create_course(p_department_id uuid, p_code text, p_title text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_dept uuid;
  v_row courses;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role, department_id into v_role, v_dept from profiles where id = v_uid;
  if v_role not in ('teacher', 'admin') then raise exception 'Not authorized'; end if;
  if v_role = 'teacher' and v_dept is distinct from p_department_id then
    raise exception 'Teachers can only create courses in their own department';
  end if;
  if char_length(trim(p_code)) < 2 or char_length(trim(p_title)) < 2 then
    raise exception 'Course code and title are required';
  end if;
  insert into courses (department_id, code, title, created_by)
  values (p_department_id, upper(trim(p_code)), trim(p_title), v_uid)
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
  select role into v_role from profiles where id = v_uid;
  if v_role not in ('teacher', 'admin') then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(x order by x.code) from (
      select c.id, c.code, c.title, c.join_code, d.name as department, pr.name as teacher_name,
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

create or replace function staff_delete_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  delete from courses where id = p_course_id;
end;
$$;

create or replace function staff_upsert_material(
  p_id uuid, p_course_id uuid, p_topic text, p_title text, p_kind text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if p_id is null then
    insert into course_materials (course_id, topic, title, kind, body, created_by)
    values (p_course_id, coalesce(trim(p_topic), ''), trim(p_title), p_kind, trim(p_body), auth.uid())
    returning id into v_id;
  else
    update course_materials set topic = coalesce(trim(p_topic), ''), title = trim(p_title), kind = p_kind, body = trim(p_body)
    where id = p_id and course_id = p_course_id returning id into v_id;
    if v_id is null then raise exception 'Material not found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function staff_upsert_course_question(
  p_id uuid, p_course_id uuid, p_topic text, p_question text, p_options text[], p_correct_index int, p_explanation text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  if array_length(p_options, 1) is distinct from 4 then raise exception 'Exactly four options are required'; end if;
  if p_correct_index < 0 or p_correct_index > 3 then raise exception 'correct_index out of range'; end if;
  if p_id is null then
    insert into course_questions (course_id, topic, question, options, correct_index, explanation, created_by)
    values (p_course_id, coalesce(trim(p_topic), ''), trim(p_question), p_options, p_correct_index, coalesce(trim(p_explanation), ''), auth.uid())
    returning id into v_id;
  else
    update course_questions set topic = coalesce(trim(p_topic), ''), question = trim(p_question), options = p_options,
      correct_index = p_correct_index, explanation = coalesce(trim(p_explanation), '')
    where id = p_id and course_id = p_course_id returning id into v_id;
    if v_id is null then raise exception 'Question not found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function staff_post_event(
  p_course_id uuid, p_kind text, p_title text, p_body text, p_event_date date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  insert into course_events (course_id, kind, title, body, event_date, created_by)
  values (p_course_id, p_kind, trim(p_title), coalesce(trim(p_body), ''), p_event_date, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- p_kind: 'material' | 'question' | 'event'
create or replace function staff_delete_course_content(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  if p_kind = 'material' then select course_id into v_course from course_materials where id = p_id;
  elsif p_kind = 'question' then select course_id into v_course from course_questions where id = p_id;
  elsif p_kind = 'event' then select course_id into v_course from course_events where id = p_id;
  else raise exception 'Unknown content kind'; end if;
  if v_course is null then raise exception 'Not found'; end if;
  if not is_course_staff(v_course) then raise exception 'Not authorized'; end if;
  if p_kind = 'material' then delete from course_materials where id = p_id;
  elsif p_kind = 'question' then delete from course_questions where id = p_id;
  else delete from course_events where id = p_id; end if;
end;
$$;

-- Aggregates for the teacher dashboard: class stats, hardest questions, weak topics, per-student accuracy.
create or replace function teacher_course_stats(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_course_staff(p_course_id) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'member_count', (select count(*) from course_members where course_id = p_course_id),
    'active_7d', (select count(distinct profile_id) from course_answer_events
                  where course_id = p_course_id and created_at > now() - interval '7 days'),
    'answers_total', (select count(*) from course_answer_events where course_id = p_course_id),
    'accuracy', (select round(100.0 * avg(correct::int)) from course_answer_events where course_id = p_course_id),
    'hardest', coalesce((
      select jsonb_agg(h order by h.pct_correct) from (
        select q.id as question_id, q.question, q.topic, count(*) as attempts,
               round(100.0 * avg(e.correct::int)) as pct_correct
        from course_questions q join course_answer_events e on e.question_id = q.id
        where q.course_id = p_course_id
        group by q.id having count(*) >= 3
        order by pct_correct asc limit 5
      ) h), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(t order by t.pct_correct) from (
        select case when q.topic = '' then 'General' else q.topic end as topic, count(*) as attempts,
               round(100.0 * avg(e.correct::int)) as pct_correct
        from course_questions q join course_answer_events e on e.question_id = q.id
        where q.course_id = p_course_id
        group by 1 order by pct_correct asc limit 12
      ) t), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(s order by s.accuracy) from (
        select pr.name, count(*) as answers, round(100.0 * avg(e.correct::int)) as accuracy
        from course_answer_events e join profiles pr on pr.id = e.profile_id
        where e.course_id = p_course_id
        group by pr.id, pr.name order by accuracy asc limit 100
      ) s), '[]'::jsonb)
  );
end;
$$;

-- ─────────────────────────────────────────────
-- E. Student: join, read, report
-- ─────────────────────────────────────────────
create or replace function join_course(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_course courses;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from profiles where id = v_uid;
  if v_role is distinct from 'student' then raise exception 'Only students can join a course'; end if;
  select * into v_course from courses where join_code = upper(trim(p_code));
  if not found then raise exception 'No course matches that code'; end if;
  insert into course_members (course_id, profile_id) values (v_course.id, v_uid) on conflict do nothing;
  return jsonb_build_object('course_id', v_course.id, 'code', v_course.code, 'title', v_course.title);
end;
$$;

create or replace function leave_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from course_members where course_id = p_course_id and profile_id = auth.uid();
end;
$$;

create or replace function my_courses()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x order by x.code) from (
      select c.id, c.code, c.title, d.name as department, pr.name as teacher_name,
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

-- Everything a student's app needs to build the course's Subject Room, in one request.
create or replace function get_course_content(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then
    raise exception 'Not authorized';
  end if;
  return jsonb_build_object(
    'course', (select jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title) from courses c where c.id = p_course_id),
    'materials', coalesce((select jsonb_agg(m order by m.created_at) from (
        select id, topic, title, kind, body, created_at from course_materials where course_id = p_course_id order by created_at limit 300) m), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(q order by q.created_at) from (
        select id, topic, question, options, correct_index, explanation, created_at
        from course_questions where course_id = p_course_id order by created_at limit 500) q), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select id, kind, title, body, event_date, created_at from course_events where course_id = p_course_id order by created_at desc limit 50) e), '[]'::jsonb)
  );
end;
$$;

-- p_answers: [{"question_id": "...", "correct": true}, ...]  (max 60 per call)
create or replace function report_course_answers(p_course_id uuid, p_answers jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_course_member(p_course_id) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 60 then
    raise exception 'Invalid answers payload';
  end if;
  insert into course_answer_events (course_id, question_id, profile_id, correct)
  select p_course_id, q.id, auth.uid(), (a->>'correct')::boolean
  from jsonb_array_elements(p_answers) a
  join course_questions q on q.id = (a->>'question_id')::uuid and q.course_id = p_course_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- Latest teacher announcements across the caller's courses (shown on Home).
create or replace function my_recent_announcements(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select e.id, e.title, e.body, e.created_at, c.id as course_id, c.code as course_code
      from course_events e
      join courses c on c.id = e.course_id
      join course_members m on m.course_id = c.id and m.profile_id = auth.uid()
      where e.kind = 'announcement'
        and e.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60))
      order by e.created_at desc
      limit 10
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ─────────────────────────────────────────────
-- F. Study groups
-- ─────────────────────────────────────────────
create or replace function create_study_group(p_name text, p_description text, p_course_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dept uuid;
  v_row study_groups;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if (select count(*) from study_groups where owner_id = v_uid) >= 10 then
    raise exception 'You can own up to 10 study groups';
  end if;
  if p_course_id is not null and not is_course_member(p_course_id) then
    raise exception 'You can only link a group to a course you are in';
  end if;
  select department_id into v_dept from profiles where id = v_uid;
  insert into study_groups (department_id, course_id, name, description, owner_id)
  values (v_dept, p_course_id, trim(p_name), coalesce(trim(p_description), ''), v_uid)
  returning * into v_row;
  insert into group_members (group_id, profile_id) values (v_row.id, v_uid);
  return jsonb_build_object('id', v_row.id, 'join_code', v_row.join_code);
end;
$$;

create or replace function join_study_group(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group study_groups;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_group from study_groups where join_code = upper(trim(p_code));
  if not found then raise exception 'No group matches that code'; end if;
  if (select count(*) from group_members where group_id = v_group.id) >= 200 then
    raise exception 'This group is full';
  end if;
  insert into group_members (group_id, profile_id) values (v_group.id, v_uid) on conflict do nothing;
  return jsonb_build_object('group_id', v_group.id, 'name', v_group.name);
end;
$$;

-- Members can leave; the owner deletes the group instead (so a group is never left ownerless).
create or replace function leave_study_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from study_groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'Owners delete the group instead of leaving it';
  end if;
  delete from group_members where group_id = p_group_id and profile_id = auth.uid();
end;
$$;

create or replace function delete_study_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (
    exists (select 1 from study_groups where id = p_group_id and owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  ) then raise exception 'Not authorized'; end if;
  delete from study_groups where id = p_group_id;
end;
$$;

create or replace function my_study_groups()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x order by x.name) from (
      select g.id, g.name, g.description, g.owner_id, g.course_id,
        case when g.owner_id = auth.uid() then g.join_code else null end as join_code,
        (select count(*) from group_members m2 where m2.group_id = g.id) as member_count,
        (select c.title from group_challenges c where c.group_id = g.id and c.ends_on >= current_date
          order by c.ends_on limit 1) as active_challenge
      from study_groups g
      join group_members m on m.group_id = g.id and m.profile_id = auth.uid()
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function create_group_post(p_group_id uuid, p_kind text, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_group_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  insert into group_posts (group_id, author_id, kind, title, body)
  values (p_group_id, auth.uid(), p_kind, trim(p_title), coalesce(trim(p_body), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function list_group_posts(p_group_id uuid, p_limit int default 30, p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select p.id, p.kind, p.title, p.body, p.reply_count, p.created_at, p.author_id, pr.name as author_name
      from group_posts p join profiles pr on pr.id = p.author_id
      where p.group_id = p_group_id and (p_before is null or p.created_at < p_before)
      order by p.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function list_post_replies(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from group_posts where id = p_post_id;
  if v_group is null or not is_group_member(v_group) then raise exception 'Not found'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at) from (
      select r.id, r.body, r.created_at, r.author_id, pr.name as author_name
      from group_replies r join profiles pr on pr.id = r.author_id
      where r.post_id = p_post_id order by r.created_at limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function create_post_reply(p_post_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_id uuid;
begin
  select group_id into v_group from group_posts where id = p_post_id;
  if v_group is null or not is_group_member(v_group) then raise exception 'Not found'; end if;
  insert into group_replies (post_id, group_id, author_id, body)
  values (p_post_id, v_group, auth.uid(), trim(p_body)) returning id into v_id;
  update group_posts set reply_count = reply_count + 1 where id = p_post_id;
  return v_id;
end;
$$;

-- Author, the group's owner, or an admin may remove a post.
create or replace function delete_group_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_group uuid;
begin
  select author_id, group_id into v_author, v_group from group_posts where id = p_post_id;
  if v_group is null then raise exception 'Not found'; end if;
  if not (
    v_author = auth.uid()
    or exists (select 1 from study_groups where id = v_group and owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  ) then raise exception 'Not authorized'; end if;
  delete from group_posts where id = p_post_id;
end;
$$;

create or replace function create_group_challenge(p_group_id uuid, p_title text, p_target_minutes int, p_days int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from study_groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'Only the group owner can start a challenge';
  end if;
  if exists (select 1 from group_challenges where group_id = p_group_id and ends_on >= current_date) then
    raise exception 'Finish the current challenge first';
  end if;
  if p_days < 1 or p_days > 60 then raise exception 'Challenges run 1 to 60 days'; end if;
  insert into group_challenges (group_id, title, target_minutes, starts_on, ends_on, created_by)
  values (p_group_id, trim(p_title), p_target_minutes, current_date, current_date + (p_days - 1), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function current_group_challenge(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  return (
    select jsonb_build_object('id', c.id, 'title', c.title, 'target_minutes', c.target_minutes,
                              'starts_on', c.starts_on, 'ends_on', c.ends_on)
    from group_challenges c where c.group_id = p_group_id
    order by c.ends_on desc limit 1
  );
end;
$$;

-- Self-reported focus minutes (from the student's own focus log), capped to what the window allows.
create or replace function report_challenge_progress(p_challenge_id uuid, p_minutes int)
returns void language plpgsql security definer set search_path = public as $$
declare v_c group_challenges;
begin
  select * into v_c from group_challenges where id = p_challenge_id;
  if not found or not is_group_member(v_c.group_id) then raise exception 'Not found'; end if;
  insert into group_challenge_progress (challenge_id, profile_id, minutes)
  values (p_challenge_id, auth.uid(), least(greatest(p_minutes, 0), 1440 * (v_c.ends_on - v_c.starts_on + 1)))
  on conflict (challenge_id, profile_id) do update set minutes = excluded.minutes, updated_at = now();
end;
$$;

create or replace function challenge_standings(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from group_challenges where id = p_challenge_id;
  if v_group is null or not is_group_member(v_group) then raise exception 'Not found'; end if;
  return coalesce((
    select jsonb_agg(x order by x.minutes desc, x.name) from (
      select pr.id as profile_id, pr.name, coalesce(p.minutes, 0) as minutes
      from group_members m
      join profiles pr on pr.id = m.profile_id
      left join group_challenge_progress p on p.challenge_id = p_challenge_id and p.profile_id = m.profile_id
      where m.group_id = v_group
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ─────────────────────────────────────────────
-- G. Lock down execution: authenticated only (functions check roles themselves)
-- ─────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'is_course_member', 'is_course_staff', 'is_group_member',
      'create_course', 'staff_list_courses', 'staff_delete_course', 'staff_upsert_material',
      'staff_upsert_course_question', 'staff_post_event', 'staff_delete_course_content', 'teacher_course_stats',
      'join_course', 'leave_course', 'my_courses', 'my_recent_announcements', 'get_course_content', 'report_course_answers',
      'create_study_group', 'join_study_group', 'leave_study_group', 'delete_study_group', 'my_study_groups',
      'create_group_post', 'list_group_posts', 'list_post_replies', 'create_post_reply', 'delete_group_post',
      'create_group_challenge', 'current_group_challenge', 'report_challenge_progress', 'challenge_standings'
    ])
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
