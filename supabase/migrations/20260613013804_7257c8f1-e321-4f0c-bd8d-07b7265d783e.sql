
ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'email_recipient',
  ADD COLUMN IF NOT EXISTS redemption_code text,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.gift_cards DROP CONSTRAINT IF EXISTS gift_cards_status_check;
ALTER TABLE public.gift_cards
  ADD CONSTRAINT gift_cards_status_check
  CHECK (status IN ('pending_payment','pending','scheduled','redeemed','cancelled'));

ALTER TABLE public.gift_cards DROP CONSTRAINT IF EXISTS gift_cards_delivery_method_check;
ALTER TABLE public.gift_cards
  ADD CONSTRAINT gift_cards_delivery_method_check
  CHECK (delivery_method IN ('email_recipient','print_to_sender','both'));

CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_redemption_code_uidx
  ON public.gift_cards(redemption_code)
  WHERE redemption_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS gift_cards_stripe_session_idx
  ON public.gift_cards(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
