ALTER TABLE public.recording_sessions
  ADD COLUMN IF NOT EXISTS stream_uid text,
  ADD COLUMN IF NOT EXISTS stream_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stream_error text,
  ADD COLUMN IF NOT EXISTS stream_created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.recording_clips (
  id uuid primary key default gen_random_uuid(),
  recording_session_id uuid references public.recording_sessions(id) on delete cascade not null,
  start_seconds numeric not null,
  end_seconds numeric not null,
  stream_clip_uid text,
  download_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_clips TO authenticated;
GRANT ALL ON public.recording_clips TO service_role;

ALTER TABLE public.recording_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recording clips"
  ON public.recording_clips
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage recording clips"
  ON public.recording_clips
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);