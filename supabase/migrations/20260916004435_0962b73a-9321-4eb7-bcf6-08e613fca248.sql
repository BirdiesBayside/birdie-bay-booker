CREATE TABLE IF NOT EXISTS public.marketing_email_opens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  email text not null,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  open_count integer not null default 1,
  user_agent text
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_email_opens_campaign_email_idx
  ON public.marketing_email_opens (campaign_id, lower(email));

GRANT SELECT ON public.marketing_email_opens TO authenticated;
GRANT ALL ON public.marketing_email_opens TO service_role;

ALTER TABLE public.marketing_email_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email opens"
ON public.marketing_email_opens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.sync_campaign_open_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketing_campaigns c
  SET opens = (
    SELECT count(*) FROM public.marketing_email_opens o WHERE o.campaign_id = NEW.campaign_id
  )
  WHERE c.id = NEW.campaign_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_campaign_open_count ON public.marketing_email_opens;
CREATE TRIGGER trg_sync_campaign_open_count
AFTER INSERT ON public.marketing_email_opens
FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_open_count();