GRANT SELECT ON public.whats_on_events TO anon;
CREATE POLICY "Anyone can view active events" ON public.whats_on_events FOR SELECT TO anon USING (is_active = true);