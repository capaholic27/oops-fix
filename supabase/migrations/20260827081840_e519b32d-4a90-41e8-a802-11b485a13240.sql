CREATE TABLE public.live_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fotmob_match_id bigint NOT NULL UNIQUE,
  league_code text,
  league_name text NOT NULL DEFAULT '',
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_goals integer NOT NULL DEFAULT 0,
  away_goals integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'live',
  status_label text,
  minute integer,
  kickoff_at timestamp with time zone,
  finished_at timestamp with time zone,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_matches TO anon;
GRANT SELECT ON public.live_matches TO authenticated;
GRANT ALL ON public.live_matches TO service_role;

ALTER TABLE public.live_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live_matches"
  ON public.live_matches FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert live_matches"
  ON public.live_matches FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update live_matches"
  ON public.live_matches FOR UPDATE TO service_role USING (true);

CREATE POLICY "Service role can delete live_matches"
  ON public.live_matches FOR DELETE TO service_role USING (true);

CREATE INDEX idx_live_matches_status ON public.live_matches (status, kickoff_at);

CREATE TRIGGER trg_live_matches_updated_at
  BEFORE UPDATE ON public.live_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_matches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_matches;