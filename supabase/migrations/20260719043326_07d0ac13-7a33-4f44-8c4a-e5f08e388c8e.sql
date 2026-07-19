ALTER TABLE public.bay_devices
  ADD COLUMN IF NOT EXISTS obs_ws_url text DEFAULT 'ws://127.0.0.1:4455',
  ADD COLUMN IF NOT EXISTS obs_ws_password text;