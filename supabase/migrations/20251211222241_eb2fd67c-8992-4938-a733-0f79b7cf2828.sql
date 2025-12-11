-- Pricing configuration table
CREATE TABLE public.pricing_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL UNIQUE,
  hourly_rate NUMERIC NOT NULL,
  weekly_subscription_price NUMERIC,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  display_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_subscription BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing (needed for booking page)
CREATE POLICY "Anyone can view pricing" ON public.pricing_config
  FOR SELECT USING (true);

-- Only admins can modify pricing
CREATE POLICY "Admins can manage pricing" ON public.pricing_config
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default pricing
INSERT INTO public.pricing_config (tier, hourly_rate, weekly_subscription_price, display_name, display_order, is_subscription) VALUES
('visitor', 30, NULL, 'Visitor', 0, false),
('par', 12, 15, 'Par Member', 1, true),
('birdie', 10, 20, 'Birdie Member', 2, true),
('eagle', 9, 25, 'Eagle Member', 3, true),
('albatross', 8, 35, 'Albatross Member', 4, true);

-- Trigger for updated_at
CREATE TRIGGER update_pricing_config_updated_at
  BEFORE UPDATE ON public.pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();