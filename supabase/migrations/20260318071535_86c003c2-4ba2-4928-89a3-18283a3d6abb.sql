
-- Feedback responses table (public, no auth needed)
CREATE TABLE public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  name text,
  score text NOT NULL CHECK (score IN ('bad', 'ok', 'good')),
  comment text,
  email text,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Track which users have been sent feedback emails
CREATE TABLE public.feedback_emails_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  feedback_received boolean NOT NULL DEFAULT false
);

-- RLS for feedback_responses: anyone can insert (public form), admins can read
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_emails_sent ENABLE ROW LEVEL SECURITY;

-- Public can submit feedback (no login)
CREATE POLICY "Anyone can submit feedback" ON public.feedback_responses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admins can view feedback
CREATE POLICY "Admins can view feedback" ON public.feedback_responses
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage feedback email tracking
CREATE POLICY "Admins can manage feedback emails" ON public.feedback_emails_sent
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service can insert feedback email records
CREATE POLICY "Service can insert feedback emails" ON public.feedback_emails_sent
  FOR INSERT WITH CHECK (true);

-- Service can update feedback email records
CREATE POLICY "Service can update feedback emails" ON public.feedback_emails_sent
  FOR UPDATE USING (true);
