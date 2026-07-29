ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version_accepted text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;