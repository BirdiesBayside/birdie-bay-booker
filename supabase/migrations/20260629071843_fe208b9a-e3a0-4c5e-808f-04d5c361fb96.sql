
-- Trigger function: when a profile is staff + linked to SGT, ensure sgt_members.exempt_from_cleanup = true
CREATE OR REPLACE FUNCTION public.sync_staff_sgt_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sgt_user_id IS NOT NULL AND NEW.custom_segment = 'staff' THEN
    UPDATE public.sgt_members
       SET exempt_from_cleanup = true,
           updated_at = now()
     WHERE user_id = NEW.sgt_user_id
       AND exempt_from_cleanup = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_staff_sgt_exempt ON public.profiles;
CREATE TRIGGER trg_sync_staff_sgt_exempt
AFTER INSERT OR UPDATE OF custom_segment, sgt_user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_sgt_exempt();

-- Backfill: flag any existing staff profile's SGT account as exempt
UPDATE public.sgt_members m
   SET exempt_from_cleanup = true,
       updated_at = now()
  FROM public.profiles p
 WHERE p.sgt_user_id = m.user_id
   AND p.custom_segment = 'staff'
   AND m.exempt_from_cleanup = false;
