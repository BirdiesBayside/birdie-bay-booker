-- Update the cleanup function to use 5 minutes instead of 10 minutes
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.bookings 
  WHERE status = 'pending' 
    AND created_at < NOW() - INTERVAL '5 minutes';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;