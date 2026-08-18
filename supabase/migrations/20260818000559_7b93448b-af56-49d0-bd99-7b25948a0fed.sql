CREATE TABLE public.sim_cup_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  shirt_size text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.sim_cup_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.sim_cup_registrations TO authenticated;
GRANT ALL ON public.sim_cup_registrations TO service_role;

ALTER TABLE public.sim_cup_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register for the Sim Cup"
ON public.sim_cup_registrations FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Admins can view registrations"
ON public.sim_cup_registrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update registrations"
ON public.sim_cup_registrations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete registrations"
ON public.sim_cup_registrations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));