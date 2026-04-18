-- Global toggle table for SGT custom handicap system
CREATE TABLE IF NOT EXISTS public.sgt_handicap_settings (
  id text PRIMARY KEY DEFAULT 'global',
  use_custom_hcp boolean NOT NULL DEFAULT false,
  rounds_required integer NOT NULL DEFAULT 6,
  best_rounds_count integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sgt_handicap_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sgt handicap settings"
  ON public.sgt_handicap_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage sgt handicap settings"
  ON public.sgt_handicap_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sgt_handicap_settings_updated_at
  BEFORE UPDATE ON public.sgt_handicap_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sgt_handicap_settings (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;

-- Track the original onboarding handicap so the 6-round lock can be enforced
ALTER TABLE public.sgt_tour_members
  ADD COLUMN IF NOT EXISTS onboarding_hcp numeric;