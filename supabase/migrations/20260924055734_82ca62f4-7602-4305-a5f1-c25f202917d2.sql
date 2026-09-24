ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS first_session_promo_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS membership_benefit_campaign_enabled boolean NOT NULL DEFAULT true;

UPDATE public.system_settings
SET first_session_promo_enabled = true,
    membership_benefit_campaign_enabled = true
WHERE id = 'global';