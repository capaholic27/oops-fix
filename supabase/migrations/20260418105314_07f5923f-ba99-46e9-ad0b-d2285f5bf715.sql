
CREATE TABLE public.team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  league_code text,
  season integer,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'api-football',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_name)
);

CREATE INDEX idx_team_players_team ON public.team_players (team_name);
CREATE INDEX idx_team_players_fetched ON public.team_players (fetched_at);

ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read team_players"
  ON public.team_players FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert team_players"
  ON public.team_players FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update team_players"
  ON public.team_players FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can delete team_players"
  ON public.team_players FOR DELETE
  TO service_role
  USING (true);

CREATE TRIGGER team_players_set_updated_at
  BEFORE UPDATE ON public.team_players
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
