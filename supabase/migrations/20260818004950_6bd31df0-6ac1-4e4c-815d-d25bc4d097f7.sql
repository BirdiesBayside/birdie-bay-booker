CREATE TABLE public.marketing_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_segments TO authenticated;
GRANT ALL ON public.marketing_segments TO service_role;

ALTER TABLE public.marketing_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage marketing segments"
ON public.marketing_segments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_marketing_segments_updated_at
BEFORE UPDATE ON public.marketing_segments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();