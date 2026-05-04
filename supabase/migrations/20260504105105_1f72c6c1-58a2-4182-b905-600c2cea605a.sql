CREATE OR REPLACE FUNCTION public.canon_team(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(name, ''));
  -- Strip common prefixes/suffixes used by football-data.co.uk vs Fotmob.
  s := regexp_replace(s, '^afc\s+', '', 'g');
  s := regexp_replace(s, '\s+afc$', '', 'g');
  s := regexp_replace(s, '\s+fc$', '', 'g');
  s := regexp_replace(s, '\s+united$', '', 'g');
  s := regexp_replace(s, '\s+utd$', '', 'g');
  s := regexp_replace(s, '\s+city$', '', 'g');
  s := regexp_replace(s, '\s+wanderers$', '', 'g');
  s := regexp_replace(s, '\s+hotspur$', '', 'g');
  s := regexp_replace(s, '\s*&\s*hove\s*albion$', '', 'g');
  s := regexp_replace(s, '\s+and\s+hove\s+albion$', '', 'g');
  s := replace(s, 'manchester', 'man');
  s := replace(s, 'wolverhampton', 'wolves');
  s := replace(s, 'nott''m', 'nottingham');
  s := replace(s, 'paris saint-germain', 'psg');
  s := replace(s, 'paris saint germain', 'psg');
  s := replace(s, 'paris sg', 'psg');
  s := replace(s, 'inter milan', 'inter');
  s := replace(s, 'internazionale', 'inter');
  s := replace(s, 'ac milan', 'milan');
  s := replace(s, 'borussia dortmund', 'dortmund');
  s := replace(s, 'borussia m''gladbach', 'monchengladbach');
  s := replace(s, 'borussia monchengladbach', 'monchengladbach');
  s := replace(s, 'borussia mönchengladbach', 'monchengladbach');
  s := replace(s, 'bayern munich', 'bayern');
  s := replace(s, 'bayern münchen', 'bayern');
  s := replace(s, 'rb leipzig', 'leipzig');
  s := replace(s, 'bayer leverkusen', 'leverkusen');
  s := replace(s, 'athletic bilbao', 'athletic');
  s := replace(s, 'athletic club', 'athletic');
  s := replace(s, 'atletico madrid', 'atletico');
  s := replace(s, 'atlético madrid', 'atletico');
  s := replace(s, 'atlético', 'atletico');
  s := replace(s, 'real betis', 'betis');
  s := regexp_replace(s, '[^a-z0-9 ]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN btrim(s);
END;
$$;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY match_date,
                        public.canon_team(home_team),
                        public.canon_team(away_team)
           ORDER BY length(home_team) + length(away_team) DESC,
                    season DESC,
                    created_at DESC
         ) AS rn
  FROM public.matches
)
DELETE FROM public.matches m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;