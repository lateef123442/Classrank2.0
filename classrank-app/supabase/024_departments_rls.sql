-- Fix: `departments` was the only table created without row level security. On Supabase the anon/authenticated
-- roles get write access to public tables by default, so anyone holding the (public) anon key could have added,
-- renamed or deleted departments through the REST API. Departments stay readable by everyone (the sign-up screen
-- needs the list before login), but only admin RPCs (security definer, e.g. admin_create_department) can change them.
alter table departments enable row level security;

drop policy if exists "departments are readable by everyone" on departments;
create policy "departments are readable by everyone" on departments for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on departments from anon, authenticated;
