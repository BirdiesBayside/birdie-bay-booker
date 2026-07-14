UPDATE public.range_shots
SET spin_rate = round(sqrt((back_spin * back_spin) + (COALESCE(side_spin, 0) * COALESCE(side_spin, 0))))
WHERE spin_rate IS NULL AND back_spin IS NOT NULL;