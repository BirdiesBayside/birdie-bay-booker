CREATE TABLE IF NOT EXISTS public.sgt_club_config (
  id text PRIMARY KEY DEFAULT 'global',
  club_url text NOT NULL DEFAULT '',
  sgt_username text,
  sgt_password text,
  credentials_valid boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sgt_club_config_singleton CHECK (id = 'global')
);

GRANT ALL ON public.sgt_club_config TO service_role;

ALTER TABLE public.sgt_club_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages sgt club config" ON public.sgt_club_config;
CREATE POLICY "service role manages sgt club config"
ON public.sgt_club_config FOR ALL
TO service_role
USING (true) WITH CHECK (true);

INSERT INTO public.sgt_club_config (id, club_url)
VALUES ('global', 'birdiesbayside')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_sgt_club_config_updated_at ON public.sgt_club_config;
CREATE TRIGGER update_sgt_club_config_updated_at
BEFORE UPDATE ON public.sgt_club_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();