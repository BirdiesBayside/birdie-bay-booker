ALTER TABLE public.loyalty_promo_settings ADD COLUMN IF NOT EXISTS credit_hours numeric NOT NULL DEFAULT 1;
ALTER TABLE public.loyalty_credits_issued ADD COLUMN IF NOT EXISTS credit_hours numeric NOT NULL DEFAULT 1;
ALTER TABLE public.loyalty_credits_issued ALTER COLUMN credit_amount SET DEFAULT 0;