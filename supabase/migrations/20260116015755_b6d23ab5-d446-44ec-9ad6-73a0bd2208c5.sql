-- Fix SGT API Config security - restrict to authenticated users only
DROP POLICY IF EXISTS "Allow read access to all users" ON public.sgt_api_config;

-- Create secure policy that only allows authenticated users to read API config
CREATE POLICY "Authenticated users can read sgt_api_config"
ON public.sgt_api_config
FOR SELECT
USING (auth.role() = 'authenticated');

-- Add comment explaining the security requirement
COMMENT ON TABLE public.sgt_api_config IS 'SGT API configuration - requires authentication to read';