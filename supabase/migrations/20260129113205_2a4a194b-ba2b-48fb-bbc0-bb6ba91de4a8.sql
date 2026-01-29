-- Create table for table service (bar) hours
CREATE TABLE public.table_service_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
  is_open boolean NOT NULL DEFAULT true,
  open_time time without time zone NOT NULL DEFAULT '10:00',
  close_time time without time zone NOT NULL DEFAULT '22:00',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(day_of_week)
);

-- Enable RLS
ALTER TABLE public.table_service_hours ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for customer-facing QR ordering page)
CREATE POLICY "Anyone can view table service hours"
ON public.table_service_hours
FOR SELECT
USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage table service hours"
ON public.table_service_hours
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default hours (closed on Mondays for example, open 10am-10pm other days)
INSERT INTO public.table_service_hours (day_of_week, is_open, open_time, close_time) VALUES
(0, true, '10:00', '22:00'),  -- Sunday
(1, false, '10:00', '22:00'), -- Monday (closed)
(2, true, '10:00', '22:00'),  -- Tuesday
(3, true, '10:00', '22:00'),  -- Wednesday
(4, true, '10:00', '22:00'),  -- Thursday
(5, true, '10:00', '22:00'),  -- Friday
(6, true, '10:00', '22:00');  -- Saturday