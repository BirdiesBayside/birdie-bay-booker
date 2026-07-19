
-- Storage RLS: admins only for league-highlights bucket
CREATE POLICY "Admins read league-highlights"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'league-highlights' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write league-highlights"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'league-highlights' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update league-highlights"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'league-highlights' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete league-highlights"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'league-highlights' AND public.has_role(auth.uid(), 'admin'::app_role));
