-- Drop and recreate the view with SECURITY INVOKER to use caller's permissions
DROP VIEW IF EXISTS public.booking_availability;

CREATE VIEW public.booking_availability 
WITH (security_invoker = true) AS
SELECT 
  bay_id,
  booking_date,
  start_time,
  end_time
FROM public.bookings
WHERE status = 'confirmed';

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.booking_availability TO anon, authenticated;