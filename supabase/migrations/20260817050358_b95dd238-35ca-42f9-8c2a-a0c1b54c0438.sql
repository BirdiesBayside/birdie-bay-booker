GRANT SELECT ON public.sgt_tour_members TO anon;

DROP POLICY IF EXISTS "Public can view tour members" ON public.sgt_tour_members;
CREATE POLICY "Public can view tour members"
ON public.sgt_tour_members
FOR SELECT
TO anon
USING (true);