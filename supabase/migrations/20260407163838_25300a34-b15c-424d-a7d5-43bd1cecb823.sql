CREATE POLICY "Service role can delete fixtures"
ON public.fixtures
FOR DELETE
TO service_role
USING (true);

CREATE POLICY "Service role can insert fixtures"
ON public.fixtures
FOR INSERT
TO service_role
WITH CHECK (true);