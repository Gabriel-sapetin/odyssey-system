-- =============================================
-- MIGRATION 007: Classroom Feature Tables
-- =============================================
-- Creates the 6 tables needed for the classroom system:
-- classrooms, classroom_members, classroom_modules,
-- classroom_quizzes, classroom_quiz_questions, classroom_quiz_attempts
-- =============================================

-- 1. Classrooms
CREATE TABLE IF NOT EXISTS public.classrooms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  join_code      TEXT UNIQUE NOT NULL,
  is_active      BOOLEAN DEFAULT true,
  max_students   INT DEFAULT 100,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 2. Classroom Members
CREATE TABLE IF NOT EXISTS public.classroom_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id   UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);

-- 3. Classroom Modules (professor-uploaded lessons)
CREATE TABLE IF NOT EXISTS public.classroom_modules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id   UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  content        TEXT,
  order_index    INT DEFAULT 1,
  is_published   BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. Classroom Quizzes
CREATE TABLE IF NOT EXISTS public.classroom_quizzes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  module_id        UUID REFERENCES public.classroom_modules(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  is_ai_generated  BOOLEAN DEFAULT false,
  time_limit_minutes INT,
  is_published     BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 5. Classroom Quiz Questions
CREATE TABLE IF NOT EXISTS public.classroom_quiz_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID NOT NULL REFERENCES public.classroom_quizzes(id) ON DELETE CASCADE,
  question_text    TEXT NOT NULL,
  question_type    TEXT DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  options          JSONB,
  correct_answer   TEXT NOT NULL,
  explanation      TEXT,
  order_index      INT DEFAULT 1,
  points           INT DEFAULT 1
);

-- 6. Classroom Quiz Attempts
CREATE TABLE IF NOT EXISTS public.classroom_quiz_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID NOT NULL REFERENCES public.classroom_quizzes(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers        JSONB,
  score          INT DEFAULT 0,
  max_score      INT DEFAULT 0,
  started_at     TIMESTAMPTZ DEFAULT now(),
  submitted_at   TIMESTAMPTZ
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_classroom_members_student ON public.classroom_members(student_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_classroom ON public.classroom_members(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_quizzes_classroom ON public.classroom_quizzes(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_quiz_attempts_student ON public.classroom_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_classroom_quiz_attempts_quiz ON public.classroom_quiz_attempts(quiz_id);

-- RLS: All classroom tables accessible only via service-role (backend)
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_quiz_attempts ENABLE ROW LEVEL SECURITY;
