ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sgt_onboarding_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sgt_onboarding_dismissed_by uuid;

COMMENT ON COLUMN public.profiles.sgt_onboarding_dismissed_at IS 'Set when an admin dismisses this profile from the SGT pending onboarding list.';