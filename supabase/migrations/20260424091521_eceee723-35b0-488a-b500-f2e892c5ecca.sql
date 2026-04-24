CREATE TABLE public.public_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  surcharge_percent numeric NOT NULL DEFAULT 20,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public holidays"
  ON public.public_holidays FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage public holidays"
  ON public.public_holidays FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_public_holidays_updated_at
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_public_holidays_date ON public.public_holidays(holiday_date);