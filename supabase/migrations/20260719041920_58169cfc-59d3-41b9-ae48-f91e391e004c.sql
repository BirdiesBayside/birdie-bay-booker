
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS highlight_recording_pilot_bay integer,
  ADD COLUMN IF NOT EXISTS highlight_recording_enabled boolean NOT NULL DEFAULT false;

-- Seed the global row if it doesn't have these yet
INSERT INTO public.system_settings (id, timezone, highlight_recording_enabled)
VALUES ('global', 'Australia/Brisbane', false)
ON CONFLICT (id) DO NOTHING;
