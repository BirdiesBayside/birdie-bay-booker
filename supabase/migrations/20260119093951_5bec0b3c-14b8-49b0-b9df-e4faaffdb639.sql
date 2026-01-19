
-- Fix the security definer view by recreating it with explicit security invoker
DROP VIEW IF EXISTS public.booking_availability;

CREATE VIEW public.booking_availability 
WITH (security_invoker = true) AS
SELECT bay_id, booking_date, start_time, end_time
FROM bookings
WHERE status = 'confirmed'
   OR (status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes');

-- Also fix the cleanup function search path
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_bookings()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.bookings
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '15 minutes'
    AND stripe_payment_intent_id IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
