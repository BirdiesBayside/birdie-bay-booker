
-- Add total_bookings column to profiles
ALTER TABLE public.profiles ADD COLUMN total_bookings integer NOT NULL DEFAULT 0;

-- Create trigger function to maintain booking count
CREATE OR REPLACE FUNCTION public.update_profile_booking_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Handle INSERT or status change TO confirmed
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status != 'confirmed') THEN
    UPDATE profiles SET total_bookings = total_bookings + 1 WHERE user_id = NEW.user_id;
  END IF;

  -- Handle status change FROM confirmed (cancel, etc)
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
    UPDATE profiles SET total_bookings = GREATEST(total_bookings - 1, 0) WHERE user_id = NEW.user_id;
  END IF;

  -- Handle DELETE of confirmed booking
  IF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE profiles SET total_bookings = GREATEST(total_bookings - 1, 0) WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_update_profile_booking_count
AFTER INSERT OR UPDATE OF status OR DELETE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_booking_count();

-- Backfill existing counts
UPDATE profiles p
SET total_bookings = COALESCE(sub.cnt, 0)
FROM (
  SELECT user_id, COUNT(*) as cnt
  FROM bookings
  WHERE status = 'confirmed'
  GROUP BY user_id
) sub
WHERE p.user_id = sub.user_id;
