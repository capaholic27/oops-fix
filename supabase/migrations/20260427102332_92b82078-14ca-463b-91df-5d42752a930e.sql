CREATE TABLE IF NOT EXISTS public.team_injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL UNIQUE,
  season integer,
  league_code text,
  injuries jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'api-football',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read team_injuries"
  ON public.team_injuries FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert team_injuries"
  ON public.team_injuries FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update team_injuries"
  ON public.team_injuries FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can delete team_injuries"
  ON public.team_injuries FOR DELETE
  TO service_role
  USING (true);

CREATE TRIGGER update_team_injuries_updated_at
  BEFORE UPDATE ON public.team_injuries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();