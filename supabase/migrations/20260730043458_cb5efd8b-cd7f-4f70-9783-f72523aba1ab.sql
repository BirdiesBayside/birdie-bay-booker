ALTER TABLE public.door_codes DROP CONSTRAINT door_codes_scope_chk;
ALTER TABLE public.door_codes ADD CONSTRAINT door_codes_scope_chk CHECK (scope = ANY (ARRAY['booking','daily','test']));
ALTER TABLE public.door_codes ALTER COLUMN user_id DROP NOT NULL;