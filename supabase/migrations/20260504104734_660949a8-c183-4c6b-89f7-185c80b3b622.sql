CREATE OR REPLACE FUNCTION public.norm_team(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(name,''), '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;