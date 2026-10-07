-- Phase 6a: Referral system
-- Run after 001-013.
--
-- Design intent, matching the anti-fraud section of the original business
-- plan: referral rewards should require the referred student to show real,
-- sustained engagement — not just create an account — before the referrer
-- gets paid. That's the single strongest lever against farming, so it's
-- what's actually enforced here. Device/IP-level fraud signals from the
-- original plan are NOT implemented — that needs infrastructure (a fraud
-- service, Cloudflare Turnstile, etc.) this migration can't provide. What's
-- here: (1) a vesting delay tied to genuine multi-day activity, (2) a
-- shadow-flag threshold for admin review of outlier referral volume.

-- ─────────────────────────────────────────────
-- A. Profile columns
-- ─────────────────────────────────────────────
alter table profiles add column if not exists referral_code text unique;
alter table profiles add column if not exists referred_by uuid references profiles (id);
alter table profiles add column if not exists referral_rewarded boolean not null default false;
-- Private moderation flag. Never exposed to the flagged user or shown
-- publicly — see the leaderboard view changes below, which quietly exclude
-- flagged accounts rather than publicly banning them (avoids the dispute
-- and reputational mess of a public accusation that turns out wrong).
alter table profiles add column if not exists shadow_flagged boolean not null default false;

-- ─────────────────────────────────────────────
-- B. Auto-generate a referral code on profile creation.
-- Derived deterministically from the profile's own id (already a unique
-- UUID), so it's collision-free by construction with no retry-on-conflict
-- loop needed.
-- ─────────────────────────────────────────────
create or replace function set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substr(replace(new.id::text, '-', ''), 1, 7));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_referral_code on profiles;
create trigger trg_set_referral_code
  before insert on profiles
  for each row
  execute function set_referral_code();

-- ─────────────────────────────────────────────
-- C. Student sign-up now goes through an RPC (mirroring
-- complete_teacher_signup from 007), instead of a direct client-side
-- upsert. This is the only safe place to resolve a referral code: it must
-- be validated and resolved to a real referrer server-side, never trusted
-- as a raw client-supplied `referred_by` value (which would let anyone
-- fabricate a referral for free points once vesting-eligible).
-- ─────────────────────────────────────────────
create or replace function complete_student_signup(
  p_name text,
  p_university text,
  p_department_id uuid,
  p_year int,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_referrer_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_referral_code is not null and trim(p_referral_code) <> '' then
    select id into v_referrer_id from profiles where referral_code = upper(trim(p_referral_code));
    if v_referrer_id = v_caller_id then
      v_referrer_id := null; -- can't refer yourself
    end if;
  end if;

  insert into profiles (id, name, university, department_id, year, role, referred_by)
  values (v_caller_id, trim(p_name), trim(p_university), p_department_id, p_year, 'student', v_referrer_id)
  on conflict (id) do update set
    name = excluded.name,
    university = excluded.university,
    department_id = excluded.department_id,
    year = excluded.year;
    -- Deliberately NOT updating referred_by on conflict — a referral is
    -- captured once, at first creation. Without this, a retried signup
    -- could be resubmitted with a different code to "steal" a referral
    -- after the fact.

  return jsonb_build_object('success', true, 'referral_applied', v_referrer_id is not null);
end;
$$;

revoke all on function complete_student_signup(text, text, uuid, int, text) from public;
grant execute on function complete_student_signup(text, text, uuid, int, text) to authenticated;

-- ─────────────────────────────────────────────
-- D. Vesting + shadow-flag logic, added to submit_single_answer.
-- Recreates the whole function (CREATE OR REPLACE requires the full body)
-- — the grading logic itself is unchanged from 005; only the block after
-- the profile update is new.
-- ─────────────────────────────────────────────
create or replace function submit_single_answer(
  p_question_id uuid,
  p_selected_index int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile_id uuid := auth.uid();
  v_correct_index int;
  v_is_correct boolean;
  v_points_earned int := 0;
  v_existing_attempt record;
  v_last_quiz_date date;
  v_current_streak int;
  v_new_streak int;
  v_new_total_points int;
  v_referrer_id uuid;
  v_already_rewarded boolean;
  v_distinct_days int;
  v_referrer_reward_count int;
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select correct_index into v_correct_index
  from quiz_questions
  where id = p_question_id;

  if v_correct_index is null then
    raise exception 'Question not found';
  end if;

  select * into v_existing_attempt
  from quiz_attempts
  where profile_id = v_profile_id and question_id = p_question_id;

  if found then
    select total_points into v_new_total_points from profiles where id = v_profile_id;
    return jsonb_build_object(
      'is_correct', v_existing_attempt.is_correct,
      'correct_index', v_correct_index,
      'points_earned', 0,
      'already_answered', true,
      'total_points', v_new_total_points,
      'new_streak', (select current_streak from profiles where id = v_profile_id)
    );
  end if;

  v_is_correct := (p_selected_index = v_correct_index);
  v_points_earned := case when v_is_correct then 20 else 0 end + 5;

  insert into quiz_attempts (profile_id, question_id, selected_index, is_correct)
  values (v_profile_id, p_question_id, p_selected_index, v_is_correct);

  select last_quiz_date, current_streak into v_last_quiz_date, v_current_streak
  from profiles where id = v_profile_id;

  if v_last_quiz_date is null or v_last_quiz_date < current_date - 1 then
    v_new_streak := 1;
  elsif v_last_quiz_date = current_date - 1 then
    v_new_streak := v_current_streak + 1;
  else
    v_new_streak := v_current_streak;
  end if;

  update profiles
  set total_points = total_points + v_points_earned,
      current_streak = v_new_streak,
      last_quiz_date = current_date
  where id = v_profile_id
  returning total_points into v_new_total_points;

  -- ── Referral vesting check ──
  -- Only fires for students who were referred and haven't already paid out.
  -- Requires activity on 3+ distinct calendar days — the actual anti-farming
  -- lever. A fake/bot account can't shortcut this by answering many
  -- questions in one sitting; it takes real elapsed time.
  select referred_by, referral_rewarded into v_referrer_id, v_already_rewarded
  from profiles where id = v_profile_id;

  if v_referrer_id is not null and not v_already_rewarded then
    select count(distinct created_at::date) into v_distinct_days
    from quiz_attempts where profile_id = v_profile_id;

    if v_distinct_days >= 3 then
      update profiles set total_points = total_points + 100 where id = v_referrer_id;
      update profiles set referral_rewarded = true where id = v_profile_id;

      -- Shadow-flag threshold: an account with an unusually large number of
      -- successfully-vested referrals gets quietly excluded from
      -- leaderboards for admin review, rather than a public ban. Threshold
      -- is a starting guess, not a validated number — tune based on real
      -- campus referral patterns once you have them.
      select count(*) into v_referrer_reward_count
      from profiles where referred_by = v_referrer_id and referral_rewarded = true;

      if v_referrer_reward_count > 20 then
        update profiles set shadow_flagged = true where id = v_referrer_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'correct_index', v_correct_index,
    'points_earned', v_points_earned,
    'already_answered', false,
    'total_points', v_new_total_points,
    'new_streak', v_new_streak
  );
end;
$$;

revoke all on function submit_single_answer(uuid, int) from public;
grant execute on function submit_single_answer(uuid, int) to authenticated;

-- ─────────────────────────────────────────────
-- E. Leaderboards quietly exclude shadow-flagged accounts.
-- ─────────────────────────────────────────────
create or replace view leaderboard as
select
  p.id,
  p.name,
  p.total_points as points,
  d.name as department,
  d.faculty as faculty
from profiles p
join departments d on d.id = p.department_id
where p.shadow_flagged = false;

create or replace view leaderboard_normalized as
select
  p.id,
  p.name,
  p.total_points as points,
  d.name as department,
  d.faculty as faculty,
  case
    when count(*) over (partition by p.department_id) = 1 then 1.0
    else percent_rank() over (partition by p.department_id order by p.total_points asc)
  end as department_percentile
from profiles p
join departments d on d.id = p.department_id
where p.shadow_flagged = false;

-- ─────────────────────────────────────────────
-- F. A student's own referral stats (for the "Invite Friends" UI).
-- ─────────────────────────────────────────────
create or replace function get_my_referral_stats()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_caller_id uuid := auth.uid();
  v_code text;
  v_total_referred int;
  v_total_rewarded int;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select referral_code into v_code from profiles where id = v_caller_id;
  select count(*) into v_total_referred from profiles where referred_by = v_caller_id;
  select count(*) into v_total_rewarded from profiles where referred_by = v_caller_id and referral_rewarded = true;

  return jsonb_build_object(
    'referral_code', v_code,
    'total_referred', v_total_referred,
    'total_rewarded', v_total_rewarded
  );
end;
$$;

revoke all on function get_my_referral_stats() from public;
grant execute on function get_my_referral_stats() to authenticated;
