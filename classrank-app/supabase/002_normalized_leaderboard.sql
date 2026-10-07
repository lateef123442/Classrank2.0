-- Phase 3: Fairness normalization
-- Run this after schema.sql (and after seed_today.sql if you've run it).
--
-- Problem: the plain `leaderboard` view sorts by raw total_points. That's fair
-- for the Department board (everyone there took the same quizzes), but unfair
-- for Faculty/Campus boards, where a "harder" department's students would
-- structurally rank below an "easier" department's students on raw points.
--
-- Fix: rank each student by their percentile *within their own department*
-- (0 = bottom of their department, 1 = top of their department), then use
-- that percentile — not raw points — to sort Faculty/Campus boards. A
-- department's own board still sorts by points since that comparison is
-- already apples-to-apples.

create or replace view leaderboard_normalized as
select
  p.id,
  p.name,
  p.total_points as points,
  d.name as department,
  d.faculty as faculty,
  case
    -- percent_rank() always returns 0 for a department with only one student,
    -- which would incorrectly show them at the bottom. Treat a lone student
    -- as top-of-department by default instead.
    when count(*) over (partition by p.department_id) = 1 then 1.0
    else percent_rank() over (partition by p.department_id order by p.total_points asc)
  end as department_percentile
from profiles p
join departments d on d.id = p.department_id;

-- Usage from the client:
--   Department board: query `leaderboard`, order by points desc
--   Faculty board:    query `leaderboard_normalized`, filter by faculty,
--                      order by department_percentile desc, points desc
--   Campus board:     query `leaderboard_normalized`, no filter,
--                      order by department_percentile desc, points desc
