-- Allow authenticated users to insert into local_comp_saved_teams
CREATE POLICY "Authenticated users can register teams"
ON public.local_comp_saved_teams
FOR INSERT
TO authenticated
WITH CHECK (true);