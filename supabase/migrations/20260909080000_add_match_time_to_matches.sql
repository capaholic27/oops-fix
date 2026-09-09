-- Add match_time to the matches table so recent form can sort by actual
-- kickoff time, not just date. This fixes the "old and new matches mixed"
-- issue where same-day matches had undefined order.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS match_time text;

-- Add an index on (match_date, match_time) for efficient recent-form queries.
CREATE INDEX IF NOT EXISTS idx_matches_date_time ON public.matches (match_date, match_time);
