-- PROFILES TABLE
-- Stores user profile data (replaces localStorage)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  username    TEXT NOT NULL,
  character   TEXT DEFAULT 'Kernel Penguin',
  avatar      TEXT DEFAULT '../../assets/penguin-flower-removebg-preview.png',
  level       INT DEFAULT 1,
  xp          INT DEFAULT 20,
  rank        TEXT DEFAULT 'Bronze',
  badges      INT DEFAULT 0,
  streak      INT DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ROW LEVEL SECURITY (RLS)
-- Each user can only read/update their own row
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- AUTO-CREATE PROFILE ON SIGNUP
-- Trigger that runs when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    SPLIT_PART(NEW.email, '@', 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- MIGRATION 001: Module tracking & learner count
-- (Already applied)
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS completed_modules TEXT[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.get_learner_count()
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM public.profiles;
$$ LANGUAGE sql SECURITY DEFINER;
