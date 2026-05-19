
ALTER TABLE public.loyalty_credits_issued
  ADD COLUMN IF NOT EXISTS reminder_14d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_30d_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_loyalty_credits_reminder_lookup
  ON public.loyalty_credits_issued (created_at)
  WHERE reminder_30d_sent_at IS NULL;
