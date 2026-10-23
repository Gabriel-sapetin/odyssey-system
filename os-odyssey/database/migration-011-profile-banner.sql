-- Migration 011: Shared profile banner selection
-- Store the selected banner on the account so it can be shown to classmates.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_banner TEXT NOT NULL DEFAULT 'bg-mountains-purple';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_banner_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_banner_check
  CHECK (profile_banner IN (
    'bg-mountains-purple',
    'bg-mountains-day',
    'bg-mountains-sunrise',
    'bg-forest-lantern',
    'hero-bg-day',
    'hero-bg-night'
  ));
