-- Create table to store tour auto-registration settings
CREATE TABLE public.sgt_tour_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id INTEGER NOT NULL UNIQUE,
  auto_register_members BOOLEAN NOT NULL DEFAULT false,
  auto_register_tournaments BOOLEAN NOT NULL DEFAULT false,
  use_combo_handicap BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sgt_tour_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage tour settings
CREATE POLICY "Admins can manage tour settings"
ON public.sgt_tour_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can view tour settings
CREATE POLICY "Authenticated users can view tour settings"
ON public.sgt_tour_settings
FOR SELECT
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_sgt_tour_settings_updated_at
  BEFORE UPDATE ON public.sgt_tour_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();