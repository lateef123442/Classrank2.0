-- Phase 4f: Pagination for admin_search_users
-- Run after 007_admin_teacher_rpcs.sql.

drop function if exists admin_search_users(text);

create or replace function admin_search_users(
  p_query text,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  department text,
  university text
)
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  -- Clamp to sane bounds so a client bug (or a malicious client) can't
  -- request an unbounded result set.
  p_limit := least(greatest(p_limit, 1), 50);
  p_offset := greatest(p_offset, 0);

  return query
  select p.id, p.name, u.email::text, p.role, d.name, p.university
  from profiles p
  join auth.users u on u.id = p.id
  left join departments d on d.id = p.department_id
  where p.name ilike '%' || p_query || '%' or u.email ilike '%' || p_query || '%'
  order by p.name
  limit p_limit offset p_offset;
end;
$$;

revoke all on function admin_search_users(text, int, int) from public;
grant execute on function admin_search_users(text, int, int) to authenticated;
