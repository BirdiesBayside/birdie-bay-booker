-- Add custom_billing flag to profiles table
ALTER TABLE public.profiles 
ADD COLUMN custom_billing boolean NOT NULL DEFAULT false;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.profiles.custom_billing IS 'When true, Stripe webhooks will not automatically change this user membership tier. Used for customers with special billing arrangements.';