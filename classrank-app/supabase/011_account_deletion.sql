-- Phase 4e: Account deletion
-- Run after 001-010.
--
-- Apple's App Store Review Guideline 5.1.1(v) requires apps that support
-- account creation to also support in-app account deletion, not just a
-- "contact support to delete your account" flow. This RPC deletes the
-- underlying auth.users row directly; because profiles.id references
-- auth.users(id) on delete cascade, and quiz_attempts.profile_id references
-- profiles(id) on delete cascade, this cleanly removes all of that user's
-- personal data in one operation — no orphaned rows.
--
-- Note this deletes the row from Postgres directly rather than going
-- through Supabase's Admin API (which requires a service-role key the
-- client never has). A security-definer function is the standard way to do
-- this safely from a client with only the anon/authenticated key.

create or replace function delete_own_account()
returns void
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = v_caller_id;
  -- Cascades to profiles, then quiz_attempts, then any invite code's
  -- used_by reference is set null by the FK (no ON DELETE clause on that
  -- one means it would block deletion if left as-is — see the fix below).
end;
$$;

-- teacher_invite_codes.used_by references profiles(id) with no ON DELETE
-- behavior specified, which defaults to RESTRICT — that would block a
-- former teacher from deleting their account if they'd ever redeemed a
-- code. Fix: preserve the historical record but null out the reference.
alter table teacher_invite_codes drop constraint if exists teacher_invite_codes_used_by_fkey;
alter table teacher_invite_codes
  add constraint teacher_invite_codes_used_by_fkey
  foreign key (used_by) references profiles (id) on delete set null;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;
