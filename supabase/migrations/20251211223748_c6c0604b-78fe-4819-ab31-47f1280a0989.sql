-- Add new notification trigger email templates
INSERT INTO public.email_templates (template_key, name, description, subject, is_active)
VALUES 
  ('welcome', 'Welcome Email', 'Sent when a customer creates an account', 'Welcome to Birdies!', true),
  ('membership_activated', 'Membership Confirmation', 'Sent when a membership subscription is activated', 'Welcome to the {tier_name} Membership!', true),
  ('membership_cancelled', 'Membership Cancelled', 'Sent when a membership subscription is cancelled', 'Your Birdies Membership Has Been Cancelled', true)
ON CONFLICT (template_key) DO NOTHING;