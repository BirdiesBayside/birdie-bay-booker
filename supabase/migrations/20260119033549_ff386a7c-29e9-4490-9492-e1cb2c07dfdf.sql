-- Create a function to check for overlapping bookings
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count INTEGER;
BEGIN
  -- Check for overlapping bookings in the same bay on the same date
  -- Excludes cancelled bookings and the current booking (for updates)
  SELECT COUNT(*) INTO overlap_count
  FROM public.bookings
  WHERE bay_id = NEW.bay_id
    AND booking_date = NEW.booking_date
    AND status != 'cancelled'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      -- New booking starts during an existing booking
      (NEW.start_time >= start_time AND NEW.start_time < end_time)
      OR
      -- New booking ends during an existing booking
      (NEW.end_time > start_time AND NEW.end_time <= end_time)
      OR
      -- New booking completely contains an existing booking
      (NEW.start_time <= start_time AND NEW.end_time >= end_time)
    );

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Booking overlap detected: Bay % already has a booking during this time slot on %', 
      NEW.bay_id, NEW.booking_date
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs BEFORE insert or update
DROP TRIGGER IF EXISTS prevent_booking_overlap ON public.bookings;
CREATE TRIGGER prevent_booking_overlap
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_booking_overlap();