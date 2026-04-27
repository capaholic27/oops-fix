CREATE TABLE IF NOT EXISTS public.api_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read api_quota" ON public.api_quota FOR SELECT USING (true);
CREATE POLICY "Service role can insert api_quota" ON public.api_quota FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update api_quota" ON public.api_quota FOR UPDATE USING (true);

CREATE OR REPLACE FUNCTION public.increment_api_quota(_count integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.api_quota (day, count)
  VALUES (CURRENT_DATE, _count)
  ON CONFLICT (day) DO UPDATE
    SET count = public.api_quota.count + _count,
        updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;