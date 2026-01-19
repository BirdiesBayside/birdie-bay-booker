-- Temporarily disable the overlap trigger to cancel Liam's booking
ALTER TABLE public.bookings DISABLE TRIGGER prevent_booking_overlap;

-- Cancel Liam's booking (keeping payment)
UPDATE bookings 
SET status = 'cancelled', updated_at = NOW()
WHERE id = 'b26910e7-c37a-4fdd-be87-00e645857495';

-- Re-enable the overlap trigger
ALTER TABLE public.bookings ENABLE TRIGGER prevent_booking_overlap;