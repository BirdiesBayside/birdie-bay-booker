-- Create bay_commands table for admin-to-bay command relay
CREATE TABLE public.bay_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_number INTEGER NOT NULL,
  command TEXT NOT NULL CHECK (command IN ('on', 'off')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.bay_commands ENABLE ROW LEVEL SECURITY;

-- Admins can create commands
CREATE POLICY "Admins can create bay commands"
ON public.bay_commands
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can view all commands
CREATE POLICY "Admins can view bay commands"
ON public.bay_commands
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role (bay controller API) can view and update commands
CREATE POLICY "Service can manage bay commands"
ON public.bay_commands
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_commands;

-- Create index for efficient queries
CREATE INDEX idx_bay_commands_pending ON public.bay_commands (bay_number, status) WHERE status = 'pending';