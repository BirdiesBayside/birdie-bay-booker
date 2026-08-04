UPDATE public.profiles SET sgt_user_id = 30232, updated_at = now() WHERE email = 'chriswmoore10@outlook.com';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_sgt_user_id_unique ON public.profiles (sgt_user_id) WHERE sgt_user_id IS NOT NULL;