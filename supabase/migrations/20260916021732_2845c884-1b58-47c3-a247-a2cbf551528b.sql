CREATE OR REPLACE FUNCTION public.sync_sim_cup_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketing_segments
  SET emails = COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'email', lower(r.email),
      'first_name', split_part(r.name, ' ', 1),
      'last_name', CASE WHEN position(' ' in r.name) > 0 THEN trim(substring(r.name from position(' ' in r.name))) ELSE NULL END
    ) ORDER BY r.created_at)
    FROM public.sim_cup_registrations r
    WHERE r.email IS NOT NULL
  ), '[]'::jsonb)
  WHERE lower(name) = 'sim cup';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sim_cup_segment ON public.sim_cup_registrations;
CREATE TRIGGER trg_sync_sim_cup_segment
AFTER INSERT OR UPDATE OR DELETE ON public.sim_cup_registrations
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_sim_cup_segment();