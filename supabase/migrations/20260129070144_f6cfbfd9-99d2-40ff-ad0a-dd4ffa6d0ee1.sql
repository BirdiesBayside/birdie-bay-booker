-- Allow admins to update sgt_members (for exempt_from_cleanup toggle)
CREATE POLICY "Admins can update sgt_members" 
ON public.sgt_members 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));