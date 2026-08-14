ALTER TABLE public.pricing_config ADD COLUMN effective_from date NOT NULL DEFAULT '1970-01-01';
ALTER TABLE public.system_settings ADD COLUMN peak_rate_effective_from date;
ALTER TABLE public.profiles ADD COLUMN hour_credit_balance numeric DEFAULT 0 NOT NULL;
ALTER TABLE public.gift_cards ADD COLUMN credit_hours numeric;

CREATE TABLE public.hour_credit_transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    amount numeric not null,
    balance_before numeric not null,
    balance_after numeric not null,
    transaction_type text not null,
    description text,
    related_booking_id uuid references public.bookings(id) on delete set null,
    related_gift_card_id uuid references public.gift_cards(id) on delete set null,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamp with time zone not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hour_credit_transactions TO authenticated;
GRANT ALL ON public.hour_credit_transactions TO service_role;

ALTER TABLE public.hour_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own hour credit transactions"
ON public.hour_credit_transactions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage hour credit transactions"
ON public.hour_credit_transactions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));