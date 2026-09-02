ALTER TABLE public.door_access_settings DROP CONSTRAINT IF EXISTS door_access_settings_provider_chk;
ALTER TABLE public.door_access_settings ADD COLUMN IF NOT EXISTS ttlock_lock_id text;
ALTER TABLE public.door_access_settings ADD COLUMN IF NOT EXISTS ttlock_region text NOT NULL DEFAULT 'eu';
UPDATE public.door_access_settings SET provider = 'manual' WHERE provider = 'tuya';
ALTER TABLE public.door_access_settings DROP COLUMN IF EXISTS tuya_device_id;
ALTER TABLE public.door_access_settings DROP COLUMN IF EXISTS tuya_region;
ALTER TABLE public.door_access_settings ADD CONSTRAINT door_access_settings_provider_chk CHECK (provider = ANY (ARRAY['manual'::text, 'ttlock'::text]));