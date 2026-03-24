CREATE TABLE public.comp_survey_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  name TEXT,
  preferred_day TEXT,
  preferred_time TEXT,
  preferred_entry_fee TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comp_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert survey responses"
  ON public.comp_survey_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view survey responses"
  ON public.comp_survey_responses
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));