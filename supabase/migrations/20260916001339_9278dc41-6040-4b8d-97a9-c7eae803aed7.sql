ALTER TABLE public.sim_cup_registrations
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN shirt_size DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS preferred_timeslot text,
  ADD COLUMN IF NOT EXISTS assigned_timeslot text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sim_cup_registrations_email_key
  ON public.sim_cup_registrations (lower(email));