-- =============================================
-- MIGRATION 005: Security Audit Log
-- =============================================
-- Records all gameplay mutations (XP changes, badge awards, module
-- completions, streak updates) with the client IP, user agent, and
-- full before/after snapshots. This gives you a forensic trail for
-- any future incident.
-- =============================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,           -- e.g. 'complete_module', 'award_badge', 'update_streak', 'profile_update'
  detail      JSONB DEFAULT '{}',      -- action-specific data (module_id, badge_id, xp_before, xp_after, etc.)
  ip_address  TEXT,                     -- client IP from X-Forwarded-For or direct connection
  user_agent  TEXT,                     -- client User-Agent header
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by user and time
CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON public.security_audit_log (user_id, created_at DESC);

-- Index for fast lookups by action type
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON public.security_audit_log (action, created_at DESC);

-- RLS: Only service-role can write audit logs (no client access)
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated roles
-- means only the service-role key (which bypasses RLS) can access this table.
-- This prevents attackers from reading or tampering with the audit trail.

-- Convenience function: query suspicious activity
-- Usage: SELECT * FROM get_suspicious_activity(50);
CREATE OR REPLACE FUNCTION public.get_suspicious_activity(row_limit INT DEFAULT 50)
RETURNS TABLE (
  username TEXT,
  action TEXT,
  detail JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    a.action,
    a.detail,
    a.ip_address,
    a.created_at
  FROM public.security_audit_log a
  JOIN public.profiles p ON p.id = a.user_id
  ORDER BY a.created_at DESC
  LIMIT row_limit;
$$;
