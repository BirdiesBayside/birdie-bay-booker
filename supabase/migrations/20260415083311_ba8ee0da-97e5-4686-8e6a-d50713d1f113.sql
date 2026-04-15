
CREATE TABLE public.whats_on_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.whats_on_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active events"
ON public.whats_on_events
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can do everything with events"
ON public.whats_on_events
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_whats_on_events_updated_at
BEFORE UPDATE ON public.whats_on_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
