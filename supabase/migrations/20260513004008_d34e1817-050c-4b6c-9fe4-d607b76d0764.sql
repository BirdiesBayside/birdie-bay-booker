CREATE TABLE public.bar_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bar_tabs_status ON public.bar_tabs(status);

ALTER TABLE public.bar_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bar tabs"
ON public.bar_tabs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bar_tabs_updated_at
BEFORE UPDATE ON public.bar_tabs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();