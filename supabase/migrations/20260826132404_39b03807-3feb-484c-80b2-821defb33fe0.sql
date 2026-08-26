CREATE TABLE public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL UNIQUE,
  label text NOT NULL,
  schedule text NOT NULL,
  target_function text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_jobs TO anon;
GRANT SELECT ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sync_jobs"
  ON public.sync_jobs FOR SELECT USING (true);

CREATE POLICY "Service role can insert sync_jobs"
  ON public.sync_jobs FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update sync_jobs"
  ON public.sync_jobs FOR UPDATE TO service_role USING (true);

CREATE TRIGGER trg_sync_jobs_updated_at
  BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();