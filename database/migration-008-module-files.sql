-- =============================================
-- MIGRATION 008: Add file_url to classroom_modules
-- =============================================
-- Allows professors to upload PDFs instead of text content.
-- =============================================

ALTER TABLE public.classroom_modules
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;
