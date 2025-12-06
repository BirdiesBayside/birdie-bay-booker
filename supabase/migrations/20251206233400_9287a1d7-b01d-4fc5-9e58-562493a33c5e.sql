-- Create bay_devices table to track controller connection status
CREATE TABLE public.bay_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id UUID NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  app_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(bay_id)
);

-- Enable RLS
ALTER TABLE public.bay_devices ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for admin dashboard)
CREATE POLICY "Anyone can view bay device status"
ON public.bay_devices
FOR SELECT
USING (true);

-- Allow service role to update (edge function will use service role)
CREATE POLICY "Service role can manage bay devices"
ON public.bay_devices
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_bay_devices_updated_at
BEFORE UPDATE ON public.bay_devices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for bay_devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_devices;