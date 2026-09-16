
ALTER TABLE public.bay_devices
  ADD COLUMN IF NOT EXISTS cf_live_input_uid text,
  ADD COLUMN IF NOT EXISTS cf_playback_id text,
  ADD COLUMN IF NOT EXISTS cf_rtmps_url text,
  ADD COLUMN IF NOT EXISTS stream_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS sim_cup_live_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.public_bay_streams
WITH (security_invoker = off) AS
SELECT b.bay_number,
       b.name AS bay_name,
       d.cf_playback_id,
       d.stream_enabled,
       d.is_online
FROM public.bay_devices d
JOIN public.bays b ON b.id = d.bay_id
WHERE d.cf_playback_id IS NOT NULL
  AND d.stream_enabled = true;

GRANT SELECT ON public.public_bay_streams TO anon, authenticated;
