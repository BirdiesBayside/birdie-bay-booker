CREATE OR REPLACE FUNCTION public.accept_terms(_version text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count int;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET terms_version_accepted = _version,
         terms_accepted_at = now()
   WHERE user_id = _uid OR id = _uid;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_terms(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(text) TO authenticated;