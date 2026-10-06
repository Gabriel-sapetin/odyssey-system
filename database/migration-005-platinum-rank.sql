-- MIGRATION 005: Add Platinum rank tier
-- Users reach Platinum at level 115.

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  "position" BIGINT,
  username TEXT,
  xp INT,
  level INT,
  rank TEXT,
  character TEXT,
  avatar TEXT,
  badge_count INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_number() OVER (ORDER BY COALESCE(p.xp, 0) DESC, p.username ASC)::BIGINT AS "position",
    p.username,
    COALESCE(p.xp, 0)::INT AS xp,
    GREATEST(1, FLOOR(COALESCE(p.xp, 0)::NUMERIC / 20))::INT AS level,
    CASE
      WHEN GREATEST(1, FLOOR(COALESCE(p.xp, 0)::NUMERIC / 20)) >= 115 THEN 'Platinum'
      WHEN GREATEST(1, FLOOR(COALESCE(p.xp, 0)::NUMERIC / 20)) >= 75 THEN 'Gold'
      WHEN GREATEST(1, FLOOR(COALESCE(p.xp, 0)::NUMERIC / 20)) >= 30 THEN 'Silver'
      ELSE 'Bronze'
    END AS rank,
    COALESCE(p.character, 'Kernel Penguin') AS character,
    COALESCE(p.avatar, '../../assets/penguin-flower-removebg-preview.png') AS avatar,
    COALESCE(array_length(p.earned_badges, 1), 0)::INT AS badge_count
  FROM public.profiles p
  ORDER BY COALESCE(p.xp, 0) DESC, p.username ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;
