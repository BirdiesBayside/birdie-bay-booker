CREATE UNIQUE INDEX IF NOT EXISTS recording_sessions_active_unique
  ON public.recording_sessions (booking_id, round_number)
  WHERE status IN ('recording', 'stopping');