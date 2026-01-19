-- Update the cleanup function to delete pending bookings older than 10 minutes
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.bookings 
  WHERE status = 'pending' 
    AND created_at < NOW() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Update the cron job to run every 5 minutes for 10-minute expiry
SELECT cron.unschedule('cleanup-stale-pending-bookings');
SELECT cron.schedule(
  'cleanup-stale-pending-bookings',
  '*/5 * * * *',
  $$SELECT public.cleanup_stale_pending_bookings()$$
);

-- Update trigger to prevent ANY overlapping bookings (pending blocks the slot entirely)
CREATE OR REPLACE FUNCTION public.prevent_overlapping_booking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check for ANY existing booking (pending or confirmed) that overlaps
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bay_id = NEW.bay_id
      AND booking_date = NEW.booking_date
      AND status IN ('pending', 'confirmed')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        (NEW.start_time < end_time AND NEW.end_time > start_time)
      )
  ) THEN
    RAISE EXCEPTION 'This time slot is no longer available. Please select a different time or bay.';
  END IF;
  
  RETURN NEW;
END;
$$;