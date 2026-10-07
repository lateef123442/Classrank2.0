-- Phase 6b: Social feed
-- Run after 014_referrals.sql.
--
-- Visibility model: a post defaults to visible only within the author's own
-- department; the author can mark it public to be visible campus-wide.
-- This is enforced by RLS directly on `posts`, NOT by hiding a column via a
-- view-bypasses-RLS trick (the pattern used elsewhere in this schema for
-- quiz_questions_public/leaderboard) — that pattern works there because
-- those views intentionally expose the same rows to everyone, just with
-- fewer columns. Here, *which rows* are visible genuinely depends on the
-- querying user's own department, so the convenience view below uses
-- `security_invoker = true` (requires Postgres 15+, which Supabase runs)
-- so it correctly re-checks RLS as the querying user rather than running
-- with the view owner's elevated privileges.

-- ─────────────────────────────────────────────
-- A. Posts
-- ─────────────────────────────────────────────
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id) on delete cascade,
  department_id uuid not null references departments (id),
  content text not null check (char_length(trim(content)) between 1 and 1000),
  is_public boolean not null default false,
  like_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_department_created on posts (department_id, created_at desc);
create index if not exists idx_posts_public_created on posts (is_public, created_at desc) where is_public = true;
create index if not exists idx_posts_author on posts (author_id);

alter table posts enable row level security;

create policy "posts are readable if public or same department"
  on posts for select
  to authenticated
  using (
    is_public = true
    or department_id = (select department_id from profiles where id = auth.uid())
  );

-- No direct insert/update/delete policies — all mutations go through the
-- RPCs below, which validate department ownership and authorship
-- server-side rather than trusting client-supplied values.

-- ─────────────────────────────────────────────
-- B. Likes
-- ─────────────────────────────────────────────
create table if not exists post_likes (
  post_id uuid not null references posts (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table post_likes enable row level security;

create policy "users can see their own likes"
  on post_likes for select
  to authenticated
  using (auth.uid() = profile_id);

-- ─────────────────────────────────────────────
-- C. Convenience view for the feed (author name/department joined in).
-- security_invoker = true is the important part — see note at top of file.
-- ─────────────────────────────────────────────
create or replace view feed_posts
with (security_invoker = true) as
select
  p.id,
  p.content,
  p.is_public,
  p.like_count,
  p.created_at,
  p.department_id,
  d.name as department,
  p.author_id,
  pr.name as author_name,
  pr.role as author_role
from posts p
join profiles pr on pr.id = p.author_id
join departments d on d.id = p.department_id;

grant select on feed_posts to authenticated;

-- ─────────────────────────────────────────────
-- D. Mutations
-- ─────────────────────────────────────────────
create or replace function create_post(p_content text, p_is_public boolean default false)
returns uuid
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_department_id uuid;
  v_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select department_id into v_department_id from profiles where id = v_caller_id;
  if v_department_id is null then
    raise exception 'Only students and teachers with a department can post';
  end if;

  if char_length(trim(p_content)) = 0 or char_length(trim(p_content)) > 1000 then
    raise exception 'Post must be between 1 and 1000 characters';
  end if;

  insert into posts (author_id, department_id, content, is_public)
  values (v_caller_id, v_department_id, trim(p_content), coalesce(p_is_public, false))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function create_post(text, boolean) from public;
grant execute on function create_post(text, boolean) to authenticated;

create or replace function toggle_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_visible boolean;
  v_already_liked boolean;
  v_new_count int;
  v_liked boolean;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Manually re-check visibility since this function runs with elevated
  -- privileges (security definer) and would otherwise let a user like a
  -- post from a department they can't even see.
  select exists(
    select 1 from posts p
    where p.id = p_post_id
      and (p.is_public = true or p.department_id = (select department_id from profiles where id = v_caller_id))
  ) into v_visible;

  if not v_visible then
    raise exception 'Post not found';
  end if;

  select exists(select 1 from post_likes where post_id = p_post_id and profile_id = v_caller_id) into v_already_liked;

  if v_already_liked then
    delete from post_likes where post_id = p_post_id and profile_id = v_caller_id;
    update posts set like_count = greatest(0, like_count - 1) where id = p_post_id returning like_count into v_new_count;
    v_liked := false;
  else
    insert into post_likes (post_id, profile_id) values (p_post_id, v_caller_id);
    update posts set like_count = like_count + 1 where id = p_post_id returning like_count into v_new_count;
    v_liked := true;
  end if;

  return jsonb_build_object('liked', v_liked, 'like_count', v_new_count);
end;
$$;

revoke all on function toggle_post_like(uuid) from public;
grant execute on function toggle_post_like(uuid) to authenticated;

create or replace function delete_post(p_post_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_author_id uuid;
  v_caller_role text;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select author_id into v_author_id from posts where id = p_post_id;
  if v_author_id is null then
    raise exception 'Post not found';
  end if;

  select role into v_caller_role from profiles where id = v_caller_id;

  if v_author_id <> v_caller_id and v_caller_role <> 'admin' then
    raise exception 'You can only delete your own posts';
  end if;

  delete from posts where id = p_post_id;
end;
$$;

revoke all on function delete_post(uuid) from public;
grant execute on function delete_post(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- E. My own likes (so the client knows which posts to render as "liked"
-- without needing a policy that exposes everyone's like activity).
-- ─────────────────────────────────────────────
create or replace function get_my_liked_post_ids(p_post_ids uuid[])
returns uuid[]
language sql
security definer
as $$
  select coalesce(array_agg(post_id), '{}')
  from post_likes
  where profile_id = auth.uid() and post_id = any(p_post_ids);
$$;

revoke all on function get_my_liked_post_ids(uuid[]) from public;
grant execute on function get_my_liked_post_ids(uuid[]) to authenticated;
