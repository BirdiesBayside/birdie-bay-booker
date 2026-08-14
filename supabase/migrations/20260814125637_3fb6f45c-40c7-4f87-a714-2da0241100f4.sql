ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hour_credits_used numeric(10,2) DEFAULT 0;

COMMENT ON COLUMN public.bookings.hour_credits_used IS 'Number of hour credits applied to this booking (1 credit = 1 hour).';