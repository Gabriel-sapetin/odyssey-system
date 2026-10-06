-- Track last active date for real-time streak calculation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- Track earned badges as an array of badge IDs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS earned_badges TEXT[] DEFAULT '{}';
