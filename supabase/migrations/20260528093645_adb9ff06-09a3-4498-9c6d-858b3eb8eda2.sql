
CREATE OR REPLACE FUNCTION public.block_booking_on_payment_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  failed_at timestamptz;
BEGIN
  -- Admins bypass this check (so staff can still create bookings if needed)
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT payment_failed_at INTO failed_at
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  IF failed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Your last membership payment didn''t go through. Please update your card on file before booking again.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_booking_on_payment_failure ON public.bookings;
CREATE TRIGGER trg_block_booking_on_payment_failure
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.block_booking_on_payment_failure();
