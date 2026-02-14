
-- Create deposit transactions table for full audit trail
CREATE TABLE public.deposit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_gift_card_id UUID REFERENCES public.gift_cards(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for fast user lookups
CREATE INDEX idx_deposit_transactions_user_id ON public.deposit_transactions(user_id);
CREATE INDEX idx_deposit_transactions_created_at ON public.deposit_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all transactions
CREATE POLICY "Admins can manage deposit transactions"
  ON public.deposit_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own transactions
CREATE POLICY "Users can view their own deposit transactions"
  ON public.deposit_transactions
  FOR SELECT
  USING (auth.uid() = user_id);
