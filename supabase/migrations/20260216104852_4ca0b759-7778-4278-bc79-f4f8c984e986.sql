DROP POLICY IF EXISTS "Authenticated users can view monthly standings" ON public.sgt_monthly_standings;

CREATE POLICY "Authenticated users can view monthly standings"
ON public.sgt_monthly_standings
FOR SELECT
USING (true);