-- Allow admins to view all scorecards
CREATE POLICY "Admins can view all scorecards"
ON public.sgt_scorecards
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));