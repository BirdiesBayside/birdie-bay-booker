
CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_templates TO anon, authenticated;
GRANT ALL ON public.sms_templates TO service_role;
GRANT UPDATE ON public.sms_templates TO authenticated;

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sms templates"
  ON public.sms_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins can update sms templates"
  ON public.sms_templates FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add door_code to system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS door_code text NOT NULL DEFAULT '7675#';

-- Seed the 4 customer-facing SMS templates
INSERT INTO public.sms_templates (template_key, name, description, message, is_active) VALUES
  (
    'booking_confirmation',
    'Booking Confirmation',
    'Sent to the customer when a new booking is confirmed.',
    E'Hi {first_name} {last_name} thank you for your booking on {booking_date} at {booking_time} for Bay {bay_number}\n\nYour door code is: {door_code}',
    true
  ),
  (
    'booking_reschedule',
    'Booking Rescheduled',
    'Sent when an existing booking is moved to a different time, date, or bay.',
    E'Hi {first_name}, your Birdies booking has been rescheduled to {booking_date} at {booking_time} for Bay {bay_number}\n\nYour door code is: {door_code}',
    true
  ),
  (
    'booking_cancellation',
    'Booking Cancellation',
    'Sent when a confirmed booking is cancelled.',
    'Birdies Bayside: Your booking for {short_date} {start_time_24}-{end_time_24} has been cancelled. Questions? Contact us.',
    true
  ),
  (
    'boom_gate_access',
    'Boom Gate Access (additional SMS)',
    'Extra SMS sent right after a confirmation when the booking falls outside staffed hours and gate access is required.',
    'IMPORTANT: You will require Boom gate access for your booking time. Download the Noke gate access app: birdiesbayside.com.au/pages/birdies-gate-access',
    true
  );
