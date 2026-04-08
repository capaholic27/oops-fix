CREATE POLICY "Service role can insert matches"
ON public.matches
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete matches"
ON public.matches
FOR DELETE
TO service_role
USING (true);