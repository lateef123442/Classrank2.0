-- Phase 5a: Push token storage
-- Run after 001-012.
--
-- This stores the device's Expo push token so a *future* server-side sender
-- (e.g. a Supabase Edge Function triggered by a teacher publishing an
-- announcement) can target a specific user. That sending mechanism is not
-- built yet — this migration only adds the storage. The streak-risk
-- reminder introduced in this phase is a *local* notification scheduled
-- entirely on-device and doesn't need this column at all.

alter table profiles add column if not exists expo_push_token text;

-- A token is device-specific, not secret, and only meaningful paired with
-- the owning profile — no new RLS policy needed beyond the existing
-- "Users can update their own profile" policy from 001_schema.sql, which
-- already covers this column (it's not part of the `role` column-privilege
-- lockdown from 006).
