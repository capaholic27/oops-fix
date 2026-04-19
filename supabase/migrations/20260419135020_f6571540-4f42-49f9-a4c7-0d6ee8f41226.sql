-- Vote choice enum
CREATE TYPE public.vote_choice AS ENUM ('home', 'draw', 'away');

-- Votes table: one row per user per fixture
CREATE TABLE public.match_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fixture_key TEXT NOT NULL, -- format: "YYYY-MM-DD|HomeTeam|AwayTeam"
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  match_date DATE NOT NULL,
  choice public.vote_choice NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, fixture_key)
);

CREATE INDEX idx_match_votes_fixture_key ON public.match_votes (fixture_key);

ALTER TABLE public.match_votes ENABLE ROW LEVEL SECURITY;

-- Anyone signed-in can read aggregated votes
CREATE POLICY "Authenticated can read votes"
ON public.match_votes
FOR SELECT
TO authenticated
USING (true);

-- Public (anon) can also read so non-signed-in users can see results
CREATE POLICY "Public can read votes"
ON public.match_votes
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Users can create their own vote"
ON public.match_votes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vote"
ON public.match_votes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vote"
ON public.match_votes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_match_votes_updated_at
BEFORE UPDATE ON public.match_votes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();