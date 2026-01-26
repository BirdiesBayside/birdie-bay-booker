-- Create bay_controller_logs table for centralized logging
CREATE TABLE public.bay_controller_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bay_number integer NOT NULL CHECK (bay_number >= 1 AND bay_number <= 6),
  event_type text NOT NULL,
  event_level text NOT NULL DEFAULT 'info' CHECK (event_level IN ('info', 'warning', 'error')),
  message text NOT NULL,
  details jsonb DEFAULT '{}',
  booking_id uuid,
  app_version text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for common queries
CREATE INDEX idx_bay_controller_logs_bay_number ON public.bay_controller_logs(bay_number);
CREATE INDEX idx_bay_controller_logs_created_at ON public.bay_controller_logs(created_at DESC);
CREATE INDEX idx_bay_controller_logs_event_type ON public.bay_controller_logs(event_type);
CREATE INDEX idx_bay_controller_logs_event_level ON public.bay_controller_logs(event_level);

-- Enable RLS
ALTER TABLE public.bay_controller_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view all bay controller logs"
ON public.bay_controller_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Service role can insert logs (for edge function)
CREATE POLICY "Service can insert logs"
ON public.bay_controller_logs
FOR INSERT
WITH CHECK (true);

-- Enable realtime for live log updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_controller_logs;

-- Add comment for documentation
COMMENT ON TABLE public.bay_controller_logs IS 'Centralized logging for bay controller applications';