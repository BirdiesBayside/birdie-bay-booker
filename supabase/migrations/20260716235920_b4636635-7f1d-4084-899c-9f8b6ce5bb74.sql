CREATE TABLE public.booking_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1,
  email_sent boolean NOT NULL DEFAULT false,
  sms_sent boolean NOT NULL DEFAULT false,
  gate_sms_sent boolean NOT NULL DEFAULT false,
  last_error text,
  last_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, notification_type)
);

GRANT SELECT ON public.booking_notification_log TO authenticated;
GRANT ALL ON public.booking_notification_log TO service_role;

ALTER TABLE public.booking_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view booking notification logs"
ON public.booking_notification_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_booking_notification_log_updated_at
BEFORE UPDATE ON public.booking_notification_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_booking_notification(
  _booking_id uuid,
  _notification_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_row public.booking_notification_log%ROWTYPE;
  claimed_row public.booking_notification_log%ROWTYPE;
BEGIN
  INSERT INTO public.booking_notification_log (booking_id, notification_type, status, attempt_count)
  VALUES (_booking_id, _notification_type, 'processing', 1)
  ON CONFLICT (booking_id, notification_type) DO NOTHING
  RETURNING * INTO claimed_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'should_send', true,
      'log_id', claimed_row.id,
      'status', claimed_row.status,
      'attempt_count', claimed_row.attempt_count
    );
  END IF;

  SELECT * INTO existing_row
  FROM public.booking_notification_log
  WHERE booking_id = _booking_id
    AND notification_type = _notification_type
  FOR UPDATE;

  IF existing_row.status = 'sent' THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'already_sent',
      'log_id', existing_row.id,
      'status', existing_row.status,
      'attempt_count', existing_row.attempt_count,
      'email_sent', existing_row.email_sent,
      'sms_sent', existing_row.sms_sent,
      'gate_sms_sent', existing_row.gate_sms_sent
    );
  END IF;

  IF existing_row.status = 'processing' AND existing_row.updated_at > now() - interval '10 minutes' THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'already_processing',
      'log_id', existing_row.id,
      'status', existing_row.status,
      'attempt_count', existing_row.attempt_count
    );
  END IF;

  UPDATE public.booking_notification_log
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = NULL,
      last_response = NULL,
      updated_at = now()
  WHERE id = existing_row.id
  RETURNING * INTO claimed_row;

  RETURN jsonb_build_object(
    'should_send', true,
    'log_id', claimed_row.id,
    'status', claimed_row.status,
    'attempt_count', claimed_row.attempt_count,
    'retry', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_booking_notification(
  _log_id uuid,
  _status text,
  _email_sent boolean DEFAULT false,
  _sms_sent boolean DEFAULT false,
  _gate_sms_sent boolean DEFAULT false,
  _last_error text DEFAULT NULL,
  _last_response jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.booking_notification_log
  SET status = _status,
      email_sent = _email_sent,
      sms_sent = _sms_sent,
      gate_sms_sent = _gate_sms_sent,
      last_error = _last_error,
      last_response = _last_response,
      updated_at = now()
  WHERE id = _log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_booking_notification(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_booking_notification(uuid, text, boolean, boolean, boolean, text, jsonb) TO service_role;