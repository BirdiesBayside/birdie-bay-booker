ALTER TABLE public.recording_holes 
  ADD COLUMN IF NOT EXISTS hole_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chapter_marked_at timestamptz;

-- Command type for OBS chapter markers dispatched from the poller to bays
COMMENT ON COLUMN public.recording_holes.hole_completed_at IS 'Server timestamp when SGT live-scorecard first showed this hole as scored. Used to compute clip windows.';
COMMENT ON COLUMN public.recording_holes.chapter_marked_at IS 'When the bay controller successfully injected the OBS chapter marker for this hole.';