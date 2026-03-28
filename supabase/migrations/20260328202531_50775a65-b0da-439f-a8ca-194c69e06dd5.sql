
CREATE TABLE public.fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_code text NOT NULL,
  league_name text NOT NULL,
  match_date date NOT NULL,
  match_time text,
  home_team text NOT NULL,
  away_team text NOT NULL,
  referee text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (league_code, match_date, home_team, away_team)
);

ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fixtures" ON public.fixtures FOR SELECT TO public USING (true);
