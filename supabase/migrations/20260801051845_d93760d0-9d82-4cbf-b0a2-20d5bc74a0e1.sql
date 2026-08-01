ALTER TABLE public.door_codes
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_permanent boolean NOT NULL DEFAULT false;

ALTER TABLE public.door_codes DROP CONSTRAINT IF EXISTS door_codes_scope_chk;
ALTER TABLE public.door_codes ADD CONSTRAINT door_codes_scope_chk
  CHECK (scope = ANY (ARRAY['booking'::text, 'daily'::text, 'test'::text, 'staff'::text]));