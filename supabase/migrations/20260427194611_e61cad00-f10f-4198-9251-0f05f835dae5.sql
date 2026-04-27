DROP POLICY IF EXISTS "Service role can insert api_quota" ON public.api_quota;
DROP POLICY IF EXISTS "Service role can update api_quota" ON public.api_quota;

CREATE POLICY "Service role can insert api_quota" ON public.api_quota
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update api_quota" ON public.api_quota
  FOR UPDATE TO service_role USING (true);

REVOKE EXECUTE ON FUNCTION public.increment_api_quota(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_api_quota(integer) TO service_role;