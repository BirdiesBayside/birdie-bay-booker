
ALTER TABLE public.recording_clips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS playback_url text;
CREATE INDEX IF NOT EXISTS recording_clips_session_created_idx
  ON public.recording_clips(recording_session_id, created_at DESC);
