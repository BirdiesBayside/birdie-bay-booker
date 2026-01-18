-- Add policies to allow admins to manage bays
CREATE POLICY "Admins can update bays"
ON public.bays
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Also add a select policy for admins to see ALL bays (including inactive)
CREATE POLICY "Admins can view all bays"
ON public.bays
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));