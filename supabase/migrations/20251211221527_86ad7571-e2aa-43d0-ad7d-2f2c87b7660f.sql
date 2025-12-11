-- Marketing campaigns table
CREATE TABLE public.marketing_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  recipient_filter JSONB DEFAULT '{}',
  recipient_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'draft',
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Marketing templates table
CREATE TABLE public.marketing_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Marketing unsubscribes table
CREATE TABLE public.marketing_unsubscribes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  unsubscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add marketing opt out to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_unsubscribes ENABLE ROW LEVEL SECURITY;

-- Admin policies for campaigns
CREATE POLICY "Admins can manage campaigns" ON public.marketing_campaigns
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admin policies for templates
CREATE POLICY "Admins can manage templates" ON public.marketing_templates
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admin policies for unsubscribes
CREATE POLICY "Admins can manage unsubscribes" ON public.marketing_unsubscribes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default marketing templates
INSERT INTO public.marketing_templates (name, description, subject, html_content, category) VALUES
('Welcome Email', 'Welcome new customers to Birdies Hub', 'Welcome to Birdies Hub!', '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #1f4c25;">Welcome to Birdies Hub, {first_name}!</h1>
  <p>Thank you for joining our community of golf enthusiasts.</p>
  <p>We''re excited to have you with us. Book your first session and experience our state-of-the-art golf simulators.</p>
  <p>Best regards,<br>The Birdies Hub Team</p>
</div>', 'onboarding'),
('Re-engagement', 'Bring back inactive customers', 'We miss you at Birdies Hub!', '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #1f4c25;">Hey {first_name}, we miss you!</h1>
  <p>It''s been a while since your last visit. Come back and see what''s new at Birdies Hub.</p>
  <p>Book your next session today!</p>
  <p>Best regards,<br>The Birdies Hub Team</p>
</div>', 'retention'),
('Special Promotion', 'Promotional offer template', 'Special Offer Just For You!', '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #ec622d;">Special Offer, {first_name}!</h1>
  <p>We have an exclusive promotion just for you.</p>
  <p>[Add your promotion details here]</p>
  <p>Don''t miss out!</p>
  <p>Best regards,<br>The Birdies Hub Team</p>
</div>', 'promotion'),
('Newsletter', 'Monthly newsletter template', 'Birdies Hub Newsletter', '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #1f4c25;">Birdies Hub Newsletter</h1>
  <p>Hi {first_name},</p>
  <p>Here''s what''s happening at Birdies Hub...</p>
  <p>[Add your newsletter content here]</p>
  <p>Best regards,<br>The Birdies Hub Team</p>
</div>', 'newsletter');

-- Trigger for updated_at
CREATE TRIGGER update_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_templates_updated_at
  BEFORE UPDATE ON public.marketing_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();