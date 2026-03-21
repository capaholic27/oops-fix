
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_code text NOT NULL,
  league_name text NOT NULL,
  season text NOT NULL,
  match_date date NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  ft_home_goals int DEFAULT 0,
  ft_away_goals int DEFAULT 0,
  ft_result text,
  ht_home_goals int DEFAULT 0,
  ht_away_goals int DEFAULT 0,
  ht_result text,
  home_shots int DEFAULT 0,
  away_shots int DEFAULT 0,
  home_shots_target int DEFAULT 0,
  away_shots_target int DEFAULT 0,
  home_fouls int DEFAULT 0,
  away_fouls int DEFAULT 0,
  home_corners int DEFAULT 0,
  away_corners int DEFAULT 0,
  home_yellows int DEFAULT 0,
  away_yellows int DEFAULT 0,
  home_reds int DEFAULT 0,
  away_reds int DEFAULT 0,
  referee text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(league_code, season, match_date, home_team, away_team)
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read matches" ON public.matches FOR SELECT USING (true);
