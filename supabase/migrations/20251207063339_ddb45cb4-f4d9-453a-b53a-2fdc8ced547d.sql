-- Add payment tracking columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pending';

-- Add index for payment lookups
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_payment_intent 
ON public.bookings(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for refund processing';
COMMENT ON COLUMN public.bookings.payment_method IS 'Payment method used: stripe, stripe_inperson, cash, pending';