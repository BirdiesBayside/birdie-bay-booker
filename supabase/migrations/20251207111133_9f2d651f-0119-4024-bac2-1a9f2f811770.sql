-- Add deposit_balance column to profiles
ALTER TABLE public.profiles
ADD COLUMN deposit_balance numeric NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.deposit_balance IS 'Customer credit balance from gift cards/deposits that can be used for bookings';