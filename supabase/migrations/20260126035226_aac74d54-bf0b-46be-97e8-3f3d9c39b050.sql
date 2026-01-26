-- Create table to store membership subscription payments
CREATE TABLE public.membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_invoice_id text UNIQUE NOT NULL,
  stripe_customer_id text NOT NULL,
  amount numeric NOT NULL,
  tier text NOT NULL,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.membership_payments ENABLE ROW LEVEL SECURITY;

-- Admins can manage membership payments
CREATE POLICY "Admins can manage membership payments"
ON public.membership_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own membership payments
CREATE POLICY "Users can view their own membership payments"
ON public.membership_payments
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for date-based queries
CREATE INDEX idx_membership_payments_paid_at ON public.membership_payments(paid_at);
CREATE INDEX idx_membership_payments_user_id ON public.membership_payments(user_id);