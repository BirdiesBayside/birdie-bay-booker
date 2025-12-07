-- Add custom_hourly_rate to profiles for dynamic pricing
ALTER TABLE public.profiles 
ADD COLUMN custom_hourly_rate NUMERIC DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN public.profiles.custom_hourly_rate IS 'Optional custom hourly rate that overrides membership tier pricing. NULL means use tier default.';