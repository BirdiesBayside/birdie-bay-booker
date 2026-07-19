
-- =====================================================
-- League Highlight Recorder — Pilot schema
-- =====================================================

-- 1. Recording sessions (one per booking)
CREATE TABLE public.recording_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  bay_number integer NOT NULL,
  sgt_user_id text,
  sgt_tournament_id text,
  player_name text,
  tournament_name text,
  mkv_path text,
  file_size_bytes bigint,
  started_at timestamptz,
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'recording',
    -- recording | pending_split | pending_tagging | tagged | error | unsplit | purged
  error_message text,
  retention_until timestamptz,
    -- when the raw MKV can be purged from the bay PC
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_sessions TO authenticated;
GRANT ALL ON public.recording_sessions TO service_role;

ALTER TABLE public.recording_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recording sessions"
  ON public.recording_sessions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_recording_sessions_status ON public.recording_sessions(status);
CREATE INDEX idx_recording_sessions_booking ON public.recording_sessions(booking_id);
CREATE INDEX idx_recording_sessions_tournament ON public.recording_sessions(sgt_tournament_id);

CREATE TRIGGER trg_recording_sessions_updated_at
  BEFORE UPDATE ON public.recording_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. Per-hole clips within a recording
CREATE TABLE public.recording_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_session_id uuid NOT NULL REFERENCES public.recording_sessions(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  par integer,
  score integer,
  clip_start_seconds numeric,
  clip_end_seconds numeric,
  storage_path text,
  shot_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- [{shot_index, offset_seconds, distance_m, club, ...}]
  status text NOT NULL DEFAULT 'pending_tag',
    -- pending_tag | no_highlight | pending_review | approved | rejected | purged
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recording_session_id, hole_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_holes TO authenticated;
GRANT ALL ON public.recording_holes TO service_role;

ALTER TABLE public.recording_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recording holes"
  ON public.recording_holes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_recording_holes_session ON public.recording_holes(recording_session_id);
CREATE INDEX idx_recording_holes_status ON public.recording_holes(status);

CREATE TRIGGER trg_recording_holes_updated_at
  BEFORE UPDATE ON public.recording_holes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3. Highlight events (rule hits) — a hole can trigger multiple tags
CREATE TABLE public.highlight_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_hole_id uuid NOT NULL REFERENCES public.recording_holes(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
    -- eagle_or_better | birdie | hole_out_distance | long_approach_stick |
    -- monster_drive | long_putt_made | scramble_save | near_ace | hole_in_one
  tag_label text NOT NULL,
  tag_emoji text,
  shot_index integer,
  metric_value numeric,
  metric_unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlight_events TO authenticated;
GRANT ALL ON public.highlight_events TO service_role;

ALTER TABLE public.highlight_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage highlight events"
  ON public.highlight_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_highlight_events_hole ON public.highlight_events(recording_hole_id);
CREATE INDEX idx_highlight_events_rule ON public.highlight_events(rule_key);


-- 4. Approved final clips (ready for socials)
CREATE TABLE public.highlight_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_hole_id uuid REFERENCES public.recording_holes(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  duration_seconds numeric,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  player_name text,
  tournament_name text,
  hole_number integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlight_clips TO authenticated;
GRANT ALL ON public.highlight_clips TO service_role;

ALTER TABLE public.highlight_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage highlight clips"
  ON public.highlight_clips FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_highlight_clips_approved_at ON public.highlight_clips(approved_at DESC);
