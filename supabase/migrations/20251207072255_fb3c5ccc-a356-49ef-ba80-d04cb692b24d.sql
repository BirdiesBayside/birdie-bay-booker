-- Create bay_blocks table for blocking time slots without a booking
CREATE TABLE public.bay_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id UUID NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.bay_blocks ENABLE ROW LEVEL SECURITY;

-- Admins can manage blocks
CREATE POLICY "Admins can manage bay blocks" 
ON public.bay_blocks 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view blocks (needed for availability checking)
CREATE POLICY "Anyone can view bay blocks" 
ON public.bay_blocks 
FOR SELECT 
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_bay_blocks_date ON public.bay_blocks(block_date);
CREATE INDEX idx_bay_blocks_bay_date ON public.bay_blocks(bay_id, block_date);