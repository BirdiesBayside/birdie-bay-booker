
-- Update the booking_availability view to include pending bookings created within the last 10 minutes
-- This prevents race conditions where two users try to book the same slot simultaneously
DROP VIEW IF EXISTS public.booking_availability;

CREATE VIEW public.booking_availability AS
SELECT bay_id, booking_date, start_time, end_time
FROM bookings
WHERE status = 'confirmed'
   OR (status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes');

-- Create a function to check for overlapping bookings BEFORE insert (including pending)
CREATE OR REPLACE FUNCTION public.prevent_overlapping_booking_insert()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count INTEGER;
  existing_booking RECORD;
BEGIN
  -- Check for any overlapping bookings (confirmed or recent pending)
  SELECT COUNT(*), 
         (SELECT id FROM bookings 
          WHERE bay_id = NEW.bay_id 
            AND booking_date = NEW.booking_date
            AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND (status = 'confirmed' OR (status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes'))
            AND start_time < NEW.end_time 
            AND end_time > NEW.start_time
          LIMIT 1) as conflicting_id
  INTO overlap_count
  FROM bookings
  WHERE bay_id = NEW.bay_id
    AND booking_date = NEW.booking_date
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (status = 'confirmed' OR (status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes'))
    AND start_time < NEW.end_time 
    AND end_time > NEW.start_time;

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'This time slot is no longer available. Please select a different time or bay.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to prevent overlapping bookings on INSERT
DROP TRIGGER IF EXISTS prevent_booking_overlap_insert ON public.bookings;
CREATE TRIGGER prevent_booking_overlap_insert
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_overlapping_booking_insert();

-- Create a function to clean up stale pending bookings (older than 15 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_bookings()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM bookings
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '15 minutes'
    AND stripe_payment_intent_id IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule cleanup to run every 5 minutes using pg_cron
SELECT cron.schedule(
  'cleanup-stale-pending-bookings',
  '*/5 * * * *',
  $$SELECT public.cleanup_stale_pending_bookings()$$
);
