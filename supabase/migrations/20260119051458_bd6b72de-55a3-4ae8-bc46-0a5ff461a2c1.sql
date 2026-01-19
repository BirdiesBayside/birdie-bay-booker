-- Drop and recreate the overlap check function with smarter logic
-- This ensures:
-- 1. Confirmed bookings cannot overlap other confirmed bookings
-- 2. Pending bookings cannot overlap confirmed bookings
-- 3. Multiple pending bookings CAN overlap (first to pay wins)

CREATE OR REPLACE FUNCTION public.check_booking_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  overlap_count INTEGER;
BEGIN
  -- When confirming a booking (pending -> confirmed), check only against other confirmed bookings
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT COUNT(*) INTO overlap_count
    FROM public.bookings
    WHERE bay_id = NEW.bay_id
      AND booking_date = NEW.booking_date
      AND status = 'confirmed'
      AND id != NEW.id
      AND (
        (NEW.start_time >= start_time AND NEW.start_time < end_time)
        OR (NEW.end_time > start_time AND NEW.end_time <= end_time)
        OR (NEW.start_time <= start_time AND NEW.end_time >= end_time)
      );

    IF overlap_count > 0 THEN
      RAISE EXCEPTION 'Cannot confirm booking: Bay % already has a confirmed booking during this time slot on %', 
        NEW.bay_id, NEW.booking_date
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- For new bookings or other updates:
  -- Pending bookings can only be created if no CONFIRMED booking exists in that slot
  -- (allows multiple pending bookings to race - first to confirm wins)
  IF NEW.status = 'pending' THEN
    SELECT COUNT(*) INTO overlap_count
    FROM public.bookings
    WHERE bay_id = NEW.bay_id
      AND booking_date = NEW.booking_date
      AND status = 'confirmed'
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        (NEW.start_time >= start_time AND NEW.start_time < end_time)
        OR (NEW.end_time > start_time AND NEW.end_time <= end_time)
        OR (NEW.start_time <= start_time AND NEW.end_time >= end_time)
      );

    IF overlap_count > 0 THEN
      RAISE EXCEPTION 'This time slot is no longer available. Bay % already has a confirmed booking during this time on %', 
        NEW.bay_id, NEW.booking_date
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- For confirmed bookings being created/updated (not from pending), check against all non-cancelled
  SELECT COUNT(*) INTO overlap_count
  FROM public.bookings
  WHERE bay_id = NEW.bay_id
    AND booking_date = NEW.booking_date
    AND status IN ('confirmed', 'pending')
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      (NEW.start_time >= start_time AND NEW.start_time < end_time)
      OR (NEW.end_time > start_time AND NEW.end_time <= end_time)
      OR (NEW.start_time <= start_time AND NEW.end_time >= end_time)
    );

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Booking overlap detected: Bay % already has a booking during this time slot on %', 
      NEW.bay_id, NEW.booking_date
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;