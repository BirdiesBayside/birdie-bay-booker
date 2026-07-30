-- Door access settings (single global row)
CREATE TABLE public.door_access_settings (
  id text PRIMARY KEY DEFAULT 'global',
  mode text NOT NULL DEFAULT 'fixed',
  fixed_code text NOT NULL DEFAULT '7675#',
  code_length integer NOT NULL DEFAULT 6,
  append_hash boolean NOT NULL DEFAULT true,
  valid_from_minutes_before integer NOT NULL DEFAULT 20,
  valid_until_minutes_after integer NOT NULL DEFAULT 1,
  provider text NOT NULL DEFAULT 'manual',
  tuya_device_id text,
  tuya_region text NOT NULL DEFAULT 'us',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT door_access_settings_singleton CHECK (id = 'global'),
  CONSTRAINT door_access_settings_mode_chk CHECK (mode IN ('fixed','daily','per_booking','unstaffed_only')),
  CONSTRAINT door_access_settings_provider_chk CHECK (provider IN ('manual','tuya')),
  CONSTRAINT door_access_settings_len_chk CHECK (code_length BETWEEN 4 AND 8)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.door_access_settings TO authenticated;
GRANT ALL ON public.door_access_settings TO service_role;

ALTER TABLE public.door_access_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage door access settings"
ON public.door_access_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_door_access_settings_updated_at
BEFORE UPDATE ON public.door_access_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.door_access_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- Issued codes
CREATE TABLE public.door_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid,
  code text NOT NULL,
  scope text NOT NULL DEFAULT 'booking',
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'manual',
  provider_ref text,
  slot_index integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT door_codes_status_chk CHECK (status IN ('pending','active','revoked','expired','failed')),
  CONSTRAINT door_codes_scope_chk CHECK (scope IN ('booking','daily'))
);

GRANT SELECT ON public.door_codes TO authenticated;
GRANT ALL ON public.door_codes TO service_role;

ALTER TABLE public.door_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own door codes"
ON public.door_codes FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage door codes"
ON public.door_codes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_door_codes_updated_at
BEFORE UPDATE ON public.door_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One live code per booking
CREATE UNIQUE INDEX door_codes_one_live_per_booking
ON public.door_codes (booking_id)
WHERE status IN ('pending','active') AND booking_id IS NOT NULL;

CREATE INDEX door_codes_active_window_idx
ON public.door_codes (valid_from, valid_until)
WHERE status IN ('pending','active');

CREATE INDEX door_codes_code_idx ON public.door_codes (code);

-- Audit trail
CREATE TABLE public.door_code_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  door_code_id uuid REFERENCES public.door_codes(id) ON DELETE CASCADE,
  booking_id uuid,
  event_type text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.door_code_events TO authenticated;
GRANT ALL ON public.door_code_events TO service_role;

ALTER TABLE public.door_code_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read door code events"
ON public.door_code_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX door_code_events_created_idx ON public.door_code_events (created_at DESC);