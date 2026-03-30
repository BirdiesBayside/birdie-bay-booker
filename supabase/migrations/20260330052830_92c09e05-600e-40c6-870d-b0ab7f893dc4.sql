
-- Loyalty promo settings (single-row config table)
CREATE TABLE public.loyalty_promo_settings (
  id text NOT NULL DEFAULT 'global' PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  visit_threshold integer NOT NULL DEFAULT 5,
  credit_amount numeric NOT NULL DEFAULT 35,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.loyalty_promo_settings (id) VALUES ('global');

-- RLS
ALTER TABLE public.loyalty_promo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage loyalty settings"
  ON public.loyalty_promo_settings FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view loyalty settings"
  ON public.loyalty_promo_settings FOR SELECT
  TO public
  USING (true);

-- Track issued loyalty milestones to prevent duplicates
CREATE TABLE public.loyalty_credits_issued (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  milestone_number integer NOT NULL,
  total_bookings_at_issue integer NOT NULL,
  credit_amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_number)
);

ALTER TABLE public.loyalty_credits_issued ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage loyalty credits"
  ON public.loyalty_credits_issued FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own loyalty credits"
  ON public.loyalty_credits_issued FOR SELECT
  TO public
  USING (auth.uid() = user_id);

-- Add updated_at trigger for settings
CREATE TRIGGER set_loyalty_settings_updated_at
  BEFORE UPDATE ON public.loyalty_promo_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
