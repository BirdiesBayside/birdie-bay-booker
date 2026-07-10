
CREATE TABLE public.operating_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME NOT NULL DEFAULT '05:00',
  close_time TIME NOT NULL DEFAULT '23:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.operating_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operating_hours TO authenticated;
GRANT ALL ON public.operating_hours TO service_role;
ALTER TABLE public.operating_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read operating hours" ON public.operating_hours FOR SELECT USING (true);
CREATE POLICY "Admins can modify operating hours" ON public.operating_hours FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_operating_hours_updated BEFORE UPDATE ON public.operating_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.operating_hours (day_of_week, is_open, open_time, close_time)
SELECT d, true, '05:00'::time, '23:00'::time FROM generate_series(0,6) d;

CREATE TABLE public.staffed_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_staffed BOOLEAN NOT NULL DEFAULT false,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staffed_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staffed_hours TO authenticated;
GRANT ALL ON public.staffed_hours TO service_role;
ALTER TABLE public.staffed_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read staffed hours" ON public.staffed_hours FOR SELECT USING (true);
CREATE POLICY "Admins can modify staffed hours" ON public.staffed_hours FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_staffed_hours_updated BEFORE UPDATE ON public.staffed_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Seed based on current Birdies staffed hours
INSERT INTO public.staffed_hours (day_of_week, is_staffed, start_time, end_time) VALUES
  (0, true,  '11:00', '17:00'), -- Sunday
  (1, true,  '16:00', '21:00'), -- Monday
  (2, false, '09:00', '17:00'), -- Tuesday
  (3, false, '09:00', '17:00'), -- Wednesday
  (4, true,  '16:00', '21:00'), -- Thursday
  (5, true,  '14:00', '21:00'), -- Friday
  (6, true,  '11:00', '21:00'); -- Saturday
