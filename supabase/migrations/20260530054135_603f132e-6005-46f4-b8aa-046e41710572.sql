CREATE TABLE public.adhoc_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  campaign_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  phone text,
  success boolean NOT NULL DEFAULT true,
  response text,
  UNIQUE (booking_id, campaign_key)
);

GRANT SELECT, INSERT ON public.adhoc_sms_log TO authenticated;
GRANT ALL ON public.adhoc_sms_log TO service_role;

ALTER TABLE public.adhoc_sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view adhoc sms log"
ON public.adhoc_sms_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));