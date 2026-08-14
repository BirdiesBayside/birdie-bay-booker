ALTER TABLE public.pricing_config DROP CONSTRAINT pricing_config_tier_key;
ALTER TABLE public.pricing_config ADD CONSTRAINT pricing_config_tier_effective_from_key UNIQUE (tier, effective_from);