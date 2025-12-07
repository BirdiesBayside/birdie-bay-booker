-- Create a secure view for availability checking that only exposes scheduling data
CREATE OR REPLACE VIEW public.booking_availability AS
SELECT 
  bay_id,
  booking_date,
  start_time,
  end_time
FROM public.bookings
WHERE status = 'confirmed';

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.booking_availability TO anon, authenticated;

-- Drop the overly permissive policy that exposes all booking details
DROP POLICY IF EXISTS "Anyone can check availability" ON public.bookings;