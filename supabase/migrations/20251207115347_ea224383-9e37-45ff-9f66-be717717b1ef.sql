-- Create email templates table
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  subject text,
  html_content text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage templates
CREATE POLICY "Admins can manage email templates" 
ON public.email_templates 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Edge functions can read templates (via service role)
CREATE POLICY "Service role can read templates" 
ON public.email_templates 
FOR SELECT 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.email_templates (template_key, name, description, subject) VALUES
('booking_confirmation', 'Booking Confirmation', 'Sent when a booking is created', 'Your Birdies Booking Confirmation'),
('booking_cancellation', 'Booking Cancellation', 'Sent when a booking is cancelled', 'Your Birdies Booking Has Been Cancelled'),
('credit_added', 'Credit Added', 'Sent when credit/deposit is added to account', 'Credit Added to Your Birdies Account');