
ALTER TABLE public.sgt_monthly_standings
ADD COLUMN IF NOT EXISTS monthly_net_points integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_gross_points integer NOT NULL DEFAULT 0;
