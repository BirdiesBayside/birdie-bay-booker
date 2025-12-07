-- Create products table for POS items
CREATE TABLE public.pos_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  family TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;

-- Admins can manage products
CREATE POLICY "Admins can manage products"
  ON public.pos_products
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create POS transactions table
CREATE TABLE public.pos_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  items JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  customer_id UUID,
  booking_id UUID,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can manage transactions
CREATE POLICY "Admins can manage transactions"
  ON public.pos_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at on pos_products
CREATE TRIGGER update_pos_products_updated_at
  BEFORE UPDATE ON public.pos_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();