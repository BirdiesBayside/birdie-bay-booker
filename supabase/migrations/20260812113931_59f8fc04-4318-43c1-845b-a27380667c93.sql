ALTER TABLE public.door_codes DROP CONSTRAINT IF EXISTS door_codes_scope_chk;
ALTER TABLE public.door_codes ADD CONSTRAINT door_codes_scope_chk CHECK (scope IN ('booking','test','staff','probe'));