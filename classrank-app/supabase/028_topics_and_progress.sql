-- 028: topics as first-class rows, material/topic tracking, completion gate
-- Idempotent and safe to rerun.

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

alter table course_materials add column if not exists topic_id uuid references course_topics (id) on delete set null;
alter table course_questions add column if not exists topic_id uuid references course_topics (id) on delete set null;

alter table course_questions add column if not exists in_daily boolean not null default true;
alter table course_questions add column if not exists assessment_only boolean not null default false;

alter table course_questions drop constraint if exists course_questions_pool_check;
alter table course_questions add constraint course_questions_pool_check
  check (not (assessment_only and in_daily));

create index if not exists idx_course_materials_topic on course_materials (topic_id);
create index if not exists idx_course_questions_topic on course_questions (topic_id);

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

-- Keep topic/title and topic_id synchronized.
create or replace function sync_course_topic() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(coalesce(new.topic, '')), '');
  v_id uuid;
begin
  if v_title is null then
    new.topic := '';
    new.topic_id := null;
    return new;
  end if;

  select t.id into v_id
  from course_topics t
  where t.course_id = new.course_id and lower(t.title) = lower(v_title);

  if v_id is null then
    insert into course_topics (course_id, title, position, created_by)
    values (new.course_id, v_title,
            coalesce((select max(x.position) + 1 from course_topics x where x.course_id = new.course_id), 0),
            new.created_by)
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      select t.id into v_id
      from course_topics t
      where t.course_id = new.course_id and lower(t.title) = lower(v_title);
    end if;
  end if;

  new.topic_id := v_id;
  new.topic := coalesce((select t.title from course_topics t where t.id = v_id), '');
  return new;
end;
$$;

drop trigger if exists trg_sync_topic_materials on course_materials;
create trigger trg_sync_topic_materials
before insert or update of topic on course_materials
for each row
execute function sync_course_topic();

drop trigger if exists trg_sync_topic_questions on course_questions;
create trigger trg_sync_topic_questions
before insert or update of topic on course_questions
for each row
execute function sync_course_topic();

create or replace function staff_upsert_topic(p_id uuid, p_course_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
begin
  if not is_course_staff(p_course_id) then
    raise exception 'Not authorized';
  end if;

  if char_length(v_title) not between 1 and 80 then
    raise exception 'Topic name must be 1 to 80 characters';
  end if;

  if p_id is null then
    insert into course_topics (course_id, title, position, created_by)
    values (p_course_id, v_title,
            coalesce((select max(x.position) + 1 from course_topics x where x.course_id = p_course_id), 0), auth.uid())
    returning id into v_id;
  else
    update course_topics
       set title = v_title
     where course_topics.id = p_id and course_topics.course_id = p_course_id
     returning course_topics.id into v_id;

    if v_id is null then
      raise exception 'Topic not found';
    end if;

    update course_materials
       set topic = v_title
     where course_materials.topic_id = v_id;

    update course_questions
       set topic = v_title
     where course_questions.topic_id = v_id;
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'This course already has a topic with that name';
end;
$$;

create or replace function staff_delete_topic(p_topic_id uuid, p_delete_content boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
begin
  select t.course_id into v_course
  from course_topics t
  where t.id = p_topic_id;

  if v_course is null or not is_course_staff(v_course) then
    raise exception 'Topic not found';
  end if;

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

create or replace function staff_update_material_meta(p_id uuid, p_title text, p_topic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
begin
  select m.course_id into v_course
  from course_materials m
  where m.id = p_id;

  if v_course is null or not is_course_staff(v_course) then
    raise exception 'Resource not found';
  end if;

  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Give the resource a name';
  end if;

  update course_materials
     set title = trim(p_title),
         topic = coalesce(trim(p_topic), '')
   where course_materials.id = p_id;
end;
$$;

create or replace function staff_reorder_topics(p_course_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_course_staff(p_course_id) then
    raise exception 'Not authorized';
  end if;

  update course_topics t
     set position = (u.n - 1)::int
    from unnest(p_ids) with ordinality as u(tid, n)
   where t.id = u.tid and t.course_id = p_course_id;
end;
$$;

create or replace function record_material_view(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
begin
  select m.course_id into v_course
  from course_materials m
  where m.id = p_material_id;

  if v_course is null or not is_course_member(v_course) then
    raise exception 'Not authorized';
  end if;

  insert into course_material_views (material_id, profile_id, course_id)
  values (p_material_id, auth.uid(), v_course)
  on conflict do nothing;
end;
$$;

create or replace function course_progress(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topics jsonb;
  v_total int;
  v_done int;
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x.position, x.title), '[]'::jsonb)
    into v_topics
  from (
    select
      t.id,
      t.title,
      t.position,
      (select count(*) from course_materials m where m.topic_id = t.id) as materials_total,
      (select count(*)
         from course_material_views v
         join course_materials m2 on m2.id = v.material_id
        where m2.topic_id = t.id and v.profile_id = auth.uid()) as materials_viewed,
      (select count(*) from course_questions q where q.topic_id = t.id and not q.assessment_only) as question_count,
      exists (select 1 from course_topic_progress g where g.topic_id = t.id and g.profile_id = auth.uid()) as completed
    from course_topics t
    where t.course_id = p_course_id
  ) x;

  v_total := jsonb_array_length(v_topics);

  select count(*) into v_done
  from jsonb_array_elements(v_topics) as t(e)
  where (t.e ->> 'completed')::boolean;

  return jsonb_build_object(
    'topics', v_topics,
    'topic_count', v_total,
    'completed_count', v_done,
    'course_complete', v_done = v_total,
    'viewed_ids', coalesce((
      select jsonb_agg(v.material_id)
      from course_material_views v
      where v.course_id = p_course_id and v.profile_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function mark_topic_complete(p_topic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_total int;
  v_seen int;
begin
  select t.course_id into v_course
  from course_topics t
  where t.id = p_topic_id;

  if v_course is null or not is_course_member(v_course) then
    raise exception 'Not authorized';
  end if;

  select count(*) into v_total
  from course_materials m
  where m.topic_id = p_topic_id;

  select count(*) into v_seen
  from course_material_views v
  join course_materials m on m.id = v.material_id
  where m.topic_id = p_topic_id and v.profile_id = auth.uid();

  if v_seen < v_total then
    raise exception 'Open every resource in this topic first';
  end if;

  insert into course_topic_progress (topic_id, profile_id, course_id)
  values (p_topic_id, auth.uid(), v_course)
  on conflict do nothing;

  return course_progress(v_course);
end;
$$;

create or replace function course_gate_open(p_course_id uuid, p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic_id is not null then
      exists (
        select 1
        from course_topic_progress g
        where g.topic_id = p_topic_id and g.profile_id = auth.uid()
      )
    else
      not exists (
        select 1
        from course_topics t
        where t.course_id = p_course_id
          and not exists (
            select 1
            from course_topic_progress g
            where g.topic_id = t.id and g.profile_id = auth.uid()
          )
      )
  end;
$$;

create or replace function staff_topic_progress(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_course_staff(p_course_id) then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'member_count', (select count(*) from course_members cm where cm.course_id = p_course_id),
    'topics', coalesce((
      select jsonb_agg(x order by x.position, x.title)
      from (
        select
          t.id,
          t.title,
          t.position,
          (select count(*) from course_topic_progress g where g.topic_id = t.id) as completed_count,
          (select count(distinct v.profile_id)
           from course_material_views v
           join course_materials m on m.id = v.material_id
           where m.topic_id = t.id) as readers
        from course_topics t
        where t.course_id = p_course_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function get_course_practice_set(p_course_id uuid, p_topic_id uuid default null, p_count int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := least(greatest(coalesce(p_count, 10), 3), 20);
begin
  if not (is_course_member(p_course_id) or is_course_staff(p_course_id)) then
    raise exception 'Not authorized';
  end if;

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

create or replace function check_course_practice_answer(p_question_id uuid, p_picked int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q course_questions;
begin
  select * into v_q
  from course_questions q
  where q.id = p_question_id;

  if not found or v_q.assessment_only or not (is_course_member(v_q.course_id) or is_course_staff(v_q.course_id)) then
    raise exception 'Question not found';
  end if;

  if p_picked is null or p_picked not between 0 and 3 then
    raise exception 'Invalid answer';
  end if;

  insert into course_answer_events (course_id, question_id, profile_id, correct, picked)
  values (v_q.course_id, p_question_id, auth.uid(), p_picked = v_q.correct_index, p_picked)
  on conflict do nothing;

  return jsonb_build_object(
    'correct', v_q.correct_index,
    'explanation', v_q.explanation,
    'was_correct', p_picked = v_q.correct_index
  );
end;
$$;

create or replace function get_course_content(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff boolean;
begin
  v_staff := is_course_staff(p_course_id);
  if not (is_course_member(p_course_id) or v_staff) then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'course', (
      select jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'level', c.level)
      from courses c
      where c.id = p_course_id
    ),
    'topics', coalesce((
      select jsonb_agg(t order by t.position, t.title)
      from (
        select id, title, position
        from course_topics
        where course_id = p_course_id
      ) t
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(m order by m.created_at)
      from (
        select id, topic, topic_id, title, kind, body, file_name, file_size, mime, created_at
        from course_materials
        where course_id = p_course_id
        order by created_at limit 300
      ) m
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(q order by q.created_at)
      from (
        select id, topic, topic_id, question, options,
               case when v_staff then correct_index end as correct_index,
               case when v_staff then explanation end as explanation,
               in_daily, assessment_only, created_at
        from course_questions
        where course_id = p_course_id and (v_staff or not assessment_only)
        order by created_at limit 500
      ) q
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(e order by e.created_at desc)
      from (
        select id, kind, title, body, event_date, created_at
        from course_events
        where course_id = p_course_id
        order by created_at desc limit 50
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function staff_upsert_topic(uuid,uuid,text) from public;
revoke all on function staff_delete_topic(uuid,boolean) from public;
revoke all on function staff_reorder_topics(uuid,uuid[]) from public;
revoke all on function record_material_view(uuid) from public;
revoke all on function course_progress(uuid) from public;
revoke all on function mark_topic_complete(uuid) from public;
revoke all on function course_gate_open(uuid,uuid) from public;
revoke all on function staff_topic_progress(uuid) from public;
revoke all on function get_course_content(uuid) from public;
revoke all on function get_course_practice_set(uuid,uuid,int) from public;
revoke all on function check_course_practice_answer(uuid,int) from public;
revoke all on function staff_update_material_meta(uuid,text,text) from public;

grant execute on function staff_upsert_topic(uuid,uuid,text) to authenticated;
grant execute on function staff_delete_topic(uuid,boolean) to authenticated;
grant execute on function staff_reorder_topics(uuid,uuid[]) to authenticated;
grant execute on function record_material_view(uuid) to authenticated;
grant execute on function course_progress(uuid) to authenticated;
grant execute on function mark_topic_complete(uuid) to authenticated;
grant execute on function course_gate_open(uuid,uuid) to authenticated;
grant execute on function staff_topic_progress(uuid) to authenticated;
grant execute on function get_course_content(uuid) to authenticated;
grant execute on function get_course_practice_set(uuid,uuid,int) to authenticated;
grant execute on function check_course_practice_answer(uuid,int) to authenticated;
grant execute on function staff_update_material_meta(uuid,text,text) to authenticated;
