-- Phase 4c: First-admin bootstrap
--
-- There is no self-service admin sign-up (see 006/007 for why). To create
-- your first admin:
--
--   1. Sign up normally through the app as a student (any department/year —
--      it doesn't matter, you're about to become an admin).
--   2. Run the query below in the Supabase SQL Editor, replacing the email.
--
-- After that, use the Admin app to promote further admins/teachers instead
-- of running SQL by hand.

update profiles
set role = 'admin'
where id = (select id from auth.users where email = 'REPLACE_WITH_YOUR_EMAIL@example.com');

-- Verify it worked:
-- select p.name, u.email, p.role from profiles p join auth.users u on u.id = p.id where p.role = 'admin';
