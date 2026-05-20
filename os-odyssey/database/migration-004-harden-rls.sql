-- =============================================
-- MIGRATION 004: Harden RLS — Block direct XP manipulation
-- =============================================
-- PROBLEM: The original "Users can update own profile" policy allows
-- authenticated users to UPDATE *any* column on their own row,
-- including xp, level, rank, completed_modules, etc.
-- An attacker can open the browser console and run:
--   supabase.from('profiles').update({ xp: 99999 }).eq('id', myId)
-- and instantly become #1 on the leaderboard.
--
-- FIX: Replace the blanket UPDATE policy with one that only permits
-- changes to cosmetic columns (username, character, avatar).
-- All gameplay columns (xp, level, rank, badges, streak, etc.) can
-- only be written by the service-role key used by the backend.
-- =============================================

-- Step 1: Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Step 2: Create a restricted policy that only allows cosmetic updates.
-- The trick: use a CHECK expression that ensures gameplay columns
-- remain unchanged. If the user tries to modify xp, level, rank, etc.,
-- the UPDATE is rejected by RLS.
CREATE POLICY "Users can update own cosmetic profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- Ensure gameplay columns are NOT being changed.
    -- Compare NEW values to OLD values for every protected column.
    xp           = (SELECT p.xp FROM public.profiles p WHERE p.id = id)
    AND level    = (SELECT p.level FROM public.profiles p WHERE p.id = id)
    AND rank     = (SELECT p.rank FROM public.profiles p WHERE p.id = id)
    AND badges   = (SELECT p.badges FROM public.profiles p WHERE p.id = id)
    AND streak   = (SELECT p.streak FROM public.profiles p WHERE p.id = id)
    AND completed_modules = (SELECT p.completed_modules FROM public.profiles p WHERE p.id = id)
    AND COALESCE(earned_badges, '{}') = (SELECT COALESCE(p.earned_badges, '{}') FROM public.profiles p WHERE p.id = id)
    AND COALESCE(last_active_date, '1970-01-01') = (SELECT COALESCE(p.last_active_date, '1970-01-01') FROM public.profiles p WHERE p.id = id)
  );

-- NOTE: The backend uses the service-role key (get_admin_client()),
-- which bypasses RLS entirely, so backend writes to xp/level/rank
-- will continue to work. This policy ONLY restricts direct client-side
-- access via the anon key.
