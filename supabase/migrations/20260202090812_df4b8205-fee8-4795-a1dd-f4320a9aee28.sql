-- Add tracking column for first session promo
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_session_promo_sent TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for efficient querying of eligible users
CREATE INDEX IF NOT EXISTS idx_profiles_first_session_promo 
ON public.profiles (first_session_promo_sent) 
WHERE first_session_promo_sent IS NULL;