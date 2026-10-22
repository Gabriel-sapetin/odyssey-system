-- ─────────────────────────────────────────────────────────
-- Migration 010: Instructor Application System
-- ─────────────────────────────────────────────────────────
-- Students can apply to become instructors (professors).
-- Requires verified institutional credentials and proof of teaching status.
-- Admins approve or deny applications from the admin panel.

CREATE TABLE IF NOT EXISTS public.instructor_applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL DEFAULT '',
  country             TEXT NOT NULL DEFAULT '',
  region              TEXT NOT NULL DEFAULT '',
  province            TEXT NOT NULL DEFAULT '',
  city                TEXT NOT NULL DEFAULT '',
  institution         TEXT NOT NULL DEFAULT '',
  department          TEXT NOT NULL DEFAULT '',
  position_title      TEXT NOT NULL DEFAULT '',
  years_experience    TEXT NOT NULL DEFAULT '',
  work_email          TEXT,
  phone_number        TEXT,
  subjects_taught     TEXT NOT NULL DEFAULT '',
  id_document_url     TEXT NOT NULL DEFAULT '',
  id_document_name    TEXT,
  teaching_proof_url  TEXT NOT NULL DEFAULT '',
  teaching_proof_name TEXT,
  reason              TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note         TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  reviewed_at         TIMESTAMPTZ
);

-- Ensure all columns exist if table was already created earlier
ALTER TABLE public.instructor_applications
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS institution TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS position_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS years_experience TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_email TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS subjects_taught TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS id_document_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS id_document_name TEXT,
  ADD COLUMN IF NOT EXISTS teaching_proof_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS teaching_proof_name TEXT;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_instructor_apps_user ON public.instructor_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_instructor_apps_status ON public.instructor_applications(status);

-- RLS: Users can see their own applications, admins can see all
ALTER TABLE public.instructor_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own applications" ON public.instructor_applications;
CREATE POLICY "Users can view own applications"
  ON public.instructor_applications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all applications" ON public.instructor_applications;
CREATE POLICY "Admins can view all applications"
  ON public.instructor_applications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert own applications" ON public.instructor_applications;
CREATE POLICY "Users can insert own applications"
  ON public.instructor_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pending or denied applications" ON public.instructor_applications;
CREATE POLICY "Users can update own pending or denied applications"
  ON public.instructor_applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update applications" ON public.instructor_applications;
CREATE POLICY "Admins can update applications"
  ON public.instructor_applications FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to update profiles (e.g. promoting user to professor upon approval)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow users to update their role to professor if they have an approved instructor application
DROP POLICY IF EXISTS "Users can activate professor role if approved" ON public.profiles;
CREATE POLICY "Users can activate professor role if approved"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    AND EXISTS (
      SELECT 1 FROM public.instructor_applications
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  )
  WITH CHECK (
    auth.uid() = id
    AND (role = 'professor' OR role = (SELECT p.role FROM public.profiles p WHERE p.id = id))
  );

-- Automated trigger to promote profile to professor upon application approval
CREATE OR REPLACE FUNCTION public.handle_instructor_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE public.profiles
    SET role = 'professor'
    WHERE id = NEW.user_id AND role NOT IN ('professor', 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_instructor_application_approved ON public.instructor_applications;
CREATE TRIGGER on_instructor_application_approved
  AFTER INSERT OR UPDATE ON public.instructor_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_instructor_approval();

-- Retroactively upgrade all users who have an approved application
UPDATE public.profiles
SET role = 'professor'
WHERE id IN (
  SELECT user_id FROM public.instructor_applications WHERE status = 'approved'
) AND role NOT IN ('professor', 'admin');

-- Storage bucket for instructor verification documents (Faculty ID, Teaching Proofs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('instructor-verifications', 'instructor-verifications', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload instructor verifications'
  ) THEN
    CREATE POLICY "Authenticated users can upload instructor verifications"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'instructor-verifications');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view instructor verifications'
  ) THEN
    CREATE POLICY "Anyone can view instructor verifications"
      ON storage.objects FOR SELECT
      TO authenticated, anon
      USING (bucket_id = 'instructor-verifications');
  END IF;
END $$;
