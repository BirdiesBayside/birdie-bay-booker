CREATE TABLE public.customer_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_alerts TO authenticated;
GRANT ALL ON public.customer_alerts TO service_role;
ALTER TABLE public.customer_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage customer alerts" ON public.customer_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_customer_alerts_updated_at
BEFORE UPDATE ON public.customer_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_alert_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.customer_alerts(id) ON DELETE CASCADE,
  booking_id uuid,
  phone text,
  success boolean NOT NULL DEFAULT false,
  response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, booking_id)
);

GRANT SELECT ON public.customer_alert_sends TO authenticated;
GRANT ALL ON public.customer_alert_sends TO service_role;
ALTER TABLE public.customer_alert_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view customer alert sends" ON public.customer_alert_sends
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_customer_alert_sends_alert ON public.customer_alert_sends(alert_id);