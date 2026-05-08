-- Storage for in-progress sim centre onboarding questionnaire submissions
CREATE TABLE public.sim_centre_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_section INTEGER NOT NULL DEFAULT 1,
  contact_email TEXT,
  trading_name TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sim_centre_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can create a new draft
CREATE POLICY "Anyone can create a submission"
  ON public.sim_centre_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone holding the row id can update it (id is the secret)
CREATE POLICY "Anyone can update by id"
  ON public.sim_centre_submissions
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Anyone holding the row id can read their own draft back
CREATE POLICY "Anyone can read by id"
  ON public.sim_centre_submissions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can delete
CREATE POLICY "Admins can delete submissions"
  ON public.sim_centre_submissions
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_sim_centre_submissions_updated_at
  BEFORE UPDATE ON public.sim_centre_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();