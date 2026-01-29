-- Create table for QR bay orders
CREATE TABLE public.bay_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_number INTEGER NOT NULL,
  items JSONB NOT NULL,
  total NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID
);

-- Enable RLS
ALTER TABLE public.bay_orders ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all orders
CREATE POLICY "Admins can manage bay orders"
ON public.bay_orders
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow public inserts (for unauthenticated QR scans)
CREATE POLICY "Anyone can create bay orders"
ON public.bay_orders
FOR INSERT
WITH CHECK (true);

-- Enable realtime for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_orders;