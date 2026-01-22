-- Create table for global SGT notification settings
CREATE TABLE IF NOT EXISTS public.sgt_notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_member_email_enabled BOOLEAN NOT NULL DEFAULT false,
  notification_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sgt_notification_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view/modify settings
CREATE POLICY "Admins can view SGT notification settings"
  ON public.sgt_notification_settings
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update SGT notification settings"
  ON public.sgt_notification_settings
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert SGT notification settings"
  ON public.sgt_notification_settings
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default row
INSERT INTO public.sgt_notification_settings (new_member_email_enabled)
VALUES (false)
ON CONFLICT DO NOTHING;