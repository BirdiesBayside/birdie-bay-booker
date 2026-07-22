ALTER TABLE public.local_comp_settings
  ADD COLUMN IF NOT EXISTS hub_highlights_enabled boolean NOT NULL DEFAULT false;

INSERT INTO public.local_comp_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.local_comp_settings);