CREATE INDEX IF NOT EXISTS matches_home_team_idx ON public.matches (home_team);
CREATE INDEX IF NOT EXISTS matches_away_team_idx ON public.matches (away_team);
CREATE INDEX IF NOT EXISTS matches_league_date_idx ON public.matches (league_code, match_date);
CREATE INDEX IF NOT EXISTS fixtures_match_date_idx ON public.fixtures (match_date);
CREATE INDEX IF NOT EXISTS fixtures_home_team_idx ON public.fixtures (home_team);
CREATE INDEX IF NOT EXISTS fixtures_away_team_idx ON public.fixtures (away_team);
CREATE INDEX IF NOT EXISTS fixtures_created_at_idx ON public.fixtures (created_at DESC);