ALTER TABLE public.recording_sessions
  ADD COLUMN IF NOT EXISTS scorecard_image_path text,
  ADD COLUMN IF NOT EXISTS scorecard_source text,
  ADD COLUMN IF NOT EXISTS scorecard_captured_at timestamptz;

DROP POLICY IF EXISTS "Admins can view comp scorecards" ON storage.objects;
CREATE POLICY "Admins can view comp scorecards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'comp-scorecards' AND public.has_role(auth.uid(), 'admin'::app_role));