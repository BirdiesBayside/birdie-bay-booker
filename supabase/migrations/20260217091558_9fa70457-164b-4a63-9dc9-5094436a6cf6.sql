
-- Table to track Google Review reward approvals
CREATE TABLE public.google_review_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  credit_amount NUMERIC NOT NULL DEFAULT 15,
  credit_issued BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.google_review_rewards ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage review rewards"
ON public.google_review_rewards
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can see their own reward status (so we can conditionally hide CTA)
CREATE POLICY "Users can view their own review reward"
ON public.google_review_rewards
FOR SELECT
USING (auth.uid() = user_id);

-- Unique constraint so each user can only be approved once
CREATE UNIQUE INDEX idx_google_review_rewards_user_id ON public.google_review_rewards (user_id);
