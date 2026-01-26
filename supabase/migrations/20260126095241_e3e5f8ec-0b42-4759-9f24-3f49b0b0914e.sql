-- Allow admins to manage sgt_tour_members (insert, update, delete)
CREATE POLICY "Admins can manage tour members"
ON public.sgt_tour_members
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));