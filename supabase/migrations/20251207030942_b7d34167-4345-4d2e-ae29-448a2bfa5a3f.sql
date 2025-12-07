-- Create table to store SGT API key (with automatic refresh tracking)
CREATE TABLE public.sgt_api_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Only one row should exist, enforce with unique constraint on a constant
ALTER TABLE public.sgt_api_config ADD CONSTRAINT sgt_api_config_singleton CHECK (id IS NOT NULL);

-- Enable RLS but allow service role full access
ALTER TABLE public.sgt_api_config ENABLE ROW LEVEL SECURITY;

-- Only service role can access (no public access)
CREATE POLICY "Service role can manage API config"
  ON public.sgt_api_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_sgt_api_config_updated_at
  BEFORE UPDATE ON public.sgt_api_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();