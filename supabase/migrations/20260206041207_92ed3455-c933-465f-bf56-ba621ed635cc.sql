
-- Modify the cleanup_stale_pending_bookings function to use 10-minute timeout instead of 5
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_bookings()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.bookings
  WHERE status = 'pending' 
    AND created_at < now() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
