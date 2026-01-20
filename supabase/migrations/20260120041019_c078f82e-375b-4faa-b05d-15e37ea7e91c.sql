-- Update the booking overlap prevention trigger to also check bay_blocks
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
    RAISE EXCEPTION 'This time slot overlaps with an existing booking';
  END IF;

  -- Check for ANY existing bay block that overlaps
  IF EXISTS (
    SELECT 1 FROM public.bay_blocks
    WHERE bay_id = NEW.bay_id
      AND block_date = NEW.booking_date
      AND (
        (NEW.start_time < end_time AND NEW.end_time > start_time)
      )
  ) THEN
    RAISE EXCEPTION 'This time slot is blocked by the facility';
  END IF;

  RETURN NEW;
END;
$$;