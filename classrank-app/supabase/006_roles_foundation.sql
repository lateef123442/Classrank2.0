-- Phase 4a: Roles & Admin/Teacher foundation
-- Run after 001-005.

-- ─────────────────────────────────────────────
-- A. Add role to profiles. Students remain the default, self-service path.
-- Teachers and admins are never self-assigned directly by the client — see
-- the column-privilege lockdown in section C, and the RPCs in 007.
-- ─────────────────────────────────────────────

alter table profiles add column if not exists role text not null default 'student'
  check (role in ('student', 'teacher', 'admin'));

-- Students need a department + year; teachers need a department but not a
-- year; admins may not be tied to any single department. Relax the
-- constraints that assumed everyone was a student, and replace them with a
-- role-aware check.
alter table profiles alter column department_id drop not null;
alter table profiles alter column year drop not null;

alter table profiles add constraint student_requires_department_and_year check (
  role <> 'student' or (department_id is not null and year is not null)
);
alter table profiles add constraint teacher_requires_department check (
  role <> 'teacher' or department_id is not null
);

-- ─────────────────────────────────────────────
-- B. Teacher invite codes — how someone becomes a teacher.
-- Self-service "sign up as a teacher" with no gate would let any student
-- grant themselves grading/content power over a department. Instead, an
-- admin generates a one-time code scoped to a specific department; signing
-- up as a teacher requires a valid, unused code for that department.
-- ─────────────────────────────────────────────

create table if not exists teacher_invite_codes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  code text not null unique,
  created_at timestamptz not null default now(),
  used_by uuid references profiles (id),
  used_at timestamptz
);

alter table teacher_invite_codes enable row level security;
-- Deliberately no policies here — this table is only ever read/written
-- through the security-definer RPCs in 007_admin_teacher_rpcs.sql, which
-- enforce their own admin/teacher checks. Direct client access is fully
-- denied by default with RLS on and no policies defined.

-- ─────────────────────────────────────────────
-- C. SECURITY: prevent role self-escalation.
--
-- The existing RLS policy "Users can update/insert their own profile" only
-- checks *whose row* is being written (auth.uid() = id) — it says nothing
-- about *which columns*. Without this, a student could call
-- `supabase.from('profiles').update({ role: 'admin' })` on their own row and
-- grant themselves admin. Postgres supports column-level privileges
-- alongside RLS; revoking write access to the `role` column from the
-- `authenticated` role closes this, while leaving it fully writable by
-- security-definer functions (which run as the function/table owner, who is
-- unaffected by grants/revokes made to other roles).
-- ─────────────────────────────────────────────

revoke insert (role), update (role) on profiles from authenticated;

-- Sanity check you can run manually after applying this file:
--   as an authenticated user, `update profiles set role = 'admin' where id = auth.uid();`
--   should fail with "permission denied for column role".
