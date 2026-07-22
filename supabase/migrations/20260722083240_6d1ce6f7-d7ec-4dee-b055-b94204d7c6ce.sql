
-- Round-only recording support
ALTER TABLE public.recording_sessions
  ADD COLUMN IF NOT EXISTS round_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'sgt',
  ADD COLUMN IF NOT EXISTS partial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

-- Widen bay_commands.command to accept OBS orchestration commands
ALTER TABLE public.bay_commands DROP CONSTRAINT IF EXISTS bay_commands_command_check;
ALTER TABLE public.bay_commands ADD CONSTRAINT bay_commands_command_check
  CHECK (
    command = ANY (ARRAY['on'::text, 'off'::text, 'auto'::text, 'manual'::text])
    OR command LIKE 'obs_chapter:%'
    OR command LIKE 'obs_start_recording:%'
    OR command LIKE 'obs_stop_recording:%'
  );
