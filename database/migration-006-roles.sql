-- =============================================
-- MIGRATION 006: Add Role Column to Profiles
-- =============================================
-- Adds the role column that enables admin/professor/student
-- access control. Protected by RLS so users can't self-promote.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'
  CHECK (role IN ('student', 'professor', 'admin'));

-- Re-create the hardened RLS policy to also protect the role column
DROP POLICY IF EXISTS "Users can update own cosmetic profile" ON public.profiles;

CREATE POLICY "Users can update own cosmetic profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    xp           = (SELECT p.xp FROM public.profiles p WHERE p.id = id)
    AND level    = (SELECT p.level FROM public.profiles p WHERE p.id = id)
    AND rank     = (SELECT p.rank FROM public.profiles p WHERE p.id = id)
    AND badges   = (SELECT p.badges FROM public.profiles p WHERE p.id = id)
    AND streak   = (SELECT p.streak FROM public.profiles p WHERE p.id = id)
    AND role     = (SELECT p.role FROM public.profiles p WHERE p.id = id)
    AND completed_modules = (SELECT p.completed_modules FROM public.profiles p WHERE p.id = id)
    AND COALESCE(earned_badges, '{}') = (SELECT COALESCE(p.earned_badges, '{}') FROM public.profiles p WHERE p.id = id)
    AND COALESCE(last_active_date, '1970-01-01') = (SELECT COALESCE(p.last_active_date, '1970-01-01') FROM public.profiles p WHERE p.id = id)
  );
