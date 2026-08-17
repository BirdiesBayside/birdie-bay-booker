ALTER TABLE public.sgt_tour_members ADD COLUMN IF NOT EXISTS nickname text;

CREATE INDEX IF NOT EXISTS idx_sgt_tour_members_nickname ON public.sgt_tour_members (user_id) WHERE nickname IS NOT NULL;