
-- range_sessions
CREATE TABLE public.range_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  bay_id uuid REFERENCES public.bays(id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Australia/Brisbane')::date,
  started_at timestamptz,
  ended_at timestamptz,
  shot_count integer NOT NULL DEFAULT 0,
  duration_minutes numeric,
  csv_path text,
  source_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_range_sessions_user ON public.range_sessions(user_id, session_date DESC);
CREATE INDEX idx_range_sessions_booking ON public.range_sessions(booking_id);

GRANT SELECT ON public.range_sessions TO authenticated;
GRANT ALL ON public.range_sessions TO service_role;

ALTER TABLE public.range_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own range sessions"
  ON public.range_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_range_sessions_updated_at
  BEFORE UPDATE ON public.range_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- range_shots
CREATE TABLE public.range_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.range_sessions(id) ON DELETE CASCADE,
  shot_number integer,
  shot_timestamp timestamptz,
  club_type text,
  ball_speed numeric,
  club_speed numeric,
  smash_factor numeric,
  launch_angle numeric,
  launch_direction numeric,
  spin_rate numeric,
  spin_axis numeric,
  back_spin numeric,
  side_spin numeric,
  carry numeric,
  total numeric,
  side_carry numeric,
  side_total numeric,
  apex_height numeric,
  descent_angle numeric,
  angle_of_attack numeric,
  club_path numeric,
  face_angle numeric,
  face_to_path numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_range_shots_session ON public.range_shots(session_id);
CREATE INDEX idx_range_shots_session_club ON public.range_shots(session_id, club_type);

GRANT SELECT ON public.range_shots TO authenticated;
GRANT ALL ON public.range_shots TO service_role;

ALTER TABLE public.range_shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own range shots"
  ON public.range_shots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.range_sessions rs
      WHERE rs.id = range_shots.session_id
        AND (rs.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );
