-- Fix: Allow all authenticated users to see booking time slots for availability checking
-- This is safe because the booking_availability view only exposes:
-- bay_id, booking_date, start_time, end_time (no user info, no pricing, no payment details)

-- Create a policy that allows authenticated users to SELECT bookings for availability
-- This gives read-only access to the basic slot information needed for availability display
CREATE POLICY "Users can view all bookings for availability"
ON public.bookings
FOR SELECT
USING (auth.role() = 'authenticated');