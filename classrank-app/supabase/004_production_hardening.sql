-- Phase: Production hardening (1/2) — data integrity & security
-- Run after 001_schema.sql, 002_normalized_leaderboard.sql, 003_seed_today.sql.

-- ─────────────────────────────────────────────
-- A. SECURITY FIX: stop sending correct_index to the client.
--
-- Postgres RLS is row-level, not column-level — the previous policy let any
-- authenticated user SELECT * from quiz_questions, which included the answer
-- key before they'd answered. Fix: revoke direct table access and expose a
-- view that omits correct_index. Views in Postgres execute with the view
-- owner's privileges by default, so this still works even with RLS locked
-- down on the base table.
-- ─────────────────────────────────────────────

drop policy if exists "Quiz questions are readable by authenticated users" on quiz_questions;
revoke select on quiz_questions from authenticated, anon;

create or replace view quiz_questions_public as
select id, department_id, quiz_date, question, options
from quiz_questions;

grant select on quiz_questions_public to authenticated;

-- The submit_quiz_results RPC (security definer, see 005) still reads
-- correct_index directly from the base table server-side, which is fine —
-- it never returns that value to the client.

-- ─────────────────────────────────────────────
-- B. DATA INTEGRITY: constraints that should have been there from day one.
-- ─────────────────────────────────────────────

alter table quiz_questions
  add constraint options_min_length check (array_length(options, 1) >= 2),
  add constraint correct_index_in_range check (
    correct_index >= 0 and correct_index < array_length(options, 1)
  );

alter table profiles
  add constraint total_points_non_negative check (total_points >= 0),
  add constraint current_streak_non_negative check (current_streak >= 0);

-- ─────────────────────────────────────────────
-- C. INDEXES: the MVP schema had none beyond primary keys. These matter once
-- you have more than a handful of rows per table.
-- ─────────────────────────────────────────────

create index if not exists idx_profiles_department_id on profiles (department_id);
create index if not exists idx_profiles_total_points on profiles (total_points desc);
create index if not exists idx_quiz_questions_department_date on quiz_questions (department_id, quiz_date);
create index if not exists idx_quiz_attempts_profile_id on quiz_attempts (profile_id);
create index if not exists idx_quiz_attempts_question_id on quiz_attempts (question_id);

-- ─────────────────────────────────────────────
-- D. updated_at tracking on profiles (useful for debugging/support and for
-- any future sync/cache-invalidation logic on the client).
-- ─────────────────────────────────────────────

alter table profiles add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();
