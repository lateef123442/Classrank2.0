-- Phase 7a: Subscriptions
-- Run after 001-015.
--
-- is_pro/pro_expires_at are the server-side source of truth for
-- entitlement, updated ONLY by the RevenueCat webhook Edge Function (via
-- the service-role key, which bypasses RLS entirely — see
-- supabase/functions/revenuecat-webhook/). The client never sets these
-- directly; trusting a client-supplied "I'm a paying subscriber" flag would
-- let anyone grant themselves Pro for free with a single API call.

alter table profiles add column if not exists is_pro boolean not null default false;
alter table profiles add column if not exists pro_expires_at timestamptz;

-- Lock down client writes to these columns the same way 006 locked down
-- `role` — belt-and-suspenders alongside "the RPC layer doesn't expose a
-- way to set this," since a future contributor could otherwise add one by
-- mistake.
revoke insert (is_pro, pro_expires_at), update (is_pro, pro_expires_at) on profiles from authenticated;

-- ─────────────────────────────────────────────
-- Leaderboards surface is_pro (for a small Pro badge next to a name) —
-- CREATE OR REPLACE requires the full view definition, unchanged otherwise
-- from 014's shadow-flag-filtered version.
-- ─────────────────────────────────────────────
create or replace view leaderboard as
select
  p.id,
  p.name,
  p.total_points as points,
  d.name as department,
  d.faculty as faculty,
  p.is_pro
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
  end as department_percentile,
  p.is_pro -- must come last: CREATE OR REPLACE VIEW can only append columns after 014's list
from profiles p
join departments d on d.id = p.department_id
where p.shadow_flagged = false;

-- Helper: is this profile's Pro status actually current, not just
-- historically-true-but-expired? A subscription that lapsed shouldn't keep
-- granting the grace period just because is_pro hasn't been flipped back
-- yet by a delayed webhook (RevenueCat sends EXPIRATION events, but
-- treating pro_expires_at as the real-time check is more robust than
-- trusting is_pro alone against webhook delivery lag).
create or replace function pro_expires_at_active(p_profile_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(pro_expires_at, 'epoch'::timestamptz) > now()
  from profiles where id = p_profile_id;
$$;

revoke all on function pro_expires_at_active(uuid) from public;
grant execute on function pro_expires_at_active(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- The actual premium mechanic: "Streak Shield." Free users lose their
-- streak after missing one day (existing behavior). Pro users get a
-- one-day grace — missing a single day doesn't reset the streak, missing
-- two in a row still does. This is genuinely useful (streak loss is the
-- single biggest churn trigger in habit apps) and simple to reason about —
-- no monthly counters, no "freezes remaining" UI to track, just a
-- permanently-better rule for subscribers.
--
-- Recreates submit_single_answer in full (Postgres requires the complete
-- body for CREATE OR REPLACE) — only the streak-threshold block changed
-- from 014's version, everything else is identical.
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
  v_is_pro boolean;
  v_grace_days int;
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

  select last_quiz_date, current_streak, is_pro into v_last_quiz_date, v_current_streak, v_is_pro
  from profiles where id = v_profile_id;

  -- Free: reset if the last quiz was before yesterday (missed 1+ day).
  -- Pro: reset only if the last quiz was before the day before yesterday
  -- (missed 2+ days) — the Streak Shield grace.
  v_grace_days := case when v_is_pro and (pro_expires_at_active(v_profile_id)) then 2 else 1 end;

  if v_last_quiz_date is null or v_last_quiz_date < current_date - v_grace_days then
    v_new_streak := 1;
  elsif v_last_quiz_date = current_date then
    v_new_streak := v_current_streak; -- already answered today
  else
    v_new_streak := v_current_streak + 1; -- within grace window
  end if;

  update profiles
  set total_points = total_points + v_points_earned,
      current_streak = v_new_streak,
      last_quiz_date = current_date
  where id = v_profile_id
  returning total_points into v_new_total_points;

  select referred_by, referral_rewarded into v_referrer_id, v_already_rewarded
  from profiles where id = v_profile_id;

  if v_referrer_id is not null and not v_already_rewarded then
    select count(distinct created_at::date) into v_distinct_days
    from quiz_attempts where profile_id = v_profile_id;

    if v_distinct_days >= 3 then
      update profiles set total_points = total_points + 100 where id = v_referrer_id;
      update profiles set referral_rewarded = true where id = v_profile_id;

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
