-- 1) Clean duplicate matches: when the same fixture exists under two name variants
-- (e.g. "Brighton" vs "Brighton & Hove Albion"), keep the row whose home_team is the
-- LONGER name (Fotmob form). Compare on a normalized key.
CREATE OR REPLACE FUNCTION public.norm_team(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(name,''), '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;

WITH ranked AS (
  SELECT id,
         match_date,
         league_code,
         row_number() OVER (
           PARTITION BY match_date,
             public.norm_team(
               regexp_replace(home_team, '\s*&\s*hove\s*albion|\s*hotspur|\s*united$|\s*city$|\s*wanderers$|\s*hove\s*albion', '', 'gi')
             ),
             public.norm_team(
               regexp_replace(away_team, '\s*&\s*hove\s*albion|\s*hotspur|\s*united$|\s*city$|\s*wanderers$|\s*hove\s*albion', '', 'gi')
             )
           ORDER BY length(home_team) + length(away_team) DESC, season DESC, created_at DESC
         ) AS rn
  FROM public.matches
)
DELETE FROM public.matches m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2) Standings cache: one row per league with the full Fotmob standings table.
CREATE TABLE IF NOT EXISTS public.standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_code text NOT NULL UNIQUE,
  league_name text NOT NULL,
  season text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read standings" ON public.standings;
CREATE POLICY "Anyone can read standings" ON public.standings
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Service role can insert standings" ON public.standings;
CREATE POLICY "Service role can insert standings" ON public.standings
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update standings" ON public.standings;
CREATE POLICY "Service role can update standings" ON public.standings
  FOR UPDATE TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can delete standings" ON public.standings;
CREATE POLICY "Service role can delete standings" ON public.standings
  FOR DELETE TO service_role USING (true);

DROP TRIGGER IF EXISTS trg_standings_updated_at ON public.standings;
CREATE TRIGGER trg_standings_updated_at
  BEFORE UPDATE ON public.standings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Team logos cache: maps any team name to a Fotmob teamId + logo URL.
CREATE TABLE IF NOT EXISTS public.team_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL UNIQUE,
  fotmob_id bigint,
  logo_url text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read team_logos" ON public.team_logos;
CREATE POLICY "Anyone can read team_logos" ON public.team_logos
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Service role can insert team_logos" ON public.team_logos;
CREATE POLICY "Service role can insert team_logos" ON public.team_logos
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update team_logos" ON public.team_logos;
CREATE POLICY "Service role can update team_logos" ON public.team_logos
  FOR UPDATE TO service_role USING (true);

DROP TRIGGER IF EXISTS trg_team_logos_updated_at ON public.team_logos;
CREATE TRIGGER trg_team_logos_updated_at
  BEFORE UPDATE ON public.team_logos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_team_logos_lower_name ON public.team_logos (lower(team_name));